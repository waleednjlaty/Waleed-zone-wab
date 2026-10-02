const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Readable } = require('node:stream');
const { createHash, createHmac } = require('node:crypto');
const Module = require('node:module');
require('./helpers/typescript.cjs');
const load = Module._load;
Module._load = function(name, ...args) { return name === 'server-only' ? {} : load.call(this, name, ...args); };
const { S3DownloadStorage, s3ConfigFromEnv, configuredStorageAdapters, validS3ObjectKey, APK_MIME } = require('../src/lib/downloads/adapters/s3.ts');
const { validateGrant, prepareDelivery, storageAdapters } = require('../src/lib/downloads/storage.ts');
const { DownloadError } = require('../src/lib/downloads/rules.ts');
Module._load = load;
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const sha = 'a'.repeat(64), id = '12345678-1234-4234-8234-123456789abc';
const key = `artifacts/${id}/${sha}.apk`, ref = { backend: 'railway-s3', key };
const config = { backend: 'railway-s3', endpoint: 'https://storage.example.test', region: 'auto', bucket: 'wz-fixture',
  accessKeyId: 'LOCAL_FIXTURE_ACCESS', secretAccessKey: 'local-fixture-secret-not-production',
  allowedHosts: ['wz-fixture.storage.example.test'], forcePathStyle: false, versioningEnabled: false,
  checksumSource: 'metadata', timeoutMs: 2500 };
const env = { DOWNLOAD_STORAGE_BACKEND: 'railway-s3', DOWNLOAD_S3_ENDPOINT: config.endpoint,
  DOWNLOAD_S3_REGION: config.region, DOWNLOAD_S3_BUCKET: config.bucket,
  DOWNLOAD_S3_ACCESS_KEY_ID: config.accessKeyId, DOWNLOAD_S3_SECRET_ACCESS_KEY: config.secretAccessKey,
  DOWNLOAD_ALLOWED_DELIVERY_HOSTS: config.allowedHosts[0] };
const controller = () => new AbortController();
const input = (patch = {}) => ({ ref, expiresInSeconds: 300, filename: 'Waleed Zone.apk', contentType: APK_MIME, requestId: 'local-fixture', ...patch });
const metadata = (patch = {}) => ({ ContentLength: 123, ContentType: APK_MIME, Metadata: { sha256: sha }, ...patch });
const fails = code => e => e instanceof DownloadError && e.code === code && e.message === code;
const fixture = (patch = {}, send = async () => metadata(), sign) => new S3DownloadStorage({ ...config, ...patch },
  { client: { send }, ...(sign ? { sign } : {}) });

test('S3 env contract: optional registry, fail-closed invalid config, frozen configured registry', () => {
  assert.equal(s3ConfigFromEnv({}), undefined);
  assert.deepEqual(configuredStorageAdapters({}), {});
  assert.deepEqual(storageAdapters, {});
  const parsed = s3ConfigFromEnv(env);
  assert.equal(parsed.forcePathStyle, false);
  assert.equal(parsed.versioningEnabled, false);
  assert.equal(parsed.timeoutMs, 2500);
  assert.equal(parsed.checksumSource, 'metadata');
  const registry = configuredStorageAdapters(env);
  assert.ok(registry['railway-s3'] instanceof S3DownloadStorage);
  assert.ok(Object.isFrozen(registry));
  for (const name of ['DOWNLOAD_S3_ENDPOINT', 'DOWNLOAD_S3_REGION', 'DOWNLOAD_S3_BUCKET', 'DOWNLOAD_S3_ACCESS_KEY_ID',
    'DOWNLOAD_S3_SECRET_ACCESS_KEY', 'DOWNLOAD_ALLOWED_DELIVERY_HOSTS']) {
    assert.throws(() => s3ConfigFromEnv({ ...env, [name]: '' }), fails('STORAGE_UNAVAILABLE'));
    assert.deepEqual(configuredStorageAdapters({ ...env, [name]: '' }), {});
  }
  for (const patch of [{ DOWNLOAD_STORAGE_BACKEND: 'unknown' }, { DOWNLOAD_S3_CHECKSUM_SOURCE: 'etag' },
    { DOWNLOAD_S3_FORCE_PATH_STYLE: 'yes' }, { DOWNLOAD_S3_VERSIONING_ENABLED: 'true' },
    { DOWNLOAD_S3_TIMEOUT_MS: '0' }, { DOWNLOAD_S3_TIMEOUT_MS: '2501' }, { DOWNLOAD_S3_TIMEOUT_MS: 'NaN' }])
    assert.throws(() => s3ConfigFromEnv({ ...env, ...patch }), fails('STORAGE_UNAVAILABLE'));
});

