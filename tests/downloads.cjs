const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
require('./helpers/typescript.cjs');
const load = Module._load;
Module._load = function(name, ...args) { return name === 'server-only' ? {} : load.call(this, name, ...args); };
const rules = require('../src/lib/downloads/rules.ts');
const { normalizeNetwork, trustedNetworks } = require('../src/lib/downloads/network.ts');
const { DownloadService, guardLive, publicStatus } = require('../src/lib/downloads/service.ts');
const { validateGrant } = require('../src/lib/downloads/storage.ts');
const { createDownloadHandler, downloadBody } = require('../src/lib/downloads/http.ts');
Module._load = load;

const fails = (code) => (error) => error instanceof rules.DownloadError && error.code === code;
const env = { NODE_ENV: 'test', NEXT_PUBLIC_SITE_URL: 'https://catalog.example.test',
  DOWNLOAD_INGRESS_VERIFIED: 'true', DOWNLOAD_TRUSTED_IP_HEADER: 'x-verified-client-ip',
  DOWNLOAD_IP_HASH_KEY: 'test-only-dedicated-hmac-key-0123456789', OWNER_USER_ID: 'owner-test' };
const ref = { backend: 'fixture', key: 'artifacts/fixture.apk', objectVersion: 'v1' };
const hosts = ['downloads.example.test'];
const request = (path, body = {}, headers = {}, method = 'POST') => new Request(env.NEXT_PUBLIC_SITE_URL + path, {
  method, headers: { Origin: env.NEXT_PUBLIC_SITE_URL, 'Content-Type': 'application/json',
    'x-verified-client-ip': '198.51.100.10', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});

test('download timing: 19.999s denies, exactly 20s allows, exact expiry denies', () => {
  const base = Date.UTC(2026, 0, 1), row = { state: 'pending', ready_at: new Date(base + 20000), request_expires_at: new Date(base + 320000) };
  assert.throws(() => guardLive(row, new Date(base + 19999), true), fails('DOWNLOAD_NOT_READY'));
  assert.doesNotThrow(() => guardLive(row, new Date(base + 20000), true));
  assert.throws(() => guardLive(row, row.request_expires_at), fails('REQUEST_EXPIRED'));
});
test('opaque tokens are canonical random 256-bit secrets; only verifiers compare', () => {
  const tokens = new Set(Array.from({ length: 100 }, () => 'wzdl1_' + rules.newSecret()));
  assert.equal(tokens.size, 100);
  for (const token of tokens) { assert.ok(rules.validToken(token)); assert.ok(rules.matchesSecret(token, rules.hashSecret(token))); }
  assert.ok(!rules.validToken('wzdl1_' + 'A'.repeat(42) + 'B'));
  assert.ok(!rules.matchesSecret('wrong', rules.hashSecret('real')));
});
test('network normalization aggregates IPv6 /64 and IPv4-mapped IPv6', () => {
  assert.equal(normalizeNetwork('::ffff:192.0.2.1'), '192.0.2.1');
  assert.equal(normalizeNetwork('2001:db8:1:2::1'), normalizeNetwork('2001:db8:1:2:ffff::1'));
  assert.throws(() => normalizeNetwork('127.0.0.1, 1.2.3.4'));
  assert.throws(() => trustedNetworks(request('/'), { ...env, DOWNLOAD_INGRESS_VERIFIED: 'false' }));
  assert.throws(() => trustedNetworks(request('/'), { ...env, DOWNLOAD_TRUSTED_IP_HEADER: 'x-forwarded-for' }));
  assert.equal(trustedNetworks(request('/', {}, { 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' }), env)[0], trustedNetworks(request('/'), env)[0]);
});
test('token buckets refill at DB time and never accept caller clock/fixed window reset', () => {
  const now = new Date();
  assert.equal(rules.refill(0, now, now, 6, 12).wait, 5000);
  assert.equal(rules.refill(0, now, new Date(now.getTime() + 5000), 6, 12).available, 1);
  assert.equal(rules.refill(6, now, new Date(now.getTime() - 10000), 6, 12).available, 6);
});
test('delivery URL validates host, method/object adapter contract, scheme, credentials and TTL', () => {
  const now = new Date(), adapter = { matchesObject: () => true };
  const grant = { url: 'https://downloads.example.test/artifacts/fixture.apk?sig=fixture', deliveryHost: hosts[0], expiresAt: new Date(now.getTime() + 60000) };
  assert.equal(validateGrant(grant, ref, adapter, hosts, now).url, grant.url);
  for (const url of ['http://downloads.example.test/a', 'https://evil.example/a', 'https://user@downloads.example.test/a', 'https://downloads.example.test:444/a', grant.url + '#token'])
    assert.throws(() => validateGrant({ ...grant, url }, ref, adapter, hosts, now));
  assert.throws(() => validateGrant(grant, ref, { matchesObject: () => false }, hosts, now));
  assert.throws(() => validateGrant({ ...grant, expiresAt: new Date(now.getTime() + 29999) }, ref, adapter, hosts, now));
});
test('streamed bodies: 2KiB limit, malformed JSON, duplicate form fields, media types', async () => {
  await assert.rejects(downloadBody(request('/', { junk: 'a'.repeat(2048) })), fails('REQUEST_TOO_LARGE'));
  await assert.rejects(downloadBody(new Request(env.NEXT_PUBLIC_SITE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })), fails('INVALID_REQUEST'));
  await assert.rejects(downloadBody(new Request(env.NEXT_PUBLIC_SITE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=a&token=b' }), true), fails('INVALID_REQUEST'));
  await assert.rejects(downloadBody(new Request(env.NEXT_PUBLIC_SITE_URL, { method: 'POST', body: '{}' })), fails('UNSUPPORTED_MEDIA_TYPE'));
});

test('download PostgreSQL lifecycle, API abuse and concurrency', { skip: !process.env.WZ_DOWNLOAD_TEST_DATABASE_URL }, async (t) => {
  const connection = process.env.WZ_DOWNLOAD_TEST_DATABASE_URL, url = new URL(connection);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/wz_phase3_test(?:_[a-z0-9]+)?$/.test(url.pathname), 'Dedicated local test DB only.');
  const postgres = require('postgres');
  const schema = 'download_test_' + randomUUID().replaceAll('-', '');
  const admin = postgres(connection, { max: 1, onnotice() {} });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  // Fifty concurrent callers share bounded independent pools, as production workers do.
  const sql = postgres(connection, { max: 2, prepare: false, connection: { search_path: schema }, onnotice() {} });
  const other = postgres(connection, { max: 2, prepare: false, connection: { search_path: schema }, onnotice() {} });
  let headMode = 'ok', beforeSign = null;
  const adapter = {
    async headObject() {
      if (headMode === 'missing') throw new rules.DownloadError(404, 'FILE_UNAVAILABLE');
      return { sizeBytes: BigInt(headMode === 'mismatch' ? 101 : 100), contentType: 'application/vnd.android.package-archive', sha256: 'a'.repeat(64), objectVersion: 'v1' };
    },
    async createDeliveryGrant({ ref }) {
      if (beforeSign) await beforeSign();
      return { url: `https://${hosts[0]}/${ref.key}?signature=fixture`, expiresAt: new Date(Date.now() + 290000), deliveryHost: hosts[0] };
    },
    matchesObject(grant, ref) { return new URL(grant.url).pathname === '/' + ref.key; },
  };
  const options = { enabled: true, hosts, adapters: { fixture: adapter } };
  const service = new DownloadService(sql, options), service2 = new DownloadService(other, options);
  let identity, selection, clientSecret, csrf, cookie;
  const handler = (op) => createDownloadHandler(op, { service, env });
  const http = (op, body = {}, extra = {}, id) => handler(op)(request('/api/downloads/' + op, body, { Cookie: cookie, 'X-CSRF-Token': csrf, ...extra }), id);
  const makeReady = async (id) => { await sql`UPDATE site_download_requests SET created_at=clock_timestamp()-INTERVAL '21 seconds',ready_at=clock_timestamp()-INTERVAL '1 second' WHERE id=${id}`; };
  const start = async () => (await service.admit(identity, selection, randomUUID())).data.request_id;
  try {
    await sql.unsafe(`CREATE TABLE applications(id INTEGER PRIMARY KEY,active BOOLEAN,published BOOLEAN);
      CREATE TABLE site_users(id TEXT PRIMARY KEY);
      CREATE TABLE site_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES site_users(id),expires_at TIMESTAMPTZ);`);
    await sql.unsafe(readFileSync(new URL('../migrations/001_downloads.sql', 'file://' + __filename), 'utf8'));
    t.beforeEach(async () => {
      await sql.unsafe(`TRUNCATE site_download_idempotency,site_download_requests,site_download_principals,site_download_clients,
        site_download_limit_state,site_download_mutex,site_download_files,site_download_app_config,site_download_versions,applications,site_users,site_sessions,site_download_budget CASCADE`);
      await sql`UPDATE site_download_settings SET enabled=true`;
      headMode = 'ok'; beforeSign = null;
      selection = { application_id: 1, version_id: randomUUID(), file_id: randomUUID() };
      await sql`INSERT INTO applications VALUES(1,true,true),(2,false,true),(3,true,false)`;
      await sql`INSERT INTO site_users VALUES('owner-test'),('visitor-test')`;
      await sql`INSERT INTO site_download_versions(id,application_id,version_label,release_key,active,published) VALUES(${selection.version_id},1,'1.0','fixture',true,true)`;
      await sql`INSERT INTO site_download_app_config(application_id,mode,current_version_id) VALUES(1,'direct',${selection.version_id})`;
      await sql`INSERT INTO site_download_files(id,version_id,variant_key,size_bytes,mime_type,download_filename,sha256,storage_backend,storage_key,storage_object_version,scan_status,verified_at,active)
        VALUES(${selection.file_id},${selection.version_id},'universal',100,'application/vnd.android.package-archive','fixture.apk',${'a'.repeat(64)},'fixture','artifacts/fixture.apk','v1','verified',clock_timestamp(),true)`;
      await sql`INSERT INTO site_download_budget(id,starts_at,expires_at,allowance_verified,byte_limit,max_outstanding) VALUES(1,clock_timestamp()-INTERVAL '1 day',clock_timestamp()+INTERVAL '30 days',true,1000000,20)`;
      const boot = await service.bootstrap(null, ['fixture-network']); clientSecret = boot.cookie; csrf = boot.csrf_token;
      const c = await service.client(clientSecret);
      identity = { clientId: c.id, userId: null, principal: 'client:' + c.id, networks: ['fixture-network'] };
      cookie = `wz_download_client=${clientSecret}`;
    });
    await t.test('request persists a 20s deadline and cannot issue early; status leaks no secrets', async () => {
      const id = await start(), status = await service.status(identity, id);
      const [admission] = await sql`SELECT created_at,ready_at FROM site_download_requests WHERE id=${id}`;
      assert.equal(admission.ready_at.getTime() - admission.created_at.getTime(), 20000);
      assert.equal(status.wait_seconds, 20);
      await assert.rejects(service.issue(identity, id), fails('DOWNLOAD_NOT_READY'));
      assert.ok(!JSON.stringify(status).match(/storage|sha256|signature|token_hash|wzdl1_/));
      await makeReady(id);
      const token = await service.issue(identity, id); assert.ok(rules.validToken(token.token));
      const [row] = await sql`SELECT * FROM site_download_requests WHERE id=${id}`;
      assert.equal(row.token_hash, rules.hashSecret(token.token)); assert.ok(!JSON.stringify(row).includes(token.token));
    });
    await t.test('real 20-second countdown allows issuance without backdating fixture state', async () => {
      const id = await start(); await assert.rejects(service.issue(identity, id), fails('DOWNLOAD_NOT_READY'));
      const status = await service.status(identity, id);
      await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(status.ready_at) - Date.now()) + 10));
      const result = await service.issue(identity, id);
      assert.ok(Date.parse(result.server_time) >= Date.parse(status.ready_at)); assert.ok(rules.validToken(result.token));
    });
    await t.test('50 admissions on independent pools create one request, shared deadline, all keys remain idempotent', async () => {
      const keys = Array.from({ length: 50 }, () => randomUUID());
      // Drain every transaction before assertions or the next TRUNCATE fixture reset.
      const settled = await Promise.allSettled(keys.map((key, i) => (i % 2 ? service2 : service).admit(identity, selection, key)));
      assert.deepEqual(settled.filter(x => x.status === 'rejected').map(x => x.reason?.code || 'UNKNOWN'), []);
      const responses = settled.map(x => x.value);
      assert.equal(new Set(responses.map(x => x.data.request_id)).size, 1);
      assert.equal(responses.filter(x => x.created).length, 1);
      assert.equal((await sql`SELECT count(*)::int AS n FROM site_download_requests`)[0].n, 1);
      await assert.rejects(service.admit(identity, { ...selection, application_id: 2 }, keys[0]), fails('IDEMPOTENCY_CONFLICT'));
    });
    await t.test('different file in a second tab conflicts; another client/user cannot inspect/issue', async () => {
      const id = await start();
      await assert.rejects(service.admit(identity, { ...selection, file_id: randomUUID() }, randomUUID()), fails('DOWNLOAD_IN_PROGRESS'));
      await assert.rejects(service.status({ ...identity, clientId: randomUUID() }, id), fails('REQUEST_NOT_FOUND'));
      await assert.rejects(service.issue({ ...identity, userId: 'visitor-test' }, id), fails('REQUEST_NOT_FOUND'));
    });
    await t.test('two login sessions share one principal; expired requests never trap a second browser', async () => {
      const logged = { ...identity, userId: 'visitor-test', principal: 'user:visitor-test' };
      const id = (await service.admit(logged, selection, randomUUID())).data.request_id;
      const second = await service.bootstrap(null, ['other-network']), client = await service.client(second.cookie);
      const another = { ...logged, clientId: client.id };
      await assert.rejects(service2.admit(another, selection, randomUUID()), fails('DOWNLOAD_IN_PROGRESS'));
      await assert.rejects(service2.status(another, id), fails('REQUEST_NOT_FOUND'));
      await sql`UPDATE site_download_requests SET created_at=clock_timestamp()-INTERVAL '10 minutes',ready_at=clock_timestamp()-INTERVAL '9 minutes',request_expires_at=clock_timestamp()-INTERVAL '1 second' WHERE id=${id}`;
      await sql`UPDATE site_download_principals SET next_download_at=clock_timestamp()-INTERVAL '1 second' WHERE key=${logged.principal}`;
      const result = await service2.admit(another, selection, randomUUID()); assert.equal(result.created, true);
      assert.notEqual(result.data.request_id, id);
    });
    await t.test('cooldown denied 429, denied calls do not change the deadline', async () => {
      const id = await start();
      await sql`UPDATE site_download_requests SET state='revoked' WHERE id=${id}`;
      const [old] = await sql`SELECT next_download_at FROM site_download_principals WHERE key=${identity.principal}`;
      await assert.rejects(start(), e => fails('DOWNLOAD_COOLDOWN')(e) && e.status === 429 && e.retrySeconds >= 19);
      assert.equal((await sql`SELECT next_download_at FROM site_download_principals WHERE key=${identity.principal}`)[0].next_download_at.getTime(), old.next_download_at.getTime());
    });
    await t.test('rotated token/replay rejected; expired token rotates without extending request', async () => {
      const id = await start(); await makeReady(id);
      const a = await service.issue(identity, id), b = await service.issue(identity, id);
      await assert.rejects(service.redeem(identity, id, a.token), fails('DOWNLOAD_NOT_FOUND'));
      await sql`UPDATE site_download_requests SET token_expires_at=clock_timestamp()-INTERVAL '1 second' WHERE id=${id}`;
      await assert.rejects(service.redeem(identity, id, b.token), fails('TOKEN_EXPIRED'));
      const expiry = (await service.status(identity, id)).request_expires_at;
      await service.issue(identity, id); assert.equal((await service.status(identity, id)).request_expires_at, expiry);
      await assert.rejects(service.issue(identity, id), fails('TOKEN_ISSUANCE_EXHAUSTED'));
      assert.equal((await service.status(identity, id)).state, 'revoked');
    });
    await t.test('50 concurrent redemptions disclose one URL and commit one consumption', async () => {
      const id = await start(); await makeReady(id); const { token } = await service.issue(identity, id);
      const results = await Promise.allSettled(Array.from({ length: 50 }, (_, i) => (i % 2 ? service : service2).redeem(identity, id, token)));
      assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
      assert.equal((await service.status(identity, id)).state, 'redeemed');
      await assert.rejects(service.redeem(identity, id, token), fails('TOKEN_USED'));
      const [budget] = await sql`SELECT reserved_bytes FROM site_download_budget`; assert.equal(Number(budget.reserved_bytes), 200);
    });
    await t.test('expired request cannot restart via idempotent replay', async () => {
      const key = randomUUID(), admission = await service.admit(identity, selection, key), id = admission.data.request_id;
      await sql`UPDATE site_download_requests SET created_at=clock_timestamp()-INTERVAL '10 minutes',ready_at=clock_timestamp()-INTERVAL '9 minutes',request_expires_at=clock_timestamp()-INTERVAL '1 second' WHERE id=${id}`;
      await assert.rejects(service.issue(identity, id), fails('REQUEST_EXPIRED'));
      const replay = await service.admit(identity, selection, key); assert.equal(replay.data.request_id, id); assert.equal(replay.data.state, 'expired');
    });
    for (const [name, change] of [
      ['inactive app', () => sql`UPDATE applications SET active=false WHERE id=1`],
      ['unpublished app', () => sql`UPDATE applications SET published=false WHERE id=1`],
      ['inactive file', () => sql`UPDATE site_download_files SET active=false`],
      ['unpublished version', () => sql`UPDATE site_download_versions SET published=false`],
      ['quarantined file', () => sql`UPDATE site_download_files SET scan_status='quarantined'`],
      ['legacy app', () => sql`UPDATE site_download_app_config SET mode='legacy'`],
    ]) await t.test(`${name} denies admission and rechecks issuance`, async () => {
      const id = await start(); await makeReady(id); await change();
      await assert.rejects(service.issue(identity, id), fails('FILE_UNAVAILABLE'));
      assert.equal((await service.status(identity, id)).state, 'revoked');
      await assert.rejects(start(), e => e instanceof rules.DownloadError);
    });
    await t.test('wrong file/version/parent chain fails closed', async () => {
      for (const data of [{ ...selection, application_id: 2 }, { ...selection, file_id: randomUUID() }, { ...selection, version_id: randomUUID() }])
        await assert.rejects(service.admit(identity, data, randomUUID()), fails('FILE_UNAVAILABLE'));
    });
    await t.test('withdrawal during signing prevents URL disclosure; no token consumption', async () => {
      const id = await start(); await makeReady(id); const { token } = await service.issue(identity, id);
      beforeSign = () => other`UPDATE applications SET published=false WHERE id=1`;
      await assert.rejects(service.redeem(identity, id, token), fails('FILE_UNAVAILABLE'));
      assert.equal((await service.status(identity, id)).state, 'revoked');
    });
    await t.test('object HEAD failure preserves token; mismatched checksum metadata quarantines file', async () => {
      const id = await start(); await makeReady(id); const { token } = await service.issue(identity, id);
      headMode = 'missing'; await assert.rejects(service.redeem(identity, id, token), fails('FILE_UNAVAILABLE'));
      assert.equal((await service.status(identity, id)).state, 'issued');
      headMode = 'mismatch'; await assert.rejects(service.redeem(identity, id, token), fails('FILE_INTEGRITY_UNAVAILABLE'));
      assert.equal((await sql`SELECT scan_status FROM site_download_files`)[0].scan_status, 'quarantined');
    });
    await t.test('shared/deployment kill switches and absent provider prevent grants', async () => {
      const id = await start(); await makeReady(id); await service.disable('owner-test');
      await assert.rejects(service.issue(identity, id), fails('DIRECT_DOWNLOAD_UNAVAILABLE'));
      await sql`UPDATE site_download_settings SET enabled=true`;
      await assert.rejects(new DownloadService(sql, { ...options, enabled: false }).admit(identity, selection, randomUUID()), e => e.status === 429 || e.code === 'DIRECT_DOWNLOAD_UNAVAILABLE');
      await sql`UPDATE site_download_principals SET next_download_at=clock_timestamp()-INTERVAL '1 second'`;
      await assert.rejects(new DownloadService(sql, { ...options, adapters: {} }).admit(identity, selection, randomUUID()), fails('FILE_UNAVAILABLE'));
    });
    await t.test('unverified/exhausted/expired byte budgets fail before token; rotations reserve once', async () => {
      const id = await start(); await makeReady(id);
      await sql`UPDATE site_download_budget SET allowance_verified=false`;
      await assert.rejects(service.issue(identity, id), fails('DELIVERY_BUDGET_UNAVAILABLE'));
      await sql`UPDATE site_download_budget SET allowance_verified=true,byte_limit=199`;
      await assert.rejects(service.issue(identity, id), fails('DELIVERY_BUDGET_EXHAUSTED'));
      await sql`UPDATE site_download_budget SET byte_limit=1000000`;
      await service.issue(identity, id); await service.issue(identity, id);
      assert.equal(Number((await sql`SELECT reserved_bytes FROM site_download_budget`)[0].reserved_bytes), 200);
      await sql`UPDATE site_download_budget SET expires_at=clock_timestamp()-INTERVAL '1 second'`;
      await assert.rejects(service.issue(identity, id), fails('DELIVERY_BUDGET_UNAVAILABLE'));
    });
    await t.test('byte budget last slot reserved once under concurrent token issuance across clients', async () => {
      const a = await start(); await makeReady(a);
      const boot = await service2.bootstrap(null, ['other-network']), client = await service2.client(boot.cookie);
      const another = { ...identity, clientId: client.id, principal: 'client:' + client.id };
      const b = (await service2.admit(another, selection, randomUUID())).data.request_id; await makeReady(b);
      await sql`UPDATE site_download_budget SET byte_limit=200`;
      const result = await Promise.allSettled([service.issue(identity, a), service2.issue(another, b)]);
      assert.equal(result.filter(x => x.status === 'fulfilled').length, 1);
      assert.equal(result.find(x => x.status === 'rejected').reason.code, 'DELIVERY_BUDGET_EXHAUSTED');
      assert.equal(Number((await sql`SELECT reserved_bytes FROM site_download_budget`)[0].reserved_bytes), 200);
    });
    await t.test('old-period reservations cannot bypass a reconciled budget reset', async () => {
      const id = await start(); await makeReady(id); const { token } = await service.issue(identity, id);
      await sql`UPDATE site_download_budget SET starts_at=clock_timestamp()-INTERVAL '1 second',reserved_bytes=0`;
      await assert.rejects(service.redeem(identity, id, token), fails('DELIVERY_BUDGET_UNAVAILABLE'));
      assert.equal((await service.status(identity, id)).state, 'issued');
    });
    await t.test('shared global outstanding-grant cap prevents another token even with remaining bytes', async () => {
      const a = await start(); await makeReady(a); await service.issue(identity, a);
      const boot = await service2.bootstrap(null, ['other-network']), client = await service2.client(boot.cookie);
      const another = { ...identity, clientId: client.id, principal: 'client:' + client.id };
      const b = (await service2.admit(another, selection, randomUUID())).data.request_id; await makeReady(b);
      await sql`UPDATE site_download_budget SET max_outstanding=1`;
      await assert.rejects(service2.issue(another, b), e => fails('DELIVERY_CAPACITY_REACHED')(e) && e.status === 429 && e.retrySeconds === 20);
    });
    await t.test('principal lock wait uses fresh DB time for the entire 20s interval', async () => {
      // Establish the row, then contend on it using an independent transaction/connection.
      await sql`INSERT INTO site_download_principals(key) VALUES(${identity.principal})`;
      let acquired; const locked = new Promise(resolve => { acquired = resolve; });
      const blocker = other.begin(async tx => {
        await tx`SELECT key FROM site_download_principals WHERE key=${identity.principal} FOR UPDATE`;
        acquired(); await tx`SELECT pg_sleep(0.2)`;
      });
      await locked;
      const started = Date.now(), admission = await service.admit(identity, selection, randomUUID()); await blocker;
      assert.ok(Date.parse(admission.data.server_time) >= started + 150);
      assert.equal(Date.parse(admission.data.ready_at) - Date.parse(admission.data.server_time), 20000);
    });
    await t.test('rolling quotas serialize last network admission slot across workers', async () => {
      await start();
      // Populate accepted events with unique identities via fixture SQL only.
      const [base] = await sql`SELECT * FROM site_download_requests LIMIT 1`;
      for (let i = 0; i < 38; i++) {
        const principal = 'fixture-principal-' + i; await sql`INSERT INTO site_download_principals(key) VALUES(${principal})`;
        await sql`INSERT INTO site_download_requests(id,principal_key,client_id,application_id,version_id,file_id,file_snapshot,idempotency_key,payload_hash,network_hashes,created_at,ready_at,request_expires_at,state)
          VALUES(${randomUUID()},${principal},${identity.clientId},1,${selection.version_id},${selection.file_id},${base.file_snapshot},${randomUUID()},'fixture',${sql.array(identity.networks)},clock_timestamp()-INTERVAL '60 seconds',clock_timestamp()-INTERVAL '40 seconds',clock_timestamp()+INTERVAL '1 minute','revoked')`;
      }
      const visitors = await Promise.all([service.bootstrap(null, ['different-network']), service2.bootstrap(null, ['another-network'])]);
      const ids = await Promise.all(visitors.map(x => service.client(x.cookie)));
      const results = await Promise.allSettled(ids.map((c, i) => (i ? service : service2).admit({ ...identity, clientId: c.id, principal: 'client:' + c.id }, selection, randomUUID())));
      assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
      assert.equal(results.find(x => x.status === 'rejected').reason.status, 429);
    });
    await t.test('HTTP writes enforce CSRF, exact fields, identity, UUID and Retry-After', async () => {
      assert.equal((await http('request', selection, { 'X-CSRF-Token': 'forged' })).status, 403);
      assert.equal((await http('request', selection, { Origin: 'https://evil.example' })).status, 403);
      assert.equal((await http('request', { ...selection, storage_key: 'evil' })).status, 400);
      assert.equal((await http('request', selection)).status, 400);
      const admitted = await http('request', selection, { 'Idempotency-Key': randomUUID() }); assert.equal(admitted.status, 201);
      const { request_id } = await admitted.json();
      const early = await http('token', {}, {}, request_id); assert.equal(early.status, 425); assert.ok(Number(early.headers.get('retry-after')) > 0);
      assert.match(early.headers.get('cache-control'), /no-store/); assert.equal(early.headers.get('referrer-policy'), 'no-referrer');
      assert.equal((await http('request', selection, { 'Idempotency-Key': randomUUID() })).status, 200);
      const limited = await http('request', selection, { 'Idempotency-Key': randomUUID() }); assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
    });
    await t.test('malformed unauthenticated attempts exhaust network bucket; forged forwarding gives no fresh bucket', async (t) => {
      // Spec sections 5.1/6: invalid attempts spend tokens; 401 is correct while capacity
      // remains, 429 takes precedence once exhausted. A 42-request wall-clock loop is
      // flaky: CI can refill >=3 tokens at 120/min while executing the same burst.
      // Freeze only the services' DB-time read, leaving real SQL locks/state/refill intact.
      const [clock] = await sql`SELECT clock_timestamp() AS time`;
      let now = clock.time;
      t.mock.method(service, 'time', async () => now);
      t.mock.method(service2, 'time', async () => now);
      const handlers = [handler('request'), createDownloadHandler('request', { service: service2, env })];
      const forged = (i) => ({ 'x-forwarded-for': `1.2.3.${i}, 203.0.113.1`, 'x-real-ip': `1.2.4.${i}`,
        Forwarded: `for="[2001:db8::${i}]";proto=https`, 'cf-connecting-ip': `1.2.5.${i}` });
      const attempt = (i) => handlers[i % 2](request('/api/downloads/requests', {}, forged(i)));
      const network = trustedNetworks(request('/api/downloads/requests'), env)[0];
      const buckets = () => sql`SELECT key,tokens FROM site_download_limit_state WHERE key LIKE 'ingress:%' ORDER BY key`;
      for (let i = 0; i < 40; i++) {
        const response = await attempt(i);
        assert.equal(response.status, 401);
        assert.equal((await response.json()).error.code, 'DOWNLOAD_SESSION_REQUIRED');
      }
      assert.deepEqual(await buckets().then(rows => Array.from(rows)), [{ key: `ingress:${network}`, tokens: 0 }]);
      for (const response of await Promise.all(Array.from({ length: 10 }, (_, i) => attempt(40 + i)))) {
        assert.equal(response.status, 429);
        assert.equal(response.headers.get('retry-after'), '1');
        const body = await response.json();
        assert.equal(body.error.code, 'RATE_LIMITED');
        assert.equal(body.error.retry_after_seconds, 1);
        assert.equal(Date.parse(body.error.retry_at) - now.getTime(), 500);
        assert.ok(!JSON.stringify(body).includes(network));
      }
      // Spoofing cannot reset the shared bucket; only the configured refill can permit a call.
      now = new Date(now.getTime() + 499);
      assert.equal((await attempt(50)).status, 429);
      now = new Date(now.getTime() + 1);
      assert.equal((await attempt(51)).status, 401);
      assert.deepEqual(await buckets().then(rows => Array.from(rows)), [{ key: `ingress:${network}`, tokens: 0 }]);
    });
    await t.test('HTTP status is client-bound, read-limited and never changes cooldown', async () => {
      const id = await start();
      const get = (headers = {}) => handler('status')(request('/api/downloads/requests/' + id, {}, { Cookie: cookie, ...headers }, 'GET'), id);
      const before = (await service.status(identity, id)).next_download_at;
      const status = await get(); assert.equal(status.status, 200);
      assert.ok(!JSON.stringify(await status.json()).match(/storage_key|token_hash|signature/));
      for (let i = 0; i < 4; i++) assert.equal((await get()).status, 200);
      const limited = await get(); assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
      assert.equal((await service.status(identity, id)).next_download_at, before);
      assert.equal((await get({ Cookie: '' })).status, 401);
    });
    await t.test('limiter database outage denies before admission and hides SQL details', async () => {
      await sql.unsafe('ALTER TABLE site_download_limit_state RENAME TO unavailable_limits');
      const response = await http('request', selection, { 'Idempotency-Key': randomUUID() });
      assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('site_download_limit_state'));
      assert.equal((await sql`SELECT count(*)::int AS n FROM site_download_requests`)[0].n, 0);
      await sql.unsafe('ALTER TABLE unavailable_limits RENAME TO site_download_limit_state');
    });
    await t.test('HTTP bootstrap, native form redemption is 303 with zero byte body; GET/HEAD cannot consume', async () => {
      const boot = await handler('session')(request('/api/downloads/session')); assert.equal(boot.status, 200);
      const secret = boot.headers.get('set-cookie').split(';')[0];
      assert.match(secret, /^wz_download_client=/); assert.match(boot.headers.get('set-cookie'), /HttpOnly/);
      const c = await service.client(secret.split('=')[1]); const ident = { ...identity, clientId: c.id, principal: 'client:' + c.id };
      const data = await boot.json(); const id = (await service.admit(ident, selection, randomUUID())).data.request_id;
      await makeReady(id); const { token } = await service.issue(ident, id);
      assert.equal((await handler('redeem')(request('/api/downloads/redeem', {}, {}, 'GET'))).status, 405);
      const form = new URLSearchParams({ request_id: id, token, csrf_token: data.csrf_token });
      const native = () => new Request(env.NEXT_PUBLIC_SITE_URL + '/api/downloads/redeem', { method: 'POST',
        headers: { Origin: env.NEXT_PUBLIC_SITE_URL, 'x-verified-client-ip': '198.51.100.10', Cookie: secret,
          'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
      const redirect = await handler('redeem')(native()); assert.equal(redirect.status, 303);
      assert.equal(await redirect.text(), ''); assert.ok(redirect.headers.get('location').startsWith('https://' + hosts[0]));
      const replay = await handler('redeem')(native()); assert.equal(replay.status, 410); assert.match(await replay.text(), /data-error-code="TOKEN_USED"/);
    });
    await t.test('owner kill switch denies ordinary users and stats automation; auth outage never anonymous', async () => {
      const authSecret = rules.newSecret();
      await sql`INSERT INTO site_sessions VALUES(${rules.hashSecret(authSecret)},'owner-test',clock_timestamp()+INTERVAL '1 hour')`;
      assert.equal((await http('control', { enabled: false }, { Authorization: 'Bearer stats-token' })).status, 401);
      const response = await http('control', { enabled: false }, { Cookie: cookie + '; wz_session=' + authSecret }); assert.equal(response.status, 200);
      assert.equal((await sql`SELECT enabled FROM site_download_settings`)[0].enabled, false);
      assert.equal((await http('request', selection, { Cookie: cookie + '; wz_session=forged' })).status, 401);
      await sql.unsafe('ALTER TABLE site_sessions RENAME TO unavailable_sessions');
      const failed = await http('request', selection, { Cookie: cookie + '; wz_session=' + authSecret }); assert.equal(failed.status, 503);
      assert.ok(!(await failed.text()).includes('unavailable_sessions'));
      await sql.unsafe('ALTER TABLE unavailable_sessions RENAME TO site_sessions');
    });
  } finally {
    await sql.end(); await other.end();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
