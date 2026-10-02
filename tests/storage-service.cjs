'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const H = require('./downloads/harness.cjs');
const A = require('./downloads/assertions.cjs');
const F = require('./downloads/fixtures.cjs');
const { createProvider, REF, INPUT, HOST, MIME } = require('./downloads/storage-provider.cjs');
function scenario(name, fn, makeAdapter) {
  test('storage service: ' + name, { timeout: 10000 }, async t => {
    const provider = createProvider();
    const h = await H.setup(t, { storageAdapter: makeAdapter ? makeAdapter(provider) : provider.adapter });
    await fn(h, provider);
  });
}
scenario('no HEAD/signing in presentation, admission, countdown, status or token issuance', async (h, p) => {
  const c = await h.actor(); await h.fixture.presentation(F.ids.app);
  const r = await A.admitted(await h.request(c));
  await A.error(await h.token(c, r.request_id), 425, 'DOWNLOAD_NOT_READY');
  A.noPrivate(await A.json(await h.status(c, r.request_id)));
  h.clock.set(A.timestamp(r.ready_at)); const token = await A.issued(await h.token(c, r.request_id), r);
  A.noPrivate(await A.json(await h.status(c, r.request_id)));
  assert.equal(p.calls.length, 0); assert.equal((await h.fixture.snapshot()).storageCalls.length, 0);
  const response = await h.redeem(c, r.request_id, token.token);
  assert.equal(response.status, 303); assert.equal(await response.text(), '');
  assert.equal(p.calls.filter(x => x.method === 'SIGN_GET').length, 1);
});
scenario('redemption sends exact database object, 300s GET input and returns empty 303; no APK proxy', async (h, p) => {
  const c = await h.actor(), { r, token } = await h.grant(c), response = await h.redeem(c, r.request_id, token.token);
  assert.equal(response.status, 303); A.headers(response); assert.equal(response.body, null);
  assert.equal(await response.text(), ''); assert.notEqual(response.headers.get('content-type'), MIME);
  assert.equal(p.calls.length, 2); assert.deepEqual(p.calls[0].ref, REF);
  assert.deepEqual(p.calls[1].input, { filename: INPUT.filename, contentType: MIME,
    requestId: r.request_id, ref: REF, expiresInSeconds: 300 });
  assert.ok(p.calls.every(x => x.method === 'HEAD' || x.method === 'SIGN_GET'), 'no object GET/bytes performed by Next.js');
  const url = response.headers.get('location'), parsed = new URL(url);
  assert.equal(parsed.hostname, HOST); assert.equal(parsed.searchParams.get('response-content-type'), MIME);
  assert.equal(parsed.searchParams.get('response-content-disposition'), 'attachment; filename="qa.apk"');
  const snapshot = await h.fixture.snapshot(); assert.equal(snapshot.redemptionEvents.length, 1);
  assert.ok(!JSON.stringify(snapshot.persisted).includes(url), 'signed URL is not persisted');
  const status = await A.json(await h.status(c, r.request_id)); A.noPrivate(status); assert.equal(status.state, 'redeemed');
});
for (const [name, metadata] of [
  ['SHA-256 mismatch', { sha256: 'f'.repeat(64) }],
  ['exact size mismatch', { sizeBytes: INPUT.sizeBytes + 1n }],
  ['exact MIME mismatch', { contentType: 'application/octet-stream' }],
  ['wrong object version', { objectVersion: 'qa-v2' }],
]) scenario(name + ' quarantines only file, disables delivery, preserves unconsumed token', async (h, p) => {
  const c = await h.actor(), { r, token } = await h.grant(c);
  await A.error(await h.redeem(c, r.request_id, token.token), 503, 'FILE_INTEGRITY_UNAVAILABLE');
  const snapshot = await h.fixture.snapshot(), file = snapshot.persisted.files.find(f => f.id === F.ids.file);
  assert.equal(file.scan_status, 'quarantined'); assert.equal(file.active, false);
  assert.equal(snapshot.persisted.files.find(f => f.id === F.ids.otherFile).scan_status, 'verified');
  assert.equal(snapshot.requests[0].state, 'issued'); assert.equal(snapshot.requests[0].consumed_at, null);
  assert.equal(snapshot.requests[0].token_hash, require('../src/lib/downloads/rules.ts').hashSecret(token.token));
  assert.equal(snapshot.redemptionEvents.length, 0); assert.equal(p.calls.filter(x => x.method === 'SIGN_GET').length, 0);
  assert.equal((await h.fixture.presentation(F.ids.app)).file?.file_id === F.ids.file, false);
  const denial = await h.redeem(c, r.request_id, token.token); assert.ok([404, 410].includes(denial.status));
  assert.equal(denial.headers.get('location'), null); assert.equal(p.calls.length, 1);
}, p => ({ ...p.adapter, headObject: async (...args) => ({ ...await p.adapter.headObject(...args), ...metadata }) }));
for (const [name, mutate] of [
  ['wrong object', g => { const u = new URL(g.url); u.pathname += '.other'; return { ...g, url: u.href }; }],
  ['wrong signed version', g => { const u = new URL(g.url); u.searchParams.set('versionId', 'qa-v2'); return { ...g, url: u.href }; }],
  ['expired grant', g => ({ ...g, expiresAt: new Date(Date.now() - 1) })],
]) scenario(name + ' denies disclosure and token consumption without quarantining valid metadata', async (h) => {
  const c = await h.actor(), { r, token } = await h.grant(c);
  const response = await h.redeem(c, r.request_id, token.token); await A.error(response, 503, 'STORAGE_UNAVAILABLE');
  assert.equal(response.headers.get('retry-after'), '10');
  const snapshot = await h.fixture.snapshot(); assert.equal(snapshot.redemptionEvents.length, 0);
  assert.equal(snapshot.requests[0].state, 'issued'); assert.equal(snapshot.requests[0].consumed_at, null);
  assert.equal(snapshot.persisted.files.find(f => f.id === F.ids.file).scan_status, 'verified');
}, p => ({ ...p.adapter, createDeliveryGrant: async (...args) => mutate(await p.adapter.createDeliveryGrant(...args)) }));
scenario('grant falls below 30s after preparation; final SQL-time validation denies disclosure', async (h, p) => {
  const c = await h.actor(), { r, token } = await h.grant(c);
  const sign = p.adapter.createDeliveryGrant, matches = p.adapter.matchesObject;
  p.adapter.createDeliveryGrant = (input, signal) => sign({ ...input, expiresInSeconds: 31 }, signal);
  let first = true;
  p.adapter.matchesObject = (...args) => {
    const result = matches(...args);
    // Move only the harness clock after the first validation, before the final DB transaction.
    if (first) { first = false; h.clock.advance(1001); }
    return result;
  };
  await A.error(await h.redeem(c, r.request_id, token.token), 503, 'STORAGE_UNAVAILABLE');
  assert.equal((await h.fixture.snapshot()).redemptionEvents.length, 0);
});
scenario('permission outage maps safe 503, circuit blocks repeat HEAD, token survives and retry recovers', async (h, p) => {
  const c = await h.actor(), { r, token } = await h.grant(c), original = p.adapter.headObject;
  p.adapter.headObject = async () => { throw Error('AccessDenied QA_SIGNING_SECRET QA_SQL_STACK'); };
  let response = await h.redeem(c, r.request_id, token.token);
  await A.error(response, 503, 'STORAGE_UNAVAILABLE'); assert.equal(response.headers.get('retry-after'), '10');
  p.adapter.headObject = original;
  response = await h.redeem(c, r.request_id, token.token); await A.error(response, 503, 'STORAGE_UNAVAILABLE');
  const failed = await h.fixture.snapshot(); assert.equal(failed.storageCalls.length, 1);
  assert.equal(failed.requests[0].state, 'issued'); assert.equal(failed.requests[0].consumed_at, null);
  assert.equal(failed.persisted.files.find(f => f.id === F.ids.file).scan_status, 'verified');
  h.clock.advance(10000); response = await h.redeem(c, r.request_id, token.token);
  // Circuit has recovered, but two failed attempts still spent the real 2-token/5-per-minute bucket.
  const rate = await A.error(response, 429, 'RATE_LIMITED'); A.retry(response, rate);
  h.clock.set(A.timestamp(rate.error.retry_at)); response = await h.redeem(c, r.request_id, token.token);
  assert.equal(response.status, 303); assert.equal(await response.text(), '');
});
