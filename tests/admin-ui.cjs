const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
require('./helpers/typescript.cjs');
require.extensions['.css'] = module => { module.exports = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : name }); };
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { directBlockers } = require('../src/components/admin/presentation.ts');
const { adminApi, AdminApiError, apiErrorMessage } = require('../src/components/admin/api.ts');
const { ConfigForm, KillSwitchForm } = require('../src/components/admin/AdminForms.tsx');
const token = '1790960400.' + 'a'.repeat(43) + '.' + 'b'.repeat(43);
const revision = 'c'.repeat(64);
const versionId = '11111111-1111-4111-8111-111111111111';
const detail = { app: { id: 201, name: 'Example', mode: 'legacy', currentVersionId: versionId, configRevision: revision, active: true, published: true },
  versions: [{ id: versionId, applicationId: 201, label: '1.0', releaseKey: '1-r1', active: true, published: true, published_at: null, revision }],
  files: [{ id: '22222222-2222-4222-8222-222222222222', versionId, scanStatus: 'verified', active: true, retired: false }], blockers: [], directActivationAllowed: true };
const system = { checkedAt: '2026-10-02T15:00:00Z', enabled: true, deploymentEnabled: true, migrationReady: true, storageReady: true, ingressReady: true, activationAllowed: true, canaryReady: true,
  blockers: [], budget: { verified: true, current: true, limitBytes: '10000', reservedBytes: '0', remainingBytes: '10000', startsAt: '2026-10-02T14:00:00Z', expiresAt: '2026-10-02T16:00:00Z' } };

test('direct requires complete independent system and selected version/file gates', () => {
  assert.deepEqual(directBlockers(detail, system), []);
  assert.ok(directBlockers(null, system).length);
  assert.ok(directBlockers(detail, null).length);
  for (const gate of ['enabled', 'deploymentEnabled', 'migrationReady', 'storageReady', 'ingressReady'])
    assert.ok(directBlockers(detail, { ...system, [gate]: false }).length, gate);
  assert.ok(directBlockers({ ...detail, directActivationAllowed: false }, system).length);
  assert.ok(directBlockers(detail, system, null).length);
  assert.ok(directBlockers({ ...detail, files: [{ ...detail.files[0], scanStatus: 'pending' }] }, system).length);
  assert.ok(directBlockers({ ...detail, files: [{ ...detail.files[0], retired: true }] }, system).length);
  assert.ok(directBlockers({ ...detail, versions: [{ ...detail.versions[0], published: false }] }, system).length);
  for (const budget of [null, { ...system.budget, verified: false }, { ...system.budget, reservedBytes: '10000' },
    { ...system.budget, expiresAt: system.checkedAt }, { ...system.budget, startsAt: '2026-10-02T15:01:00Z' }])
    assert.ok(directBlockers(detail, { ...system, budget }).length);
});

test('config shows blockers and disabled direct choice; kill switch cannot re-enable', () => {
  const html = renderToStaticMarkup(React.createElement(ConfigForm, { detail, system: { ...system, deploymentEnabled: false }, busy: false, locked: false, onSave() {} }));
  assert.match(html, /value="direct" disabled=""/);
  assert.match(html, /عوائق تفعيل direct/);
  const kill = renderToStaticMarkup(React.createElement(KillSwitchForm, { system: { ...system, enabled: false }, busy: false, locked: false, onDisable() {} }));
  assert.match(kill, /fieldset disabled=""/);
  assert.ok(!kill.includes('إعادة تفعيل'));
});

test('API uses same-origin cookies, no-store, CSRF and fixed write endpoint', async () => {
  const original = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push([url, options]); return Response.json({ enabled: false }); };
  try {
    await adminApi.disable(token);
    assert.equal(calls[0][0], '/api/admin/downloads/control');
    assert.equal(calls[0][1].credentials, 'same-origin');
    assert.equal(calls[0][1].cache, 'no-store');
    assert.equal(calls[0][1].redirect, 'error');
    assert.equal(calls[0][1].headers['X-CSRF-Token'], token);
    assert.deepEqual(JSON.parse(calls[0][1].body), { enabled: false });
    await assert.rejects(adminApi.disable(''), /CSRF_REQUIRED/);
    assert.equal(calls.length, 1);
  } finally { global.fetch = original; }
});

test('response allowlist drops hashes/object keys/signed URLs and rejects mismatched app', async () => {
  const original = global.fetch;
  try {
    const catalog = { items: [{ id: 201, name: 'Example', active: true, published: true }], next_after: null };
    const config = { application_id: 201, mode: 'legacy', current_version_id: versionId, revision };
    const versions = { items: [{ id: versionId, application_id: 201, version_label: '1.0', release_key: '1-r1', active: true, published: true, published_at: null, revision }], next_after: null };
    const files = { items: [{ id: detail.files[0].id, version_id: versionId, variant_key: 'universal', download_filename: 'app.apk', size_bytes: 10,
      mime_type: 'application/vnd.android.package-archive', scan_status: 'verified', active: true, retired_at: null, revision,
      sha256: 'PRIVATE_HASH', storage_key: 'PRIVATE_KEY', signed_url: 'PRIVATE_URL' }], next_after: null };
    global.fetch = async url => Response.json(url.includes('/catalog?') ? catalog : url.includes('/config/') ? config : url.includes('/versions?') ? versions : files);
    const safe = JSON.stringify(await adminApi.detail(201)); assert.ok(!safe.includes('PRIVATE'));
    assert.equal((await adminApi.detail(201)).app.icon, null);
    catalog.items[0].id = 202; await assert.rejects(adminApi.detail(201), /INVALID_RESPONSE/);
    catalog.items[0].id = 201; config.mode = 'unknown'; await assert.rejects(adminApi.detail(201), /INVALID_RESPONSE/);
  } finally { global.fetch = original; }
});

test('missing APIs, wrong content type, malformed status and private errors fail closed', async () => {
  const original = global.fetch;
  try {
    for (const status of [401, 403, 404, 409, 429, 503]) {
      global.fetch = async () => Response.json({ error: { message: 'SECRET_URL' } }, { status, headers: { 'Retry-After': '12' } });
      await assert.rejects(adminApi.status(), error => error instanceof AdminApiError && !apiErrorMessage(error).includes('SECRET_URL'));
    }
    global.fetch = async () => new Response('<h1>login</h1>');
    await assert.rejects(adminApi.status(), /INVALID_RESPONSE/);
    global.fetch = async () => Response.json({ enabled: true });
    await assert.rejects(adminApi.status(), /INVALID_RESPONSE/);
  } finally { global.fetch = original; }
});

test('production admin layout reuses existing server owner guard with no fixture bypass', () => {
  const layout = readFileSync('src/app/admin/layout.tsx', 'utf8');
  assert.match(layout, /await requireOwner\(\)/);
  assert.ok(!/fixture|process\.env|searchParams/.test(layout));
  assert.ok(!readFileSync('src/components/admin/AdminDashboard.tsx', 'utf8').includes('localStorage'));
});
