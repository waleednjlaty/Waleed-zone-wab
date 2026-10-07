'use strict';
// Real adapter + local SDK GET presigning + actual service/HTTP/SQL. Only HEAD
// transport is injected; harness blocks all external I/O and contains inert bytes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
require('./helpers/typescript.cjs');
const load = Module._load;
Module._load = function(name, ...args) { return name === 'server-only' ? {} : load.call(this, name, ...args); };
const { S3DownloadStorage, APK_MIME } = require('../src/lib/downloads/adapters/s3.ts');
Module._load = load;
const H = require('./downloads/harness.cjs');
const A = require('./downloads/assertions.cjs');
const F = require('./downloads/fixtures.cjs');
const config = { backend: 'railway-s3', endpoint: 'https://delivery.example.test', region: 'auto', bucket: 'wz-fixture',
  accessKeyId: 'INTEGRATION_ONLY_ACCESS', secretAccessKey: 'integration-only-secret',
  allowedHosts: ['delivery.example.test'], forcePathStyle: true, versioningEnabled: false,
  // Cold SDK signing can exceed 100ms on loaded CI; deadline-specific tests use their own budgets.
  checksumSource: 'metadata', timeoutMs: 1000 };
async function setup(t, patch = {}) {
  const calls = [], data = F.fixtureData();
  data.files[0].storage_backend = 'railway-s3'; data.files[0].storage_object_version = null;
  data.files[1].active = false;
  const adapter = new S3DownloadStorage(config, { client: { async send(command) {
    calls.push(command);
    return { ContentLength: F.bytes.length, ContentType: APK_MIME, Metadata: { sha256: F.sha256 }, ...patch };
  } } });
  const h = await H.setup(t, { data, storageAdapter: adapter, storageBackend: 'railway-s3' });
  return { h, calls };
}
test('integrated real S3: no provider work before redemption, exact authenticated HEAD then native empty 303', async t => {
  const { h, calls } = await setup(t), c = await h.actor();
  A.noPrivate(await h.fixture.presentation(F.ids.app));
  const r = await A.admitted(await h.request(c));
  await A.error(await h.token(c, r.request_id), 425, 'DOWNLOAD_NOT_READY');
  A.noPrivate(await A.json(await h.status(c, r.request_id)));
  h.clock.set(A.timestamp(r.ready_at)); const token = await A.issued(await h.token(c, r.request_id), r);
  assert.equal(calls.length, 0);
  const response = await h.redeem(c, r.request_id, token.token);
  assert.equal(response.status, 303); assert.equal(response.body, null); assert.equal(await response.text(), '');
  assert.equal(calls.length, 1); assert.equal(calls[0].constructor.name, 'HeadObjectCommand');
  assert.deepEqual(calls[0].input, { Bucket: 'wz-fixture', Key: F.storageKey });
  const url = new URL(response.headers.get('location'));
  assert.equal(url.protocol, 'https:'); assert.equal(url.pathname, '/wz-fixture/' + F.storageKey);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.equal(url.searchParams.get('response-content-type'), APK_MIME);
  assert.match(url.searchParams.get('response-content-disposition'), /^attachment; filename="qa.apk";/);
  assert.ok(!url.href.includes(config.secretAccessKey));
  const persisted = await h.fixture.snapshot(); assert.equal(persisted.redemptionEvents.length, 1);
  assert.ok(!JSON.stringify(persisted.persisted).includes(response.headers.get('location')));
  A.noPrivate(await A.json(await h.status(c, r.request_id)));
});
for (const [label, patch] of [['wrong size', { ContentLength: F.bytes.length + 1 }],
  ['wrong MIME', { ContentType: 'application/octet-stream' }], ['missing SHA', { Metadata: {} }],
  ['wrong SHA/key', { Metadata: { sha256: 'f'.repeat(64) } }]]) {
  test(`integrated real S3: ${label} quarantines without signing or consuming token`, async t => {
    const { h, calls } = await setup(t, patch), c = await h.actor(), { r, token } = await h.grant(c);
    const response = await h.redeem(c, r.request_id, token.token);
    await A.error(response, 503, 'FILE_INTEGRITY_UNAVAILABLE'); assert.equal(response.headers.get('location'), null);
    const state = await h.fixture.snapshot(), file = state.persisted.files.find(f => f.id === F.ids.file);
    assert.equal(file.scan_status, 'quarantined'); assert.equal(file.active, false);
    assert.equal(state.requests[0].consumed_at, null); assert.equal(calls.length, 1);
    assert.ok(state.storageCalls.every(call => call.operation !== 'createDeliveryGrant'));
  });
}
for (const [label, patch] of [['wrong UUID key', { storage_key: F.storageKey.replace(F.ids.file, F.ids.otherFile) }],
  ['unsupported Railway version', { storage_object_version: 'invented-version' }]]) {
  test(`integrated real S3: ${label} rejects presentation/admission before provider work`, async t => {
    const { h, calls } = await setup(t), c = await h.actor();
    await h.fixture.patch('file', { id: F.ids.file, ...patch });
    assert.equal((await h.fixture.presentation(F.ids.app)).file, null);
    await A.error(await h.request(c), 404, 'FILE_UNAVAILABLE'); assert.equal(calls.length, 0);
  });
}
test('integrated real S3: database constraint rejects a missing object key', async t => {
  const { h, calls } = await setup(t);
  await assert.rejects(h.fixture.patch('file', { id: F.ids.file, storage_key: '' }), error => error.code === '23514');
  assert.equal(calls.length, 0);
});
for (const [label, patch] of [['deployment disabled', { deployment_enabled: false }], ['DB disabled', { enabled: false }]]) {
  test(`integrated real S3: ${label} stays ahead of storage`, async t => {
    const { h, calls } = await setup(t), c = await h.actor(), { r, token } = await h.grant(c);
    await h.fixture.patch('settings', patch);
    await A.error(await h.redeem(c, r.request_id, token.token), 503, 'DIRECT_DOWNLOAD_UNAVAILABLE');
    assert.equal(calls.length, 0);
  });
}
for (const label of ['missing adapter', 'withdrawn file']) {
  test(`integrated real S3: ${label} stays ahead of storage`, async t => {
    const { h, calls } = await setup(t), c = await h.actor(), { r, token } = await h.grant(c);
    if (label === 'missing adapter') await h.fixture.fault('adapterMissing', true);
    else await h.fixture.patch('file', { id: F.ids.file, active: false });
    await A.error(await h.redeem(c, r.request_id, token.token), 404, 'FILE_UNAVAILABLE');
    assert.equal(calls.length, 0);
  });
}
