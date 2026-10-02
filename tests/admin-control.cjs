'use strict';
// The existing emergency endpoint remains owner-only while Admin is integrated.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./downloads/harness.cjs');
async function unchanged(h, before) {
  assert.deepEqual((await h.fixture.snapshot()).persisted.files, before.persisted.files);
  assert.equal((await h.fixture.snapshot()).storageCalls.length, 0);
}
test('kill switch direct API: anonymous/non-owner/stats token denied; owner can only disable', async t => {
  const h = await setup(t);
  const anonymous = await h.actor(), visitor = await h.actor({ userId: 'qa-visitor' }), owner = await h.actor({ userId: 'qa-owner' });
  const before = await h.fixture.snapshot();
  for (const [name, actor, status, headers] of [['anonymous', anonymous, 401, {}], ['non-owner', visitor, 403, {}], ['statistics token', anonymous, 401, { Authorization: 'Bearer QA_STATS_ONLY_SENTINEL' }]]) await t.test(name, async () => {
    const r = await h.send(actor, '/api/downloads/control', { body: { enabled: false }, headers });
    assert.equal(r.status, status); assert.match(r.headers.get('cache-control'), /no-store/);
    assert.ok(!(await r.text()).match(/QA_STATS_ONLY_SENTINEL|storage_key|X-Amz|password|site_download_/)); await unchanged(h, before);
    // Denial cannot silently disable global delivery.
    assert.equal((await h.fixture.presentation(201)).mode, 'direct');
  });
  await t.test('owner cannot re-enable through emergency endpoint', async () => {
    assert.equal((await h.send(owner, '/api/downloads/control', { body: { enabled: true } })).status, 400);
    assert.equal((await h.fixture.presentation(201)).mode, 'direct');
  });
  await t.test('owner disables and all public direct presentation closes', async () => {
    assert.equal((await h.send(owner, '/api/downloads/control', { body: { enabled: false } })).status, 200);
    assert.equal((await h.fixture.presentation(201)).file, null); await unchanged(h, before);
  });
});
test('kill switch rejects CSRF, origin spoofing, malformed/oversized bodies and unsupported verbs', async t => {
  const h = await setup(t), owner = await h.actor({ userId: 'qa-owner' });
  const before = await h.fixture.snapshot();
  for (const [name, options, status] of [
    ['missing CSRF', { csrf: false }, 403], ['forged CSRF', { headers: { 'X-CSRF-Token': 'A'.repeat(43) } }, 403],
    ['missing Origin', { headers: { Origin: null } }, 403], ['cross Origin', { headers: { Origin: 'https://evil.example' } }, 403],
    ['same-site fetch', { headers: { 'Sec-Fetch-Site': 'same-site' } }, 403],
    ['forged host', { headers: { Origin: 'https://evil.example', Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' } }, 403],
    ['malformed JSON', { raw: '{' }, 400], ['oversized actual bytes', { raw: JSON.stringify({ enabled: false, padding: 'x'.repeat(3000) }) }, 413],
    ['unknown fields/owner impersonation', { body: { enabled: false, user_id: 'qa-owner' } }, 400],
    ['GET', { method: 'GET' }, 405], ['PUT', { method: 'PUT' }, 405], ['DELETE', { method: 'DELETE' }, 405],
  ]) await t.test(name, async () => {
    assert.equal((await h.send(owner, '/api/downloads/control', { body: { enabled: false }, ...options })).status, status);
    assert.equal((await h.fixture.presentation(201)).mode, 'direct'); await unchanged(h, before);
  });
});
test('kill switch DB outage fails closed and hides underlying error', async t => {
  const h = await setup(t), owner = await h.actor({ userId: 'qa-owner' });
  await h.fixture.fault('database', true);
  const r = await h.send(owner, '/api/downloads/control', { body: { enabled: false } });
  assert.equal(r.status, 503); assert.ok(!(await r.text()).includes('QA_SQL_STACK'));
  await h.fixture.fault('database', false);
  assert.equal((await h.fixture.presentation(201)).mode, 'direct');
});
