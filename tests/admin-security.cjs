'use strict';
// Exercise the real session lookup, owner authorization, parser and origin guard.
// The only replacements are request cookies, DB boundary and Next's notFound.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
require('./helpers/typescript.cjs');
const original = Module._load;
const env = { ...process.env };
process.env.NODE_ENV = 'production';
process.env.NEXT_PUBLIC_SITE_URL = 'https://admin.example.test';
process.env.OWNER_USER_ID = 'qa-owner';
process.env.WEBSITE_STATS_TOKEN = 'QA_STATS_ONLY_SENTINEL';
let token, row, fault, available = true, queries = [];
const sql = async (parts, ...values) => {
  const query = parts.join('?'); queries.push({ query, values });
  if (fault) throw Object.assign(new Error('QA_DB_PASSWORD_SENTINEL site_sessions'), { code: fault });
  return query.startsWith('SELECT u.id') ? (row ? [row] : []) : [];
};
Module._load = function(name, ...args) {
  if (name === 'server-only') return {};
  if (name === 'next/headers') return { cookies: async () => ({ get: name => name === '__Host-wz_session' && token ? { value: token } : undefined }) };
  if (name === 'next/navigation') return { notFound() { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); } };
  if (name === '@/lib/db') return { getSql: () => available ? sql : null };
  return original.call(this, name, ...args);
};
const auth = require('../src/lib/auth.ts');
const owner = require('../src/lib/authorization.ts');
Module._load = original;
after(() => { for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env); });
function session(user = null, options = {}) {
  token = options.token === undefined ? (user ? 'test-session-only' : undefined) : options.token;
  row = user; fault = options.fault; available = options.available !== false; queries = [];
}
const identity = id => ({ id, name: 'QA identity', email: 'qa@example.test' });
const request = (headers = {}) => new Request('https://admin.example.test/api/admin/status', { headers });
for (const [name, user, expected] of [['anonymous', null, 401], ['non-owner', identity('visitor'), 403], ['owner', identity('qa-owner'), null]]) {
  test(`real session + direct owner API authorization: ${name}`, async () => { session(user); assert.equal(await owner.authorizeOwnerRequest(request()), expected); });
  test(`owner page guard: ${name}`, async () => {
    session(user);
    if (expected === null) assert.equal((await owner.requireOwner()).id, 'qa-owner');
    else await assert.rejects(owner.requireOwner(), /FALLBACK;404/);
  });
}
for (const id of ['QA-owner', 'qa-owner ', 'qa-owner\0', 'visitor']) test(`exact owner ID comparison rejects ${JSON.stringify(id)}`, () => assert.equal(owner.isOwner(identity(id)), false));
test('self-assigned role/name/email never grants ownership', async () => {
  session({ ...identity('visitor'), name: 'qa-owner', email: 'qa-owner', role: 'owner', isOwner: true });
  assert.equal(await owner.authorizeOwnerRequest(request({ 'x-user-id': 'qa-owner', 'x-owner-id': 'qa-owner', Authorization: 'Bearer QA_STATS_ONLY_SENTINEL' })), 403);
});
for (const configured of ['', '   ']) test(`missing owner configuration fails closed: ${JSON.stringify(configured)}`, async () => {
  const saved = process.env.OWNER_USER_ID; process.env.OWNER_USER_ID = configured;
  try { session(identity('qa-owner')); assert.equal(await owner.authorizeOwnerRequest(request()), 403); await assert.rejects(owner.requireOwner(), /404/); }
  finally { process.env.OWNER_USER_ID = saved; }
});
test('statistics automation is opt-in and cannot authorize Admin', async () => {
  session(null); const r = request({ Authorization: 'Bearer QA_STATS_ONLY_SENTINEL' });
  assert.equal(await owner.authorizeOwnerRequest(r), 401);
  assert.equal(await owner.authorizeOwnerRequest(r, true), null);
});
for (const value of ['Bearer QA_STATS_ONLY_SENTINE', 'Bearer QA_STATS_ONLY_SENTINELx', 'Basic QA_STATS_ONLY_SENTINEL', 'bearer QA_STATS_ONLY_SENTINEL', '']) test(`invalid automation token denied: ${value}`, async () => { session(null); assert.equal(await owner.authorizeOwnerRequest(request({ Authorization: value }), true), 401); });
for (const [name, settings] of [['missing DB', { available: false }], ['missing tables', { fault: '42P01' }], ['DB outage', { fault: 'ECONNREFUSED' }], ['expired/forged session', { token: 'forged' }], ['oversized session', { token: 'x'.repeat(129) }]]) test(`real auth lookup fails closed: ${name}`, async () => {
  session(name.includes('session') ? null : identity('qa-owner'), settings);
  assert.equal(await owner.authorizeOwnerRequest(request()), 401);
  await assert.rejects(owner.requireOwner(), /404/);
});
test('session query binds hashed token and server expiry, not plaintext or supplied ID', async () => {
  session(identity('qa-owner'));
  assert.equal((await auth.getCurrentUser()).id, 'qa-owner');
  const select = queries.find(x => x.query.startsWith('SELECT u.id'));
  assert.match(select.query, /s\.token_hash=\?.*s\.expires_at>NOW\(\)/);
  assert.deepEqual(select.values, [auth.hashToken(token)]);
  assert.ok(!select.values.includes(token));
});
for (const [name, headers, allowed] of [
  ['same origin', { Origin: 'https://admin.example.test', 'Sec-Fetch-Site': 'same-origin' }, true],
  ['non-browser explicit origin', { Origin: 'https://admin.example.test' }, true],
  ['missing Origin', {}, false], ['null Origin', { Origin: 'null' }, false],
  ['cross origin', { Origin: 'https://evil.example' }, false],
  ['same-site sibling', { Origin: 'https://admin.example.test', 'Sec-Fetch-Site': 'same-site' }, false],
  ['cross-site fetch', { Origin: 'https://admin.example.test', 'Sec-Fetch-Site': 'cross-site' }, false],
  ['forged forwarding', { Origin: 'https://evil.example', Host: 'evil.example', 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https' }, false],
  ['downgrade HTTP', { Origin: 'http://admin.example.test' }, false],
  ['port mismatch', { Origin: 'https://admin.example.test:444' }, false],
]) test(`same-origin CSRF boundary: ${name}`, () => assert.equal(auth.sameOrigin(request(headers)), allowed));
function body(raw, headers = {}, method = 'POST') {
  return new Request('https://admin.example.test/api/admin/versions', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: raw });
}
for (const raw of ['{', '{"id":}', 'null', '[]', '"scalar"', '42', '', '{"id":1} trailing']) test(`malformed/non-object JSON rejected: ${JSON.stringify(raw)}`, async () => assert.equal(await auth.readJson(body(raw)), null));
test('valid metadata JSON stays an object without granting privileges', async () => assert.deepEqual(await auth.readJson(body('{"version_label":"1.0","role":"owner"}')), { version_label: '1.0', role: 'owner' }));
test('declared oversized JSON rejected before stream processing', async () => assert.equal(await auth.readJson(body('{}', { 'Content-Length': '4097' })), null));
for (const headers of [{}, { 'Content-Length': '2' }]) test(`actual oversized body rejected despite ${JSON.stringify(headers)}`, async () => assert.equal(await auth.readJson(body(JSON.stringify({ data: 'x'.repeat(5000) }), headers)), null));
test('UTF-8 byte size, not character count, bounds payload', async () => assert.equal(await auth.readJson(body(JSON.stringify({ data: 'و'.repeat(2100) }))), null));
for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) test(`simple CSRF media type rejected: ${type}`, async () => assert.equal(await auth.readJson(body('{}', { 'Content-Type': type })), null));
