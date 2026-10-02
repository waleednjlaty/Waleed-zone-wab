'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const H = require('./downloads/harness.cjs');
const { createProvider, REF, INPUT, HOST, MIME } = require('./downloads/storage-provider.cjs');
require('./helpers/typescript.cjs');
H.blockExternalIO();
function runtime() {
  delete require.cache[require.resolve('../src/lib/downloads/storage.ts')];
  const load = Module._load;
  Module._load = function(name, ...args) { return name === 'server-only' ? {} : load.call(this, name, ...args); };
  try { return require('../src/lib/downloads/storage.ts'); } finally { Module._load = load; }
}
const { DownloadError } = require('../src/lib/downloads/rules.ts');
const fails = code => error => error instanceof DownloadError && error.status === 503 && error.code === code;
const prepare = (r, adapter, input = INPUT, ref = REF) => r.prepareDelivery(adapter, ref, input, [HOST]);
const grant = (now, ttl = 60000) => ({ url: `https://${HOST}/${REF.key}?signature=opaque%2Bkeep%2Fexact`,
  deliveryHost: HOST, expiresAt: new Date(now.getTime() + ttl) });

test('storage: HEAD metadata precedes signing; exact ref, trusted digest, APK MIME and attachment input', async () => {
  const r = runtime(), p = createProvider(), result = await prepare(r, p.adapter);
  assert.equal(p.calls.length, 2);
  assert.equal(p.calls[0].method, 'HEAD'); assert.equal(p.calls[1].method, 'SIGN_GET');
  assert.deepEqual(p.calls[0].ref, REF);
  assert.deepEqual(p.calls[1].input, { ref: REF, expiresInSeconds: 300,
    filename: INPUT.filename, contentType: MIME, requestId: INPUT.requestId });
  assert.ok(p.calls[0].signal instanceof AbortSignal);
  assert.equal(p.calls[0].signal, p.calls[1].signal); assert.equal(p.calls[0].signal.aborted, false);
  assert.equal(p.adapter.matchesObject(result, REF), true);
});
for (const [name, patch] of [
  ['size one byte smaller', { sizeBytes: INPUT.sizeBytes - 1n }],
  ['size one byte larger', { sizeBytes: INPUT.sizeBytes + 1n }],
  ['size above Number safe precision', { sizeBytes: 9007199254740993n }],
  ['size wrong representation', { sizeBytes: Number(INPUT.sizeBytes) }],
  ['MIME octet stream', { contentType: 'application/octet-stream' }],
  ['MIME case difference', { contentType: MIME.toUpperCase() }],
  ['MIME with parameters', { contentType: MIME + '; charset=utf-8' }],
  ['SHA-256 mismatch', { sha256: 'f'.repeat(64) }],
  ['missing SHA-256', { sha256: undefined }],
  ['ETag is not trusted SHA-256', { sha256: '"d41d8cd98f00b204e9800998ecf8427e-2"' }],
  ['wrong object version', { objectVersion: 'qa-v2' }],
  ['missing required object version', { objectVersion: undefined }],
]) test('storage: reject ' + name + ' before signing', async () => {
  const r = runtime(), p = createProvider();
  const adapter = { ...p.adapter, headObject: async (ref, signal) => ({ ...await p.adapter.headObject(ref, signal), ...patch }) };
  await assert.rejects(prepare(r, adapter), fails('FILE_INTEGRITY_UNAVAILABLE'));
  assert.equal(p.calls.filter(x => x.method === 'SIGN_GET').length, 0);
});
test('storage: provider version optional only when reference has no version', async () => {
  const r = runtime(), p = createProvider(), ref = { backend: REF.backend, key: REF.key };
  let received;
  const adapter = { headObject: async () => ({ sizeBytes: INPUT.sizeBytes, sha256: INPUT.sha256, contentType: MIME }),
    createDeliveryGrant: async input => { received = input.ref; return grant(new Date()); }, matchesObject: (_, exact) => exact === ref };
  await prepare(r, adapter, INPUT, ref); assert.equal(received, ref); assert.equal(p.calls.length, 0);
});
test('storage: exact bigint size equality above Number precision; adjacent byte denied', async () => {
  const r = runtime(), sizeBytes = 9007199254740993n;
  const meta = { sizeBytes, contentType: MIME, sha256: INPUT.sha256, objectVersion: REF.objectVersion };
  let signs = 0;
  const adapter = { headObject: async () => ({ ...meta }), createDeliveryGrant: async () => { signs++; return grant(new Date()); }, matchesObject: () => true };
  await prepare(r, adapter, { ...INPUT, sizeBytes }); assert.equal(signs, 1);
  meta.sizeBytes--;
  await assert.rejects(prepare(r, adapter, { ...INPUT, sizeBytes }), fails('FILE_INTEGRITY_UNAVAILABLE'));
  assert.equal(signs, 1);
});
for (const ttl of [30000, 30001, 299999, 300000]) test(`storage: TTL ${ttl}ms accepted`, () => {
  const now = new Date('2026-10-02T00:00:00Z'), g = grant(now, ttl);
  assert.equal(runtime().validateGrant(g, REF, { matchesObject: () => true }, [HOST], now), g);
});
for (const ttl of [-1, 0, 29999, 300001]) test(`storage: TTL ${ttl}ms denied`, () => {
  const now = new Date('2026-10-02T00:00:00Z');
  assert.throws(() => runtime().validateGrant(grant(now, ttl), REF, { matchesObject: () => true }, [HOST], now), fails('STORAGE_UNAVAILABLE'));
});
for (const expiry of [new Date(NaN), '2026-10-02T00:01:00Z', null]) test(`storage: invalid expiry ${String(expiry)} denied`, () => {
  const now = new Date();
  assert.throws(() => runtime().validateGrant({ ...grant(now), expiresAt: expiry }, REF, { matchesObject: () => true }, [HOST], now), fails('STORAGE_UNAVAILABLE'));
});
for (const [name, url] of [
  ['HTTP', `http://${HOST}/a`], ['protocol-relative', `//${HOST}/a`], ['malformed', 'not a URL'],
  ['wrong host', 'https://evil.example.test/a'], ['allowlist suffix attack', `https://${HOST}.evil.example.test/a`],
  ['username', `https://user@${HOST}/a`], ['password', `https://user:secret@${HOST}/a`],
  ['fragment', `https://${HOST}/a#secret`], ['custom port', `https://${HOST}:444/a`],
]) test('storage: delivery rejects ' + name, () => {
  const now = new Date();
  assert.throws(() => runtime().validateGrant({ ...grant(now), url }, REF, { matchesObject: () => true }, [HOST], now), fails('STORAGE_UNAVAILABLE'));
});
test('storage: allowed host still requires matching declared deliveryHost and nonempty allowlist', () => {
  const r = runtime(), now = new Date(), g = grant(now), adapter = { matchesObject: () => true };
  assert.throws(() => r.validateGrant({ ...g, deliveryHost: 'evil.example.test' }, REF, adapter, [HOST], now), fails('STORAGE_UNAVAILABLE'));
  assert.throws(() => r.validateGrant(g, REF, adapter, [], now), fails('STORAGE_UNAVAILABLE'));
});
test('storage: grant retains original signed string without URL reserialization', () => {
  const now = new Date(), g = grant(now); g.url += '&response-content-disposition=attachment%3B%20filename%3D%22qa.apk%22';
  assert.equal(runtime().validateGrant(g, REF, { matchesObject: () => true }, [HOST], now).url, g.url);
});
for (const [name, mutate] of [
  ['another key', url => { url.pathname = '/artifacts/other/qa.apk'; }],
  ['prefix only', url => { url.pathname = '/artifacts/'; }],
  ['key suffix', url => { url.pathname += '.backup'; }],
  ['another object version', url => { url.searchParams.set('versionId', 'qa-v2'); }],
  ['missing object version', url => { url.searchParams.delete('versionId'); }],
  ['forged expiry', url => { url.searchParams.set('expires', String(Date.now() + 299000)); }],
]) test('storage: exact-object gate rejects ' + name, async () => {
  const r = runtime(), p = createProvider();
  const adapter = { ...p.adapter, createDeliveryGrant: async (...args) => {
    const g = await p.adapter.createDeliveryGrant(...args), url = new URL(g.url); mutate(url); return { ...g, url: url.href };
  } };
  await assert.rejects(prepare(r, adapter), fails('STORAGE_UNAVAILABLE'));
});
for (const stage of ['headObject', 'createDeliveryGrant', 'matchesObject']) test(`storage: ${stage} diagnostics map to safe retryable error and circuit opens`, async () => {
  const r = runtime(), p = createProvider(), adapter = { ...p.adapter, [stage]: () => { throw Error('QA_SIGNING_SECRET QA_SQL_STACK'); } };
  await assert.rejects(prepare(r, adapter), error => fails('STORAGE_UNAVAILABLE')(error) && error.retrySeconds === 10 && !error.message.includes('QA_'));
  const previous = p.calls.length;
  await assert.rejects(prepare(r, p.adapter), error => fails('STORAGE_UNAVAILABLE')(error) && error.retrySeconds === 10);
  assert.equal(p.calls.length, previous);
});
test('storage: missing object preserves 404 and integrity failures do not trip outage circuit', async () => {
  const r = runtime(), p = createProvider();
  await assert.rejects(prepare(r, { ...p.adapter, headObject: async () => { throw new DownloadError(404, 'FILE_UNAVAILABLE'); } }), e => e.status === 404 && e.code === 'FILE_UNAVAILABLE');
  await assert.rejects(prepare(r, { ...p.adapter, headObject: async () => ({ ...require('./downloads/fixtures.cjs').fixtureData().storage.metadata, sha256: 'f'.repeat(64) }) }), fails('FILE_INTEGRITY_UNAVAILABLE'));
  await prepare(r, p.adapter);
});
for (const stage of ['headObject', 'createDeliveryGrant']) test(`storage: 3s total timeout aborts ${stage} and opens circuit; recovery after 10s`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-02T00:00:00Z') });
  t.after(() => t.mock.timers.reset());
  const r = runtime(), p = createProvider(); let signal, aborted = 0;
  const adapter = { ...p.adapter, [stage]: async (...args) => {
    signal = args[1]; return new Promise((_, reject) => signal.addEventListener('abort', () => { aborted++; reject(signal.reason); }, { once: true }));
  } };
  const pending = prepare(r, adapter);
  await Promise.resolve(); await Promise.resolve();
  assert.ok(signal instanceof AbortSignal); t.mock.timers.tick(2999); assert.equal(signal.aborted, false);
  const rejected = assert.rejects(pending, fails('STORAGE_UNAVAILABLE'));
  t.mock.timers.tick(1); await rejected; assert.equal(signal.aborted, true); assert.equal(aborted, 1);
  const n = p.calls.length;
  await assert.rejects(prepare(r, p.adapter), fails('STORAGE_UNAVAILABLE')); assert.equal(p.calls.length, n);
  t.mock.timers.tick(9999); await assert.rejects(prepare(r, p.adapter), fails('STORAGE_UNAVAILABLE'));
  t.mock.timers.tick(1); await prepare(r, p.adapter);
});
test('storage: timeout bounds even a provider that ignores AbortSignal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  const r = runtime(), p = createProvider(); let signal;
  const pending = prepare(r, { ...p.adapter, headObject: async (_, s) => { signal = s; return new Promise(() => {}); } });
  const rejected = assert.rejects(pending, fails('STORAGE_UNAVAILABLE')); t.mock.timers.tick(3000); await rejected; assert.equal(signal.aborted, true);
});
test('storage: HEAD and signing share one total 3s deadline, not 3s per operation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  const r = runtime(), p = createProvider(); let finishHead, signSignal;
  const adapter = { ...p.adapter,
    headObject: (...args) => new Promise(resolve => { finishHead = () => resolve(p.adapter.headObject(...args)); }),
    createDeliveryGrant: async (_, signal) => { signSignal = signal; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); },
  };
  const pending = prepare(r, adapter), rejected = assert.rejects(pending, fails('STORAGE_UNAVAILABLE'));
  t.mock.timers.tick(2000); finishHead();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.ok(signSignal instanceof AbortSignal); t.mock.timers.tick(999); assert.equal(signSignal.aborted, false);
  t.mock.timers.tick(1); await rejected; assert.equal(signSignal.aborted, true);
});
test('storage: successful work clears deadline without a late abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  const r = runtime(), p = createProvider(); await prepare(r, p.adapter);
  t.mock.timers.tick(3001); assert.ok(p.calls.every(x => !x.signal.aborted)); await prepare(r, p.adapter);
});
test('storage: maximum two preparations; third denied without storage and slots released', async () => {
  const r = runtime(), p = createProvider(), release = [];
  const adapter = { ...p.adapter, headObject: (...args) => new Promise(resolve => release.push(() => resolve(p.adapter.headObject(...args)))) };
  const first = prepare(r, adapter), second = prepare(r, adapter);
  assert.equal(release.length, 2);
  await assert.rejects(prepare(r, p.adapter), e => fails('STORAGE_UNAVAILABLE')(e) && e.retrySeconds === 10);
  assert.equal(p.calls.length, 0); release.forEach(fn => fn()); await Promise.all([first, second]);
  await prepare(r, p.adapter);
});
test('storage: invalid attachment filename blocks all provider calls', async () => {
  const r = runtime(), p = createProvider();
  for (const filename of ['../qa.apk', 'qa\r\nInjected.apk', 'qa.exe', ''])
    await assert.rejects(prepare(r, p.adapter, { ...INPUT, filename }), e => e.status === 404 && e.code === 'FILE_UNAVAILABLE');
  assert.equal(p.calls.length, 0);
});
