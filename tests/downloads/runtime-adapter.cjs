'use strict';
// Actual handlers + service + PostgreSQL SQL, with isolated in-memory PostgreSQL.
// PGlite serializes transactions. Native multi-pool locking is separately gated in downloads.cjs/CI.
const { PGlite } = require('@electric-sql/pglite');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
require('../helpers/typescript.cjs');
const load = Module._load;
Module._load = function(name, ...args) { return name === 'server-only' ? {} : load.call(this, name, ...args); };
const { trustedNetworks } = require('../../src/lib/downloads/network.ts');
const rules = require('../../src/lib/downloads/rules.ts');
Module._load = load;

async function createFixture({ clock, origin, data, relaxAttemptLimits = false, storageAdapter }) {
  for (const path of ['service', 'storage', 'http']) delete require.cache[require.resolve('../../src/lib/downloads/' + path + '.ts')];
  Module._load = function(name, ...args) { return name === 'server-only' ? {} : load.call(this, name, ...args); };
  const { DownloadService } = require('../../src/lib/downloads/service.ts');
  const { createDownloadHandler } = require('../../src/lib/downloads/http.ts');
  Module._load = load;
  const db = new PGlite();
  await db.waitReady;
  const faults = {}, actors = new Map(), storageCalls = [], seeded = new Set();
  const RealDate = global.Date;
  // The only clock replacement is test-side; runtime still executes its DB time queries.
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock.nowMs])); } static now() { return clock.nowMs; } };
  let queue = Promise.resolve();
  const serialize = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  const stamp = text => text.replace(/clock_timestamp\(\)/g, `'${new RealDate(clock.nowMs).toISOString()}'::timestamptz`);
  function sqlFor(executor, transaction = false) {
    const run = async (text, values = []) => {
      if (faults.database || (faults.limiter && text.includes('site_download_limit_state')) || (faults.auth && text.includes('site_sessions'))) throw Error('QA_SQL_STACK');
      const query = () => executor.query(stamp(text), values).then(r => r.rows);
      return transaction ? query() : serialize(query);
    };
    const sql = (parts, ...values) => run(parts.reduce((s, p, i) => s + (i ? '$' + i : '') + p, ''), values);
    sql.array = value => value;
    sql.unsafe = run;
    sql.begin = fn => serialize(() => db.transaction(tx => fn(sqlFor(tx, true))));
    return sql;
  }
  const sql = sqlFor(db);
  const env = { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: origin, DOWNLOAD_INGRESS_VERIFIED: 'true', DOWNLOAD_TRUSTED_IP_HEADER: 'x-verified-client-ip', DOWNLOAD_IP_HASH_KEY: 'qa-only-hmac-key-with-at-least-32-characters', OWNER_USER_ID: 'qa-owner' };
  let deploymentEnabled = true;
  const adapter = {
    async headObject(ref) {
      storageCalls.push({ operation: 'headObject' });
      if (faults.headMissing) throw new rules.DownloadError(404, 'FILE_UNAVAILABLE');
      if (faults.storageTimeout) await new Promise((_, reject) => setTimeout(() => reject(new rules.DownloadError(503, 'STORAGE_UNAVAILABLE')), 3100));
      return { ...data.storage.metadata, ...(faults.headSizeMismatch ? { sizeBytes: BigInt(1) } : {}), ...(faults.headVersionMismatch ? { objectVersion: 'wrong' } : {}), ...(faults.headChecksumMismatch ? { sha256: 'f'.repeat(64) } : {}) };
    },
    async createDeliveryGrant({ ref }) {
      storageCalls.push({ operation: 'createDeliveryGrant' });
      if (faults.signing) throw new rules.DownloadError(503, 'STORAGE_UNAVAILABLE');
      return { url: `https://delivery.example.test/${ref.key}?X-Amz-Signature=QA_SIGNATURE_SENTINEL`, deliveryHost: 'delivery.example.test', expiresAt: new Date(clock.nowMs + 290000) };
    },
    matchesObject(grant, ref) { return new URL(grant.url).pathname === '/' + ref.key; },
  };
  // Test-only provider injection; handlers, service, SQL and production storage guards stay real.
  const selectedAdapter = storageAdapter ? {
    async headObject(ref, signal) { storageCalls.push({ operation: 'headObject' }); return storageAdapter.headObject(ref, signal); },
    async createDeliveryGrant(input, signal) { storageCalls.push({ operation: 'createDeliveryGrant' }); return storageAdapter.createDeliveryGrant(input, signal); },
    matchesObject(grant, ref) { return storageAdapter.matchesObject(grant, ref); },
  } : adapter;
  const services = [0, 1].map(() => new DownloadService(sql, { enabled: true, hosts: ['delivery.example.test'], adapters: { qa: selectedAdapter } }));
  if (relaxAttemptLimits) for (const service of services) { service.attempts = async () => {}; service.attemptPolicies = async () => {}; }
  await db.exec('CREATE TABLE applications(id INTEGER PRIMARY KEY,active BOOLEAN,published BOOLEAN); CREATE TABLE site_users(id TEXT PRIMARY KEY); CREATE TABLE site_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES site_users(id),expires_at TIMESTAMPTZ);');
  await db.exec(stamp(readFileSync(require.resolve('../../migrations/001_downloads.sql'), 'utf8')));
  await sql`INSERT INTO applications VALUES(${data.application.id},true,true),(202,true,true)`;
  await sql`UPDATE site_download_settings SET enabled=true`;
  for (const v of data.versions) await sql`INSERT INTO site_download_versions(id,application_id,version_label,release_key,active,published) VALUES(${v.id},${v.application_id},${v.version_label},${v.id},${v.active},${v.published})`;
  await sql`INSERT INTO site_download_app_config(application_id,mode,current_version_id) VALUES(${data.config.application_id},${data.config.mode},${data.config.current_version_id})`;
  for (const f of data.files) await sql`INSERT INTO site_download_files(id,version_id,variant_key,size_bytes,mime_type,download_filename,sha256,storage_backend,storage_key,storage_object_version,scan_status,verified_at,active) VALUES(${f.id},${f.version_id},${f.id},${f.size_bytes},${f.mime_type},${f.download_filename},${f.sha256},${f.storage_backend},${f.storage_key},${f.storage_object_version},${f.scan_status},${f.verified_at},${f.active})`;
  await sql`INSERT INTO site_download_budget(id,starts_at,expires_at,allowance_verified,byte_limit,max_outstanding) VALUES(1,${new Date(clock.nowMs - 86400000)},${new Date(clock.nowMs + 86400000)},true,100000000,20)`;
  async function createActor({ userId = null, network = '192.0.2.10' } = {}) {
    const id = randomUUID(), session = rules.newSecret();
    if (userId) { await sql`INSERT INTO site_users(id) VALUES(${userId}) ON CONFLICT DO NOTHING`; await sql`INSERT INTO site_sessions VALUES(${rules.hashSecret(session)},${userId},${new Date(clock.nowMs + 86400000)})`; }
    const a = { id, userId, network, cookie: userId ? '__Host-wz_session=' + session : '' }; actors.set(id, a); return { ...a };
  }
  async function identity(a) { return { clientId: a.clientId, userId: a.userId, principal: a.userId ? 'user:' + a.userId : 'client:' + a.clientId, networks: trustedNetworks(new Request(origin, { headers: { 'x-verified-client-ip': a.network } }), env) }; }
  async function dispatch(request, { actor, worker = 0 }) {
    const a = actors.get(actor), headers = new Headers(request.headers); headers.set('x-verified-client-ip', a?.network || '192.0.2.10');
    request = new Request(request, { headers });
    const path = new URL(request.url).pathname, match = path.match(/^\/api\/downloads\/requests\/([^/]+)(\/token)?$/);
    const op = match ? (match[2] ? 'token' : 'status') : ({ session: 'session', requests: 'request', redeem: 'redeem', control: 'control' })[path.split('/').pop()];
    const service = services[worker]; service.options.enabled = deploymentEnabled;
    const response = await createDownloadHandler(op, { service, env })(request, match?.[1]);
    if (a && op === 'session' && response.ok) { const secret = response.headers.get('set-cookie').split(';')[0].split('=')[1]; a.clientId = (await service.client(secret)).id; }
    return response;
  }
  async function patch(target, values) {
    if (target === 'actor') { const a = actors.get(values.id); a.userId = values.userId; await sql`INSERT INTO site_users(id) VALUES(${values.userId}) ON CONFLICT DO NOTHING`; const session = a.cookie.split('=')[1]; await sql`UPDATE site_sessions SET user_id=${values.userId} WHERE token_hash=${rules.hashSecret(session)}`; return; }
    if (target === 'settings') { if ('deployment_enabled' in values) deploymentEnabled = values.deployment_enabled; if ('enabled' in values) await sql`UPDATE site_download_settings SET enabled=${values.enabled}`; return; }
    if (target === 'principal') { const i = await identity(actors.get(values.actor)); await sql`INSERT INTO site_download_principals(key,next_download_at,active_request_id) VALUES(${i.principal},${new Date(values.next_download_at)},${values.active_request_id}) ON CONFLICT(key) DO UPDATE SET next_download_at=excluded.next_download_at,active_request_id=excluded.active_request_id`; return; }
    if (target === 'acceptedQuota') {
      const a = actors.get(values.actor), i = await identity(a), count = values.principal10m || values.network10m, p = values.principal10m ? i.principal : 'fixture:quota';
      await sql`INSERT INTO site_download_principals(key) VALUES(${p}) ON CONFLICT DO NOTHING`;
      for (let n = 0; n < count; n++) { const seed = randomUUID(); seeded.add(seed); await sql`INSERT INTO site_download_requests(id,principal_key,client_id,user_id,application_id,version_id,file_id,file_snapshot,idempotency_key,payload_hash,network_hashes,created_at,ready_at,request_expires_at,state) VALUES(${seed},${p},${a.clientId},${a.userId},${data.application.id},${data.config.current_version_id},${data.files[0].id},${'a'.repeat(64)},${randomUUID()},${'a'.repeat(64)},${i.networks},${new Date(clock.nowMs - 60000)},${new Date(clock.nowMs - 40000)},${new Date(clock.nowMs - 10000)},'expired')`; }
      return;
    }
    const table = { application: 'applications', config: 'site_download_app_config', version: 'site_download_versions', file: 'site_download_files' }[target];
    const id = values.id || data.application.id, column = target === 'config' ? 'application_id' : 'id';
    // Invalid persisted metadata cannot pass the schema: assert DB rejection instead.
    if (target === 'file' && (values.size_bytes === 0 || values.sha256 === null)) {
      const field = values.size_bytes === 0 ? 'size_bytes' : 'sha256';
      await require('node:assert/strict').rejects(sql.unsafe(`UPDATE ${table} SET ${field}=$1 WHERE id=$2`, [values[field], id]));
      await sql`UPDATE site_download_files SET active=false WHERE id=${id}`; return;
    }
    const entries = Object.entries(values).filter(([key]) => key !== 'id');
    await sql.unsafe(`UPDATE ${table} SET ${entries.map(([key], n) => key + '=$' + (n + 1)).join(',')} WHERE ${column}=$${entries.length + 1}`, [...entries.map(([,value]) => value), id]);
  }
  async function snapshot() {
    const query = text => db.query(text).then(r => r.rows);
    const requests = await query('SELECT * FROM site_download_requests');
    const files = await query('SELECT * FROM site_download_files');
    return { requests: requests.filter(r => !seeded.has(r.id)), storageCalls, redemptionEvents: requests.filter(r => r.state === 'redeemed'), acceptedNetwork10m: requests.filter(r => r.created_at.getTime() > clock.nowMs - 600000).length, persisted: { requests, files }, logs: [] };
  }
  return { presentation: id => services[0].presentation(id), dispatch, createActor, patch, snapshot, fault: async (name, value) => { faults[name] = value; if (name === 'adapterMissing') for (const service of services) service.options.adapters = value ? {} : { qa: selectedAdapter }; if (name === 'signing' && !value) clock.advance(10000); }, barrier: async () => {}, close: async () => { await queue; await db.close(); global.Date = RealDate; } };
}
module.exports = { createFixture };
