'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const Module = require('node:module');
const { PGlite } = require('@electric-sql/pglite');
require('./helpers/typescript.cjs');
require('./downloads/harness.cjs').blockExternalIO();

test('owner admin: actual routes, authorization, CSRF and PostgreSQL service in isolation', { timeout: 60000 }, async t => {
  const db = new PGlite(); await db.waitReady;
  const origin = 'https://admin.example.test', secret = () => randomBytes(32).toString('base64url');
  const ownerSession = secret(), regularSession = secret(), secondSession = secret();
  let requestContext, unavailable = false, authFailure = false, queue = Promise.resolve();
  const statements = [];
  const serialize = fn => { const pending = queue.then(fn); queue = pending.catch(() => {}); return pending; };
  function sqlFor(executor, inTx = false) {
    async function execute(text, values = []) {
      statements.push(text);
      if (authFailure && text.includes('site_sessions')) throw Error('FIXTURE_DB_SECRET');
      const query = () => executor.query(text, values).then(result => result.rows);
      return inTx ? query() : serialize(query);
    }
    const sql = (parts, ...values) => execute(parts.reduce((out, part, index) => out + (index ? '$' + index : '') + part, ''), values);
    sql.begin = (options, fn) => serialize(() => db.transaction(async tx => {
      await tx.query('SET TRANSACTION ' + options);
      return fn(sqlFor(tx, true));
    }));
    return sql;
  }
  const sql = sqlFor(db), previousEnv = { ...process.env };
  t.beforeEach(async()=>{await sql`DELETE FROM site_rate_limits`;});
  process.env.NODE_ENV = 'production'; process.env.NEXT_PUBLIC_SITE_URL = origin;
  process.env.OWNER_USER_ID = 'fixture-owner'; process.env.WEBSITE_STATS_TOKEN = 'fixture-stats';
  process.env.DIRECT_DOWNLOADS_ENABLED = 'false';
  await db.exec(`CREATE TABLE applications(id INTEGER PRIMARY KEY,name TEXT,description TEXT,version TEXT,size TEXT,
    category TEXT,platform TEXT,developer TEXT,shrankme_url TEXT,image_url TEXT,devupload_url TEXT,
    downloads INTEGER,views INTEGER,active BOOLEAN,published BOOLEAN,created_at TIMESTAMPTZ);
    CREATE TABLE site_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE site_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES site_users(id),expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW());`);
  await db.exec(readFileSync(require.resolve('../migrations/003_runtime_security.sql'), 'utf8'));
  await db.exec(readFileSync(require.resolve('../migrations/001_downloads.sql'), 'utf8'));
  await db.exec(`INSERT INTO applications(id,name,description,version,shrankme_url,devupload_url,active,published)
    VALUES(1,'Fixture','Bot owned','legacy','https://bot.example/secret','private-bot-field',true,true),(2,'Draft','Keep','1',NULL,NULL,false,false);
    INSERT INTO site_users(id,name,email,password_hash) VALUES('fixture-owner','Owner','owner@example.test','secret'),('fixture-user','User','user@example.test','secret');`);
  for (const [session, user] of [[ownerSession, 'fixture-owner'], [secondSession, 'fixture-owner'], [regularSession, 'fixture-user']]) {
    await sql`INSERT INTO site_sessions(token_hash,user_id,expires_at) VALUES(${createHash('sha256').update(session).digest('hex')},${user},clock_timestamp()+INTERVAL '1 day')`;
  }
  const originalLoad = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'server-only') return {};
    if (name === '@/lib/db') return { getSql: () => unavailable ? null : sql };
    if (name === 'next/headers') return { cookies: async () => ({ get(name) {
      const value = (requestContext?.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
      return value ? { value: value.slice(name.length + 1) } : undefined;
    } }) };
    if (name === 'next/navigation') return { notFound() { throw Error('NEXT_HTTP_ERROR_FALLBACK;404'); } };
    return originalLoad.call(this, name, ...args);
  };
  const routePaths = { session: 'session', catalog: 'catalog', versions: 'downloads/versions', version: 'downloads/versions/[version_id]',
    files: 'downloads/files', file: 'downloads/files/[file_id]', config: 'downloads/config/[application_id]', status: 'downloads/status', control: 'downloads/control' };
  const routes = Object.fromEntries(Object.entries(routePaths).map(([operation, path]) => [operation, require('../src/app/api/admin/' + path + '/route.ts')]));
  const { issueAdminCsrf, checkAdminCsrf } = require('../src/lib/admin/security.ts');
  Module._load = originalLoad;
  t.after(async () => { await queue; await db.close(); for (const name of Object.keys(process.env)) if (!(name in previousEnv)) delete process.env[name]; Object.assign(process.env, previousEnv); Module._load = originalLoad; });
  let csrf;
  async function call(operation, method = 'GET', body, options = {}) {
    const path = routePaths[operation].replace(/\[.*?\]/, options.id ?? '1');
    const headers = new Headers({ Cookie: '__Host-wz_session=' + ownerSession, 'Sec-Fetch-Site': 'same-origin' });
    if (method !== 'GET') { headers.set('Origin', origin); headers.set('Content-Type', 'application/json'); if (csrf) headers.set('X-CSRF-Token', csrf); }
    for (const [name, value] of Object.entries(options.headers ?? {})) { if (value === null) headers.delete(name); else headers.set(name, value); }
    requestContext = new Request(origin + '/api/admin/' + path + (options.query ?? ''), { method, headers,
      ...(body !== undefined ? { body: options.raw ? body : JSON.stringify(body) } : {}) });
    const params = operation === 'version' ? { version_id: options.id } : operation === 'file' ? { file_id: options.id } : { application_id: options.id ?? '1' };
    return routes[operation][method](requestContext, { params: Promise.resolve(params) });
  }
  async function data(response, status = 200, code) {
    assert.equal(response.status, status); assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(response.headers.get('x-robots-tag'), /noindex/); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('access-control-allow-origin'), null); assert.equal(response.headers.get('location'), null);
    const result = await response.json();
    if (code) assert.equal(result.error.code, code);
    const serialized = JSON.stringify(result);
    for (const forbidden of ['FIXTURE_DB_SECRET', 'private-bot-field', 'storage_key', 'storage_object_version', 'X-Amz-Signature', ownerSession,
      'password_hash', 'token_hash', 'csrf_hash', 'secretAccessKey', 'updated_by']) assert.ok(!serialized.includes(forbidden), forbidden);
    return result;
  }
  const appBefore = (await db.query('SELECT * FROM applications ORDER BY id')).rows;
  const freshVersion = async (application_id = 1) => data(await call('versions', 'POST', { application_id, version_label: '1.0', release_key: 'r-' + randomUUID() }));
  const fileInput = version_id => {
    const id = randomUUID(), sha256 = 'a'.repeat(64);
    return { id, version_id, metadata: { variant_key: 'universal', artifact_type: 'apk', size_bytes: 10, sha256,
      mime_type: 'application/vnd.android.package-archive', download_filename: 'fixture.apk', storage_backend: 'railway-s3',
      storage_key: `artifacts/${id}/${sha256}.apk`, storage_object_version: null } };
  };
  await t.test('all nine reads deny anonymous, ordinary users, expired sessions and statistics bearer', async () => {
    for (const operation of Object.keys(routes)) {
      await data(await call(operation, 'GET', undefined, { headers: { Cookie: null } }), 401, 'OWNER_REQUIRED');
      await data(await call(operation, 'GET', undefined, { headers: { Cookie: '__Host-wz_session=' + regularSession } }), 403, 'OWNER_REQUIRED');
      await data(await call(operation, 'GET', undefined, { headers: { Cookie: null, Authorization: 'Bearer fixture-stats' } }), 401, 'OWNER_REQUIRED');
      await data(await call(operation, 'GET', undefined, { headers: { Cookie: '__Host-wz_session=' + secret() } }), 401, 'OWNER_REQUIRED');
    }
    const session = await data(await call('session')); csrf = session.csrf_token;
    assert.ok(!csrf.includes(ownerSession));
    delete process.env.OWNER_USER_ID; await data(await call('catalog'), 403, 'OWNER_REQUIRED'); process.env.OWNER_USER_ID = 'fixture-owner';
    authFailure = true; await data(await call('catalog'), 401, 'OWNER_REQUIRED'); authFailure = false;
  });
  await t.test('all six write APIs enforce ownership independently of UI', async () => {
    for (const [operation, method] of [['versions', 'POST'], ['version', 'PATCH'], ['files', 'POST'], ['file', 'PATCH'], ['config', 'PUT'], ['control', 'POST']]) {
      await data(await call(operation, method, {}, { headers: { Cookie: null, Authorization: 'Bearer fixture-stats' } }), 401, 'OWNER_REQUIRED');
      await data(await call(operation, method, {}, { headers: { Cookie: '__Host-wz_session=' + regularSession } }), 403, 'OWNER_REQUIRED');
    }
  });
  await t.test('CSRF is required and bound to exact owner session, origin and expiry', async () => {
    const body = { enabled: false };
    for (const headers of [{ 'X-CSRF-Token': null }, { 'X-CSRF-Token': csrf.slice(0, -2) + 'xx' },
      { Cookie: '__Host-wz_session=' + secondSession }, { Cookie: '__Host-wz_session=' + ownerSession + '; __Host-wz_session=' + ownerSession }])
      await data(await call('control', 'POST', body, { headers }), headers.Cookie?.includes(';') ? 401 : 403);
    const expired = issueAdminCsrf(ownerSession, 'fixture-owner', origin, Date.now() - 901000).csrf_token;
    await data(await call('control', 'POST', body, { headers: { 'X-CSRF-Token': expired } }), 403, 'CSRF_REJECTED');
    const now = 1800000000000, token = issueAdminCsrf(ownerSession, 'fixture-owner', origin, now).csrf_token;
    assert.doesNotThrow(() => checkAdminCsrf(token, ownerSession, 'fixture-owner', origin, now + 899000));
    assert.throws(() => checkAdminCsrf(token, ownerSession, 'fixture-owner', origin, now + 900000));
    assert.throws(() => checkAdminCsrf(token, ownerSession, 'other-owner', origin, now));
    await data(await call('control', 'POST', body));
  });
  await t.test('same-origin rejects missing/foreign/subdomain/null origin, Fetch Metadata and forged forwarding', async () => {
    for (const headers of [{ Origin: null }, { Origin: 'null' }, { Origin: 'https://sub.admin.example.test' }, { Origin: 'https://evil.example' },
      { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'https://evil.example', Host: 'evil.example', 'X-Forwarded-Host': 'evil.example', Forwarded: 'host=evil.example' }])
      await data(await call('control', 'POST', { enabled: false }, { headers }), 403, 'ORIGIN_REJECTED');
    await data(await call('session', 'GET', undefined, { headers: { Origin: 'https://evil.example' } }), 403);
    await data(await call('catalog', 'GET', undefined, { headers: { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' } }));
    delete process.env.NEXT_PUBLIC_SITE_URL; await data(await call('catalog'), 503, 'ADMIN_UNAVAILABLE'); process.env.NEXT_PUBLIC_SITE_URL = origin;
  });
  await t.test('body limits apply to real stream without trusting Content-Length; media/query/method denial', async () => {
    await data(await call('control', 'POST', 'x'.repeat(2049), { raw: true }), 413, 'REQUEST_TOO_LARGE');
    await data(await call('control', 'POST', { enabled: false }, { headers: { 'Content-Type': 'text/plain' } }), 415);
    for (const raw of ['{', '[]', 'null']) await data(await call('control', 'POST', raw, { raw: true }), 400);
    await data(await call('control', 'POST', { enabled: false, force: true }), 400);
    for (const operation of Object.keys(routes)) { const response = await call(operation, 'DELETE'); assert.equal(response.status, 405); assert.ok(response.headers.get('allow')); }
    for (const query of ['?limit=101', '?limit=0', '?limit=1&limit=2', '?after=1%20OR%201=1', '?token=secret']) await data(await call('catalog', 'GET', undefined, { query }), 400);
    await data(await call('control', 'POST', { enabled: false }, { query: '?token=secret' }), 400);
  });
  await t.test('catalog is paginated, read-only and includes drafts without bot secrets', async () => {
    const first = await data(await call('catalog', 'GET', undefined, { query: '?limit=1' }));
    assert.equal(first.items[0].id, 1); assert.equal(first.next_after, 1); assert.ok(!('shrankme_url' in first.items[0]));
    const next = await data(await call('catalog', 'GET', undefined, { query: '?after=1&limit=1' }));
    assert.equal(next.items[0].id, 2); assert.equal(next.items[0].published, false); assert.equal(next.next_after, null);
  });
  await t.test('version create retries preserve identity; pending label edits require current revision', async () => {
    const body = { application_id: 1, release_key: 'retry-release', version_label: '1.0' };
    const v = await data(await call('versions', 'POST', body));
    assert.equal(v.active, false); assert.equal(v.published, false);
    assert.deepEqual(await data(await call('versions', 'POST', body)), v);
    await data(await call('versions', 'POST', { ...body, version_label: 'other' }), 409, 'IDENTITY_CONFLICT');
    await data(await call('versions', 'POST', { ...body, application_id: 999 }), 404);
    const changed = await data(await call('version', 'PATCH', { version_label: '1.1', expected_revision: v.revision }, { id: v.id }));
    await data(await call('version', 'PATCH', { action: 'withdraw', expected_revision: v.revision }, { id: v.id }), 409, 'STALE_REVISION');
    assert.equal(changed.version_label, '1.1');
    const listed = await data(await call('versions', 'GET', undefined, { query: '?application_id=1&limit=1' })); assert.equal(listed.items.length, 1);
    await data(await call('versions'), 400); await data(await call('version', 'GET', undefined, { id: 'not-uuid' }), 400);
  });
  await t.test('strict file metadata validation binds exact file UUID/hash and rejects forged verification', async () => {
    const v = await freshVersion(), input = fileInput(v.id);
    for (const patch of [{ sha256: 'A'.repeat(64) }, { sha256: 'z'.repeat(64) }, { size_bytes: '10' }, { size_bytes: 0 },
      { size_bytes: 2147483649 }, { mime_type: 'application/octet-stream' }, { artifact_type: 'zip' }, { storage_backend: ['railway-s3'] },
      { storage_backend: 'other' }, { storage_object_version: 'fake' }, { storage_object_version: 'null' }, { storage_key: 'https://evil.example/file.apk' },
      { storage_key: input.metadata.storage_key.replace(input.id, randomUUID()) }, { storage_key: 'artifacts/../x.apk' },
      { download_filename: '../file.apk' }, { download_filename: 'file\r\n.apk' }, { download_filename: 'file%.apk' },
      { download_filename: 'file\u202e.apk' }, { scan_status: 'verified' }, { active: true }, { verification: {} }])
      await data(await call('files', 'POST', { ...input, metadata: { ...input.metadata, ...patch } }), 400);
    const f = await data(await call('files', 'POST', input));
    assert.equal(f.scan_status, 'pending'); assert.equal(f.active, false); assert.equal(f.checksum_present, true);
    assert.ok(!JSON.stringify(f).includes(input.metadata.sha256));
    assert.deepEqual(await data(await call('files', 'POST', input)), f);
    const collision = { ...input, id: randomUUID() }; collision.metadata = { ...input.metadata, storage_key: `artifacts/${collision.id}/${input.metadata.sha256}.apk` };
    await data(await call('files', 'POST', collision), 409, 'IDENTITY_CONFLICT');
    await data(await call('file', 'PATCH', { action: 'verify', expected_revision: f.revision }, { id: f.id }), 400);
    await data(await call('file', 'PATCH', { action: 'activate', expected_revision: f.revision }, { id: f.id }), 409, 'VERIFIED_FILES_REQUIRED');
    const changed = await data(await call('file', 'PATCH', { action: 'edit', expected_revision: f.revision,
      metadata: { ...input.metadata, size_bytes: 11 } }, { id: f.id }));
    await data(await call('file', 'PATCH', { action: 'retire', expected_revision: f.revision }, { id: f.id }), 409, 'STALE_REVISION');
    const list = await data(await call('files', 'GET', undefined, { query: '?version_id=' + v.id })); assert.equal(list.items[0].size_bytes, changed.size_bytes);
  });
  await t.test('active/published transitions require trusted verified files; immutable and withdrawal protections', async () => {
    const v = await freshVersion(), input = fileInput(v.id), f = await data(await call('files', 'POST', input));
    await data(await call('version', 'PATCH', { action: 'activate', expected_revision: v.revision }, { id: v.id }), 409);
    // Fixture simulates separately verified out-of-band publisher; API has no verify shortcut.
    await sql`UPDATE site_download_files SET scan_status='verified',verified_at=clock_timestamp() WHERE id=${f.id}`;
    let current = await data(await call('file', 'GET', undefined, { id: f.id }));
    await data(await call('file', 'PATCH', { action: 'edit', expected_revision: current.revision, metadata: input.metadata }, { id: f.id }), 409, 'IMMUTABLE_METADATA');
    current = await data(await call('file', 'PATCH', { action: 'activate', expected_revision: current.revision }, { id: f.id }));
    await data(await call('version', 'PATCH', { action: 'publish', expected_revision: v.revision }, { id: v.id }), 409, 'PUBLICATION_BLOCKED');
    let version = await data(await call('version', 'PATCH', { action: 'activate', expected_revision: v.revision }, { id: v.id }));
    version = await data(await call('version', 'PATCH', { action: 'publish', expected_revision: version.revision }, { id: v.id })); assert.equal(version.published, true);
    const afterWithdraw = await data(await call('version', 'PATCH', { action: 'withdraw', expected_revision: version.revision }, { id: v.id }));
    await data(await call('version', 'PATCH', { version_label: 'changed', expected_revision: afterWithdraw.revision }, { id: v.id }), 409, 'IMMUTABLE_METADATA');
    const quarantined = await data(await call('file', 'PATCH', { action: 'quarantine', expected_revision: current.revision }, { id: f.id }));
    await data(await call('file', 'PATCH', { action: 'activate', expected_revision: quarantined.revision }, { id: f.id }), 409);
    const retired = await data(await call('file', 'PATCH', { action: 'retire', expected_revision: quarantined.revision }, { id: f.id }));
    await data(await call('file', 'PATCH', { action: 'activate', expected_revision: retired.revision }, { id: f.id }), 409);
    for (const action of [['activate'], ['retire'], true]) await data(await call('file', 'PATCH', { action, expected_revision: retired.revision }, { id: f.id }), 400);
    assert.equal((await data(await call('file', 'GET', undefined, { id: f.id }))).retired_at, retired.retired_at);
  });
  await t.test('S3 unpinned verified artifact cannot activate; draft app cannot publish', async () => {
    const v = await freshVersion(2), input = fileInput(v.id); input.metadata.storage_backend = 's3';
    const f = await data(await call('files', 'POST', input));
    await sql`UPDATE site_download_files SET scan_status='verified',verified_at=clock_timestamp() WHERE id=${f.id}`;
    let file = await data(await call('file', 'GET', undefined, { id: f.id }));
    await data(await call('file', 'PATCH', { action: 'activate', expected_revision: file.revision }, { id: f.id }), 409);
    await sql`UPDATE site_download_files SET storage_object_version='fixture-pinned-v1' WHERE id=${f.id}`;
    file = await data(await call('file', 'GET', undefined, { id: f.id }));
    await data(await call('file', 'PATCH', { action: 'activate', expected_revision: file.revision }, { id: f.id }));
    const version = await data(await call('version', 'PATCH', { action: 'activate', expected_revision: v.revision }, { id: v.id }));
    await data(await call('version', 'PATCH', { action: 'publish', expected_revision: version.revision }, { id: v.id }), 409, 'PUBLICATION_BLOCKED');
  });
  await t.test('legacy/disabled are reversible; direct/enabling is independently blocked even with deployment flag', async () => {
    let config = await data(await call('config')); assert.equal(config.mode, 'legacy');
    config = await data(await call('config', 'PUT', { mode: 'disabled', current_version_id: null, expected_revision: config.revision }));
    assert.equal(config.mode, 'disabled');
    for (const mode of [true, ['legacy'], 'bad']) await data(await call('config', 'PUT', { mode, current_version_id: null, expected_revision: config.revision }), 400);
    process.env.DIRECT_DOWNLOADS_ENABLED = 'true';
    await data(await call('config', 'PUT', { mode: 'direct', current_version_id: randomUUID(), expected_revision: config.revision }), 409, 'ROLLOUT_BLOCKED');
    await data(await call('control', 'POST', { enabled: true }), 409, 'ROLLOUT_BLOCKED');
    process.env.DIRECT_DOWNLOADS_ENABLED = 'false';
    config = await data(await call('config', 'PUT', { mode: 'legacy', current_version_id: null, expected_revision: config.revision })); assert.equal(config.mode, 'legacy');
    await data(await call('config', 'PUT', { mode: 'disabled', current_version_id: randomUUID(), expected_revision: config.revision }), 400);
    const status = await data(await call('status')); assert.equal(status.budget, null); assert.equal(status.activation_allowed, false);
    await sql`INSERT INTO site_download_budget(id,starts_at,expires_at,allowance_verified,byte_limit,reserved_bytes) VALUES(1,clock_timestamp()-INTERVAL '1 day',clock_timestamp()+INTERVAL '1 day',true,9007199254740993,2)`;
    const budget = (await data(await call('status'))).budget; assert.equal(budget.remaining_bytes, '9007199254740991');
    await sql`UPDATE site_download_settings SET enabled=true`;
    await data(await call('control', 'POST', { enabled: false })); assert.equal((await data(await call('control'))).shared_enabled, false);
    assert.equal((await sql`SELECT updated_by FROM site_download_settings`)[0].updated_by, 'fixture-owner');
    assert.deepEqual((await db.query('SELECT * FROM applications ORDER BY id')).rows, appBefore);
  });
  await t.test('missing migration/tables/settings and database failures are safe; no request-time download DDL', async () => {
    for (const table of ['site_download_settings', 'site_download_versions', 'site_download_files', 'site_download_app_config', 'site_download_budget']) {
      await db.exec(`ALTER TABLE ${table} RENAME TO fixture_unavailable`);
      await data(await call('catalog'), 503, 'ADMIN_SCHEMA_UNAVAILABLE');
      await data(await call('control', 'POST', { enabled: false }), 503, 'ADMIN_SCHEMA_UNAVAILABLE');
      await db.exec(`ALTER TABLE fixture_unavailable RENAME TO ${table}`);
    }
    await db.exec('DELETE FROM site_download_settings'); await data(await call('status'), 503); await data(await call('control', 'POST', { enabled: false }), 503);
    unavailable = true; await data(await call('catalog'), 401); unavailable = false;
    assert.ok(!statements.some(query => /CREATE.*site_download|ALTER.*site_download|DROP.*site_download/i.test(query)));
    for (const file of ['http', 'service', 'security', 'validation']) assert.ok(!/createDeliveryGrant|headObject|CREATE TABLE|ALTER TABLE|DROP TABLE/.test(readFileSync(require.resolve('../src/lib/admin/' + file + '.ts'), 'utf8')));
  });
});
