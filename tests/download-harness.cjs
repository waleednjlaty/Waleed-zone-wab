'use strict';
// These tests validate the QA assertions, not the download implementation.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const A = require('./downloads/assertions.cjs');
const F = require('./downloads/fixtures.cjs');
const headers = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow, noarchive', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-type': 'application/json' };
const response = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });
const r = { request_id: '33333333-3333-4333-8333-333333333333', state: 'pending', server_time: '2026-10-02T04:40:00.000Z', ready_at: '2026-10-02T04:40:20.000Z', next_download_at: '2026-10-02T04:40:20.000Z', request_expires_at: '2026-10-02T04:45:20.000Z', wait_seconds: 20, status_url: '/api/downloads/requests/33333333-3333-4333-8333-333333333333' };
const admitted = x => response(x, 201, { Location: x.status_url });
test('QA assertion accepts exact documented admission DTO', async () => { await A.admitted(admitted(r)); });
test('QA assertion rejects client-only or 19.999s readiness', async () => { await assert.rejects(A.admitted(admitted({ ...r, ready_at: '2026-10-02T04:40:19.999Z' }))); });
test('QA assertion rejects accidental storage Location at admission', async () => { await assert.rejects(A.admitted(response(r, 201, { Location: F.deliveryUrl }))); });
test('QA assertion rejects private DTO fields and storage key', () => { for (const data of [{ storage_key: F.storageKey }, { token_hash: 'hash' }, { user_id: 'user' }, { principal_key: 'client:secret' }, { extra: F.storageKey }])
    assert.throws(() => A.noPrivate(data)); });
test('QA assertion rejects all planted secrets', () => { for (const secret of F.secrets)
    assert.throws(() => A.noPrivate({ message: secret })); });
test('QA assertion rejects application tokens before issuance', () => { assert.throws(() => A.noPrivate({ token: `wzdl1_${'A'.repeat(43)}` })); });
test('QA assertion permits token DTO but still forbids signed URL', () => { A.noPrivate({ token: `wzdl1_${'A'.repeat(43)}` }, { allowToken: true }); assert.throws(() => A.noPrivate({ token: `wzdl1_${'A'.repeat(43)}`, url: F.deliveryUrl }, { allowToken: true })); });
test('QA assertion rejects cacheable or referrer-leaking responses', () => { for (const patch of [{ 'cache-control': 'public, max-age=600' }, { 'referrer-policy': 'strict-origin-when-cross-origin' }, { 'x-robots-tag': 'index' }, { 'access-control-allow-origin': '*' }])
    assert.throws(() => A.headers(response({}, 200, patch))); });
test('QA assertion rejects token expiry beyond request deadline', async () => { const issued = { token: `wzdl1_${'A'.repeat(43)}`, server_time: '2026-10-02T04:45:19.000Z', token_expires_at: '2026-10-02T04:46:19.000Z', redeem_url: '/api/downloads/redeem' }; await assert.rejects(A.issued(response(issued), r)); });
test('QA assertion catches Retry-After floor at fractional boundary', () => { const data = { server_time: '2026-10-02T04:40:19.999Z', error: { retry_at: r.ready_at, retry_after_seconds: 0 } }; assert.throws(() => A.retry(response(data, 429, { 'Retry-After': '0' }), data)); data.error.retry_after_seconds = 1; A.retry(response(data, 429, { 'Retry-After': '1' }), data); });
test('QA assertion rejects JSON/binary in redemption and wrong destination', async () => { await assert.rejects(A.redeemed(new Response('binary', { status: 303, headers: { ...headers, Location: F.deliveryUrl } }))); await assert.rejects(A.redeemed(new Response(null, { status: 303, headers: { ...headers, Location: 'https://evil.example/qa.apk' } }))); });
test('QA fixture contains only a tiny inert artifact', () => { assert.ok(F.bytes.length < 1024); assert.equal(F.fixtureData().storage.metadata.sizeBytes, BigInt(F.bytes.length)); assert.match(F.sha256, /^[a-f0-9]{64}$/); });
test('QA isolation removes connection credentials and rejects external I/O', () => {
    process.env.DATABASE_URL = 'postgres://qa-secret@production.example/test';
    require('./downloads/harness.cjs').blockExternalIO();
    assert.equal(process.env.DATABASE_URL, undefined);
    for (const attempt of [() => fetch('https://delivery.example.test/qa.apk'), () => require('node:https').get('https://delivery.example.test/'), () => new (require('node:net').Socket)().connect(5432, '127.0.0.1'), () => require('node:child_process').spawn('curl', ['https://delivery.example.test/'])])
        assert.throws(attempt, /forbids network I\/O/);
});
