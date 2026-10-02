'use strict';
// Executable delivery expectations against a mock boundary ONLY.
// These cases must be rerun against the selected provider before real rollout.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const H = require('./downloads/harness.cjs');
const F = require('./downloads/fixtures.cjs');
const { createProvider, REF, INPUT, HOST, MIME } = require('./downloads/storage-provider.cjs');
H.blockExternalIO();
const sign = (p, ttl = 300) => p.adapter.createDeliveryGrant({ ...INPUT, ref: REF, expiresInSeconds: ttl }, new AbortController().signal);

test('mock provider contract: private unsigned GET/HEAD deny with no bytes', async () => {
  const p = createProvider();
  for (const method of ['GET', 'HEAD']) {
    const result = p.request('https://' + HOST + '/' + REF.key, { method });
    assert.equal(result.status, 403); assert.equal(await result.text(), '');
  }
});
test('mock provider contract: signed GET delivers only tiny inert fixture, correct MIME and attachment', async () => {
  const p = createProvider(), g = await sign(p), response = p.request(g.url);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), MIME);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="qa.apk"');
  assert.equal(response.headers.get('content-length'), String(F.bytes.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), F.bytes);
  assert.ok(F.bytes.length < 128, 'tiny inert fixture, not an APK');
});
for (const method of ['HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'])
  test(`mock provider contract: GET signature cannot authorize ${method}`, async () => {
    const p = createProvider(), g = await sign(p), response = p.request(g.url, { method });
    assert.equal(response.status, 403); assert.equal(await response.text(), '');
  });
test('mock provider contract: reusable ranges resume with same grant and unsigned Range header', async () => {
  const p = createProvider(), g = await sign(p), a = p.request(g.url, { range: 'bytes=0-9' }), b = p.request(g.url, { range: 'bytes=10-' });
  assert.equal(a.status, 206); assert.equal(b.status, 206);
  assert.equal(a.headers.get('accept-ranges'), 'bytes'); assert.equal(a.headers.get('content-range'), `bytes 0-9/${F.bytes.length}`);
  assert.equal(b.headers.get('content-range'), `bytes 10-${F.bytes.length - 1}/${F.bytes.length}`);
  assert.deepEqual(Buffer.concat([Buffer.from(await a.arrayBuffer()), Buffer.from(await b.arrayBuffer())]), F.bytes);
  assert.deepEqual(Buffer.from(await p.request(g.url, { range: 'bytes=0-9' }).arrayBuffer()), F.bytes.subarray(0, 10));
});
test('mock provider contract: out-of-bounds range returns 416', async () => {
  const p = createProvider(), g = await sign(p), response = p.request(g.url, { range: 'bytes=999-' });
  assert.equal(response.status, 416); assert.equal(response.headers.get('content-range'), 'bytes */' + F.bytes.length);
  assert.equal(await response.text(), '');
});
for (const [name, change] of [
  ['different key', u => { u.pathname += '.other'; }],
  ['different version', u => { u.searchParams.set('versionId', 'qa-v2'); }],
  ['different MIME', u => { u.searchParams.set('response-content-type', 'text/html'); }],
  ['different disposition', u => { u.searchParams.set('response-content-disposition', 'inline'); }],
]) test('mock provider contract: tampered ' + name + ' cannot read bytes', async () => {
  const p = createProvider(), g = await sign(p), url = new URL(g.url); change(url);
  const response = p.request(url.href); assert.equal(response.status, 403); assert.equal(await response.text(), '');
});
for (const ttl of [30, 300]) test(`mock provider contract: ${ttl}s expiry denies new GET/resume at boundary`, async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-02T00:00:00Z') }); t.after(() => t.mock.timers.reset());
  const p = createProvider(), g = await sign(p, ttl); assert.equal(g.expiresAt.getTime() - Date.now(), ttl * 1000);
  t.mock.timers.tick(ttl * 1000 - 1); const started = p.request(g.url);
  assert.equal(started.status, 200); assert.equal(p.request(g.url, { range: 'bytes=0-9' }).status, 206);
  t.mock.timers.tick(1);
  for (const options of [{}, { range: 'bytes=10-' }]) {
    const response = p.request(g.url, options); assert.equal(response.status, 403); assert.equal(await response.text(), '');
  }
  // Expiry limits new requests; it does not imply an already-started transfer must stop.
  assert.deepEqual(Buffer.from(await started.arrayBuffer()), F.bytes);
});
test('mock provider contract: pre-aborted signal prevents HEAD and signing', async () => {
  const p = createProvider(), c = new AbortController(); c.abort();
  await assert.rejects(p.adapter.headObject(REF, c.signal), e => e.name === 'AbortError');
  await assert.rejects(p.adapter.createDeliveryGrant({ ...INPUT, ref: REF, expiresInSeconds: 300 }, c.signal), e => e.name === 'AbortError');
  assert.equal(p.calls.length, 0);
});