test('S3 configuration denies unsafe endpoint, bucket and delivery allowlist', () => {
  for (const endpoint of ['http://storage.example.test', 'https://user:password@storage.example.test',
    'https://storage.example.test:444', 'https://storage.example.test/path', 'https://storage.example.test?x=1',
    'https://storage.example.test#x']) assert.throws(() => fixture({ endpoint }), fails('STORAGE_UNAVAILABLE'));
  for (const bucket of ['../other', 'bucket.with.dots', 'Uppercase', 'a', 'ab-', 'a'.repeat(64)])
    assert.throws(() => fixture({ bucket }), fails('STORAGE_UNAVAILABLE'));
  for (const allowedHosts of [[], ['*.example.test'], ['https://storage.example.test'], ['evil.example.test'], ['storage.example.test:443']])
    assert.throws(() => fixture({ allowedHosts }), fails('STORAGE_UNAVAILABLE'));
});

test('S3 canonical immutable key validation rejects path/key injection before any network call', async () => {
  assert.equal(validS3ObjectKey(key), true);
  let calls = 0;
  const adapter = fixture({}, async () => { calls++; return metadata(); });
  for (const bad of ['/'.concat(key), key.replace('artifacts/', 'other/'), key.replace(id, '..'),
    key.replace('/' + sha, '//' + sha), key + '?x=1', key + '#x', key.replace('artifacts/', 'artifacts%2f'),
    key.replace('/', '\\'), key + '\n', key.replace('.apk', '.zip'), key.toUpperCase(), 'https://evil.test/a.apk']) {
    assert.equal(validS3ObjectKey(bad), false);
    await assert.rejects(adapter.headObject({ ...ref, key: bad }, controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
    await assert.rejects(adapter.createDeliveryGrant(input({ ref: { ...ref, key: bad } }), controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
  }
  await assert.rejects(adapter.headObject({ ...ref, backend: 'request-selected' }, controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
  assert.equal(calls, 0);
});

test('S3 HEAD authenticates exact bucket/key via real SDK request pipeline without sockets', async () => {
  let captured;
  const sdk = new S3Client({ endpoint: config.endpoint, region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 1,
    requestHandler: { async handle(request, options) {
      captured = { request, options };
      return { response: { statusCode: 200, headers: { 'content-length': '123', 'content-type': APK_MIME,
        'x-amz-meta-sha256': sha }, body: Readable.from([]) } };
    }, destroy() {} },
  });
  const adapter = new S3DownloadStorage(config, { client: sdk });
  assert.deepEqual(await adapter.headObject(ref, controller().signal), { sizeBytes: 123n, contentType: APK_MIME, sha256: sha });
  assert.equal(captured.request.method, 'HEAD');
  assert.equal(captured.request.hostname, config.allowedHosts[0]);
  assert.equal(captured.request.path, '/' + key);
  assert.match(captured.request.headers.authorization, /^AWS4-HMAC-SHA256 Credential=LOCAL_FIXTURE_ACCESS\//);
  assert.equal(captured.options.abortSignal.aborted, false);
  sdk.destroy();
});

test('S3 HEAD rejects absent/corrupt metadata and never substitutes ETag', async () => {
  for (const patch of [{ Metadata: undefined, ETag: sha }, { Metadata: { sha256: sha.toUpperCase() } },
    { Metadata: { sha256: 'a'.repeat(63) } }, { Metadata: { sha256: 'b'.repeat(64) } },
    { ContentLength: undefined }, { ContentLength: 0 }, { ContentLength: -1 }, { ContentLength: 1.5 },
    { ContentLength: Number.MAX_SAFE_INTEGER + 1 }, { ContentType: 'application/octet-stream' },
    { ContentType: APK_MIME + '; charset=utf-8' }, { DeleteMarker: true }])
    await assert.rejects(fixture({}, async () => metadata(patch)).headObject(ref, controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
});

test('S3 provider SHA-256 accepts canonical full object digest only', async () => {
  const checksum = Buffer.from(sha, 'hex').toString('base64');
  const adapter = fixture({ checksumSource: 'provider' }, async command => {
    assert.equal(command.input.ChecksumMode, 'ENABLED');
    return metadata({ ChecksumSHA256: checksum, ChecksumType: 'FULL_OBJECT', Metadata: undefined });
  });
  assert.equal((await adapter.headObject(ref, controller().signal)).sha256, sha);
  for (const patch of [{ ChecksumSHA256: undefined }, { ChecksumSHA256: checksum + '-2' },
    { ChecksumSHA256: checksum, ChecksumType: 'COMPOSITE' }, { ChecksumSHA256: 'bad' },
    { ChecksumSHA256: Buffer.from('b'.repeat(64), 'hex').toString('base64') }])
    await assert.rejects(fixture({ checksumSource: 'provider' }, async () => metadata(patch)).headObject(ref, controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
});

test('Railway denies object version requests; compatible versioned S3 pins HEAD and GET', async () => {
  await assert.rejects(fixture().headObject({ ...ref, objectVersion: 'v1' }, controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
  const versionRef = { ...ref, backend: 's3', objectVersion: 'version+/=123' };
  const adapter = fixture({ backend: 's3', versioningEnabled: true }, async command => {
    assert.ok(command instanceof HeadObjectCommand);
    assert.equal(command.input.VersionId, versionRef.objectVersion);
    return metadata({ VersionId: versionRef.objectVersion });
  });
  assert.equal((await adapter.headObject(versionRef, controller().signal)).objectVersion, versionRef.objectVersion);
  const grant = await adapter.createDeliveryGrant(input({ ref: versionRef }), controller().signal);
  assert.equal(new URL(grant.url).searchParams.get('versionId'), versionRef.objectVersion);
  assert.equal(adapter.matchesObject(grant, { ...versionRef, objectVersion: 'different' }), false);
  await assert.rejects(fixture({ backend: 's3', versioningEnabled: true }).headObject(versionRef, controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
  for (const objectVersion of ['', 'null', '\nsecret', 'a'.repeat(1025)])
    await assert.rejects(adapter.headObject({ ...versionRef, objectVersion }, controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
});

test('real SDK presigns GET, exact path, attachment/APK MIME, TTL; Range/If-Range remain unsigned', async () => {
  const adapter = fixture();
  for (const expiresInSeconds of [30, 60, 300]) {
    const before = Date.now();
    const grant = await adapter.createDeliveryGrant(input({ expiresInSeconds, filename: 'وليد زون.apk' }), controller().signal);
    const url = new URL(grant.url), p = url.searchParams;
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, config.allowedHosts[0]);
    assert.equal(url.pathname, '/' + key);
    assert.equal(p.get('X-Amz-Expires'), String(expiresInSeconds));
    assert.equal(p.get('X-Amz-SignedHeaders'), 'host');
    assert.equal(p.has('Range'), false);
    assert.equal(p.has('range'), false);
    assert.equal(p.get('response-content-type'), APK_MIME);
    assert.match(p.get('response-content-disposition'), /^attachment; filename=".+\.apk"; filename\*=UTF-8''%/);
    assert.equal(decodeURIComponent(p.get('response-content-disposition').split("UTF-8''")[1]), 'وليد زون.apk');
    assert.equal(p.get('response-cache-control'), 'private, no-store');
    assert.equal(url.href.includes(config.secretAccessKey), false);
    assert.equal(adapter.matchesObject(grant, ref), true);
    assert.ok(grant.expiresAt.getTime() <= before + expiresInSeconds * 1000);
    assert.ok(grant.expiresAt.getTime() > before + (expiresInSeconds - 1) * 1000);
    if (expiresInSeconds > 30) assert.equal(validateGrant(grant, ref, adapter, config.allowedHosts, new Date()).url, grant.url);
  }
});

test('SigV4 signature authorizes GET only and stays valid with arbitrary unsigned Range headers', async () => {
  const grant = await fixture().createDeliveryGrant(input(), controller().signal);
  const url = new URL(grant.url), p = url.searchParams;
  const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const hash = value => createHash('sha256').update(value).digest('hex');
  const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
  const scope = p.get('X-Amz-Credential').split('/').slice(1).join('/');
  const date = p.get('X-Amz-Date');
  const query = [...p.entries()].filter(([key]) => key !== 'X-Amz-Signature')
    .map(([key, value]) => [encode(key), encode(value)]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('&');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + config.secretAccessKey, date.slice(0, 8)), config.region), 's3'), 'aws4_request');
  const signature = method => {
    const canonical = [method, url.pathname, query, `host:${url.hostname}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    return createHmac('sha256', signingKey).update(['AWS4-HMAC-SHA256', date, scope, hash(canonical)].join('\n')).digest('hex');
  };
  assert.equal(signature('GET'), p.get('X-Amz-Signature'));
  for (const method of ['HEAD', 'PUT', 'POST', 'DELETE']) assert.notEqual(signature(method), p.get('X-Amz-Signature'));
  // Only host is signed: Range: bytes=0-99 and a later bytes=100- have the same GET canonical request.
  assert.equal(p.get('X-Amz-SignedHeaders'), 'host');
});

test('legacy Railway path style and generic S3 reuse preserve exact bucket/object', async () => {
  for (const backend of ['railway-s3', 's3']) {
    const adapter = fixture({ backend, forcePathStyle: true, allowedHosts: ['storage.example.test'] });
    const ownRef = { ...ref, backend };
    const grant = await adapter.createDeliveryGrant(input({ ref: ownRef }), controller().signal);
    assert.equal(new URL(grant.url).pathname, `/wz-fixture/${key}`);
    assert.equal(adapter.matchesObject(grant, ownRef), true);
    assert.equal(grant.deliveryHost, 'storage.example.test');
  }
});

test('signing rejects TTL, unsafe attachment names and MIME before invoking signer', async () => {
  let calls = 0;
  const adapter = fixture({}, undefined, async () => { calls++; return ''; });
  for (const expiresInSeconds of [0, 29, 301, 60.5, NaN, Infinity])
    await assert.rejects(adapter.createDeliveryGrant(input({ expiresInSeconds }), controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
  for (const filename of ['', '../file.apk', 'file\r\n.apk', 'file".apk', 'file%.apk', 'file;.apk', 'a'.repeat(180) + '.apk', 'file.zip'])
    await assert.rejects(adapter.createDeliveryGrant(input({ filename }), controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
  await assert.rejects(adapter.createDeliveryGrant(input({ contentType: 'text/html' }), controller().signal), fails('FILE_INTEGRITY_UNAVAILABLE'));
  assert.equal(calls, 0);
});

test('exact matching rejects foreign grants and every alteration of minted grant/ref', async () => {
  const adapter = fixture(), other = fixture();
  const grant = await adapter.createDeliveryGrant(input(), controller().signal);
  assert.equal(other.matchesObject(grant, ref), false);
  assert.equal(adapter.matchesObject({ ...grant }, ref), false);
  assert.equal(adapter.matchesObject(grant, { ...ref, key: key.replace(sha, 'b'.repeat(64)) }), false);
  assert.equal(adapter.matchesObject(grant, { ...ref, objectVersion: 'new' }), false);
  const original = grant.url;
  for (const url of [original.replace('https:', 'http:'), original.replace(config.allowedHosts[0], 'evil.test'),
    original.replace(sha + '.apk', 'b'.repeat(64) + '.apk'), original + '&versionId=other', original + '&uploadId=x',
    original + '#x', original.replace('X-Amz-Expires=300', 'X-Amz-Expires=301')]) {
    grant.url = url;
    assert.equal(adapter.matchesObject(grant, ref), false);
  }
  grant.url = original;
  grant.expiresAt = new Date(grant.expiresAt.getTime() + 1);
  assert.equal(adapter.matchesObject(grant, ref), false);
});

test('signer URL validation denies unexpected hosts, keys, versions and non-GET operations', async () => {
  const valid = await fixture().createDeliveryGrant(input(), controller().signal);
  for (const change of [u => u.replace('https:', 'http:'), u => u.replace(config.allowedHosts[0], 'evil.test'),
    u => u.replace('/artifacts/', '/wz-fixture/artifacts/'), u => u.replace(sha + '.apk', 'b'.repeat(64) + '.apk'),
    u => u + '&versionId=evil', u => u + '&partNumber=1', u => u + '&X-Amz-Expires=300',
    u => u.replace('X-Amz-SignedHeaders=host', 'X-Amz-SignedHeaders=host%3Brange')])
    await assert.rejects(fixture({}, undefined, async () => change(valid.url)).createDeliveryGrant(input(), controller().signal), fails('STORAGE_UNAVAILABLE'));
});

for (const [name, error, code] of [
  ['not found', { name: 'NotFound', $metadata: { httpStatusCode: 404 } }, 'FILE_UNAVAILABLE'],
  ['missing key', { name: 'NoSuchKey' }, 'FILE_UNAVAILABLE'],
  ['missing version', { name: 'NoSuchVersion' }, 'FILE_UNAVAILABLE'],
  ['denied', { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }, 'STORAGE_UNAVAILABLE'],
  ['throttled', { $metadata: { httpStatusCode: 429 } }, 'STORAGE_UNAVAILABLE'],
  ['provider failure', { $metadata: { httpStatusCode: 500 } }, 'STORAGE_UNAVAILABLE'],
  ['network error', new Error('private bucket/secret signed-url'), 'STORAGE_UNAVAILABLE'],
  ['null rejection', null, 'STORAGE_UNAVAILABLE'],
]) test(`S3 safe error mapping: ${name}`, async () => {
  await assert.rejects(fixture({}, async () => { throw error; }).headObject(ref, controller().signal), fails(code));
});

test('already aborted signal prevents HEAD/sign; caller cancellation aborts active authenticated request', async () => {
  const c = controller(); c.abort();
  let calls = 0;
  const adapter = fixture({}, async () => { calls++; return metadata(); });
  await assert.rejects(adapter.headObject(ref, c.signal), fails('STORAGE_UNAVAILABLE'));
  await assert.rejects(adapter.createDeliveryGrant(input(), c.signal), fails('STORAGE_UNAVAILABLE'));
  assert.equal(calls, 0);
  let signal;
  const hanging = fixture({}, async (_, options) => { signal = options.abortSignal; return new Promise(() => {}); });
  const active = controller(), pending = hanging.headObject(ref, active.signal);
  active.abort();
  await assert.rejects(pending, fails('STORAGE_UNAVAILABLE'));
  assert.equal(signal.aborted, true);
});

test('adapter timeout bounds both HEAD and slow signing; no grant escapes after cancellation', async () => {
  let signal;
  const adapter = fixture({ timeoutMs: 100 }, async (_, options) => { signal = options.abortSignal; return new Promise(() => {}); });
  await assert.rejects(adapter.headObject(ref, controller().signal), fails('STORAGE_UNAVAILABLE'));
  assert.equal(signal.aborted, true);
  await assert.rejects(fixture({ timeoutMs: 100 }, undefined, async () => new Promise(() => {}))
    .createDeliveryGrant(input(), controller().signal), fails('STORAGE_UNAVAILABLE'));
  const c = controller();
  const pending = fixture({}, undefined, async () => new Promise(() => {})).createDeliveryGrant(input(), c.signal);
  c.abort();
  await assert.rejects(pending, fails('STORAGE_UNAVAILABLE'));
});

test('existing prepareDelivery contract accepts real local S3 grant and checks DB size/hash', async () => {
  const adapter = fixture();
  const grant = await prepareDelivery(adapter, ref, { sizeBytes: 123n, sha256: sha, contentType: APK_MIME,
    filename: 'fixture.apk', requestId: 'local-fixture' }, config.allowedHosts);
  assert.equal(adapter.matchesObject(grant, ref), true);
  for (const patch of [{ sizeBytes: 124n }, { sha256: 'b'.repeat(64) }])
    await assert.rejects(prepareDelivery(adapter, ref, { sizeBytes: 123n, sha256: sha, contentType: APK_MIME,
      filename: 'fixture.apk', requestId: 'local-fixture', ...patch }, config.allowedHosts), fails('FILE_INTEGRITY_UNAVAILABLE'));
});
