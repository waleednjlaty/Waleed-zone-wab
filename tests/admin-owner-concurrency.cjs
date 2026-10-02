'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const postgres = require('postgres');
require('./helpers/typescript.cjs');
const load = Module._load;
Module._load = function(name, ...args) { return name === 'server-only' ? {} : load.call(this, name, ...args); };
const { OwnerAdminService } = require('../src/lib/admin/service.ts');
Module._load = load;

const connection = process.env.WZ_DOWNLOAD_TEST_DATABASE_URL;
test('native PostgreSQL admin: concurrent creates/edits and CLI-compatible advisory lock', { skip: !connection, timeout: 30000 }, async t => {
  const url = new URL(connection);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname));
  assert.match(url.pathname, /^\/wz_phase3_test(?:_[a-z0-9_]+)?$/); assert.equal(url.search, ''); assert.equal(url.hash, '');
  const schema = 'admin_api_' + randomUUID().replaceAll('-', '');
  const root = postgres(connection, { max: 1, onnotice() {} });
  let sql;
  try {
    await root.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(connection, { max: 4, onnotice() {}, connection: { search_path: schema } });
    await sql.unsafe('CREATE TABLE applications(id INTEGER PRIMARY KEY,active BOOLEAN,published BOOLEAN); CREATE TABLE site_users(id TEXT PRIMARY KEY);');
    await sql.unsafe(readFileSync(require.resolve('../migrations/001_downloads.sql'), 'utf8'));
    await sql`INSERT INTO applications VALUES(1,true,true)`;
    const service = new OwnerAdminService(sql, { DIRECT_DOWNLOADS_ENABLED: 'false' });
    const input = { application_id: 1, version_label: '1.0', release_key: 'concurrent' };
    const creates = await Promise.allSettled(Array.from({ length: 4 }, () => service.write('versions', input, 'fixture-owner')));
    assert.ok(creates.some(result => result.status === 'fulfilled'));
    for (const result of creates) if (result.status === 'rejected') assert.ok(['23505', '40001', '40P01'].includes(result.reason.code));
    const [version] = await sql`SELECT * FROM site_download_versions`; assert.equal(Number((await sql`SELECT count(*) FROM site_download_versions`)[0].count), 1);
    assert.equal((await service.write('versions', input, 'fixture-owner')).id, version.id);
    const current = await service.read('version', version.id);
    const edits = await Promise.allSettled(['1.1', '1.2'].map(version_label => service.write('version', { version_label, expected_revision: current.revision }, 'fixture-owner', version.id)));
    assert.equal(edits.filter(result => result.status === 'fulfilled').length, 1);
    const denied = edits.find(result => result.status === 'rejected').reason;
    assert.ok(['STALE_REVISION', '40001', '40P01'].includes(denied.code));
    const [stored] = await sql`SELECT version_label FROM site_download_versions WHERE id=${version.id}`;
    assert.equal(stored.version_label, edits.find(result => result.status === 'fulfilled').value.version_label);
    let release, acquired;
    const hold = new Promise(resolve => { release = resolve; }), locked = new Promise(resolve => { acquired = resolve; });
    const holder = sql.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(748031004)`; acquired(); await hold; });
    await locked;
    let settled = false;
    const blocked = service.write('control', { enabled: false }, 'fixture-owner').finally(() => { settled = true; });
    try { await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(settled, false); }
    finally { release(); await holder; }
    assert.equal((await blocked).enabled, false);
    assert.equal((await sql`SELECT updated_by FROM site_download_settings`)[0].updated_by, 'fixture-owner');
  } finally {
    if (sql) await sql.end(); await root.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await root.end();
  }
});
