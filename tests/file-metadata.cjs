const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const postgres = require('postgres');
const modulePromise = import('../scripts/lib/download-metadata.mjs');
const bytes = Buffer.from('Tiny inert metadata test artifact; not an APK.\n');
const hash = createHash('sha256').update(bytes).digest('hex');
const pending = () => ({ schema_version: 1, application_id: 201, version_label: '1.0.0', release_key: '1.0.0-r1',
  variant_key: 'universal', artifact_type: 'apk', size_bytes: bytes.length, sha256: hash,
  mime_type: 'application/vnd.android.package-archive', download_filename: 'qa.apk', storage_backend: 'fixture',
  storage_key: 'artifacts/qa/1.0.0-r1/qa.apk', storage_object_version: 'immutable-fixture-v1', file_state: 'pending', version_state: 'pending' });
const verified = () => ({ ...pending(), file_state: 'verified', verification: { scanner: 'QA assertion only', scan_reference: 'fixture-report-1', scanned_sha256: hash } });
const active = () => ({ ...verified(), file_state: 'active', version_state: 'active' });
const published = () => ({ ...active(), version_state: 'published' });

test('metadata strict validation and input limits', async t => {
  const { validateManifest: validate, validateDatabaseUrl, validateConfigManifest } = await modulePromise;
  await t.test('default states are pending, config omitted preserves selection', () => {
    const m = pending(); delete m.file_state; delete m.version_state;
    assert.equal(validate(m).file_state, 'pending'); assert.equal(validate(m).version_state, 'pending'); assert.equal(validate(m).config_mode, undefined);
  });
  for (const [name, patch] of [
    ['unknown field', { force: true }], ['schema version', { schema_version: 2 }], ['application ID string', { application_id: '201' }],
    ['negative ID', { application_id: -1 }], ['invalid release key', { release_key: '../oops' }], ['invalid variant', { variant_key: 'x y' }],
    ['zero size', { size_bytes: 0 }], ['negative size', { size_bytes: -1 }], ['fractional size', { size_bytes: 1.5 }],
    ['string size', { size_bytes: '1' }], ['oversize', { size_bytes: 2147483649 }], ['unsafe integer', { size_bytes: Number.MAX_SAFE_INTEGER + 1 }],
    ['short SHA', { sha256: 'a'.repeat(63) }], ['uppercase SHA', { sha256: 'A'.repeat(64) }], ['nonhex SHA', { sha256: 'z'.repeat(64) }],
    ['APK MIME', { mime_type: 'application/octet-stream' }], ['MIME params', { mime_type: 'application/vnd.android.package-archive; charset=utf-8' }],
    ['artifact type', { artifact_type: 'zip' }], ['filename path', { download_filename: '../qa.apk' }], ['filename backslash', { download_filename: 'x\\qa.apk' }],
    ['filename header injection', { download_filename: 'qa\r\n.apk' }], ['filename bidi', { download_filename: 'qa\u202e.apk' }],
    ['filename extension', { download_filename: 'qa.exe' }], ['filename length', { download_filename: 'a'.repeat(177) + '.apk' }],
    ['filename quote', { download_filename: 'qa".apk' }], ['filename percent', { download_filename: 'qa%.apk' }], ['filename semicolon', { download_filename: 'qa;.apk' }],
    ['object traversal', { storage_key: 'objects/../qa.apk' }], ['object URL', { storage_key: 'https://example.test/qa.apk' }],
    ['object absolute path', { storage_key: '/qa.apk' }], ['object empty segment', { storage_key: 'objects//qa.apk' }],
    ['object query', { storage_key: 'qa.apk?token=secret' }], ['object percent traversal', { storage_key: 'objects/%2e%2e/qa.apk' }],
    ['missing object version field', { storage_object_version: undefined }], ['bad file state', { file_state: 'published' }],
    ['bad version state', { version_state: 'verified' }], ['bad config', { config_mode: 'anything' }], ['premature publication', { version_state: 'published' }],
  ]) await t.test(name, () => assert.throws(() => validate({ ...pending(), ...patch })));
  await t.test('size boundaries', () => { assert.equal(validate({ ...pending(), size_bytes: 1 }).size_bytes, 1); assert.equal(validate({ ...pending(), size_bytes: 2147483648 }).size_bytes, 2147483648); });
  await t.test('verification requires immutable object and bound scan assertion', () => {
    for (const patch of [{ verification: undefined }, { storage_object_version: null }, { verification: { ...verified().verification, scanned_sha256: 'a'.repeat(64) } },
      { verification: { ...verified().verification, approved: true } }]) assert.throws(() => validate({ ...verified(), ...patch }));
  });
  await t.test('pending scan assertion is rejected', () => assert.throws(() => validate({ ...pending(), verification: verified().verification })));
  await t.test('Railway verifies canonical immutable keys without inventing provider versions', () => {
    const m = { ...verified(), storage_backend: 'railway-s3', storage_object_version: null,
      storage_key: `artifacts/12345678-1234-4234-8234-123456789abc/${hash}.apk`,
      verification: { ...verified().verification, immutable_key: true } };
    assert.equal(validate(m).storage_object_version, null);
    for (const patch of [{ storage_object_version: 'invented' }, { storage_key: 'legacy.apk' },
      { storage_key: m.storage_key.replace(hash, 'a'.repeat(64)) },
      { verification: verified().verification }, { verification: { ...m.verification, immutable_key: false } }])
      assert.throws(() => validate({ ...m, ...patch }));
  });
  await t.test('all config enum values parse with correct state', () => { for (const mode of ['legacy', 'disabled', 'direct']) assert.equal(validate({ ...published(), config_mode: mode }).config_mode, mode); });
  await t.test('config-only schema accepts mode and rejects artifact fields/missing direct selection', () => {
    const base = { schema_version: 1, application_id: 201, config_mode: 'disabled' };
    assert.equal(validateConfigManifest(base).config_mode, 'disabled');
    for (const patch of [{ size_bytes: 1 }, { config_mode: 'direct' }, { release_key: 'unwanted' }, { application_id: 0 }, { schema_version: 2 }]) assert.throws(() => validateConfigManifest({ ...base, ...patch }));
    assert.equal(validateConfigManifest({ ...base, config_mode: 'direct', release_key: '1.0.0-r1' }).config_mode, 'direct');
  });
  await t.test('DB guard denies remote/production/search_path override', () => {
    for (const url of [undefined, 'postgres://user@prod.example/wz_metadata_test_a', 'postgres://user@127.0.0.1/production',
      'postgres://user@localhost/wz_metadata_test_a', 'postgres://user@127.0.0.1/wz_metadata_test_a?host=production',
      'postgres://user@127.0.0.1/wz_metadata_test_a#x', 'https://127.0.0.1/wz_metadata_test_a']) assert.throws(() => validateDatabaseUrl(url));
    assert.equal(validateDatabaseUrl('postgres://user@127.0.0.1:5432/wz_metadata_test_a'), 'wz_metadata_test_a');
  });
});

function cli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/download-metadata.mjs', ...args], { cwd: join(__dirname, '..'), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
    child.on('error', reject); child.on('exit', code => resolve({ code, stdout, stderr }));
  });
}

test('metadata CLI refuses unsafe flags/target before connecting', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'wz-metadata-args-'));
  const path = join(folder, 'manifest.json'); writeFileSync(path, JSON.stringify(pending()));
  try {
    assert.equal((await cli(['--help'])).code, 0);
    for (const args of [['--manifest', path, '--delete'], ['--manifest', path, '--apply', '--dry-run'], ['--manifest', path, '--expect-plan', hash]]) assert.equal((await cli(args)).code, 1);
    const result = await cli(['--manifest', path], { DOWNLOAD_METADATA_DATABASE_URL: '', DATABASE_URL: 'postgres://password-sentinel@prod.example/production' });
    assert.equal(result.code, 1); assert.ok(!result.stderr.includes('password-sentinel'));
    writeFileSync(path, ' '.repeat(65537)); assert.match((await cli(['--manifest', path])).stderr, /64 KiB/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('native disposable PostgreSQL metadata lifecycle', { skip: !process.env.WZ_METADATA_TEST_DATABASE_URL }, async t => {
  const { validateDatabaseUrl, manageMetadata: manage, manageConfig } = await modulePromise;
  const url = process.env.WZ_METADATA_TEST_DATABASE_URL;
  const database = validateDatabaseUrl(url);
  const sql = postgres(url, { max: 4, prepare: false, onnotice() {} });
  const other = postgres(url, { max: 1, prepare: false, onnotice() {} });
  const folder = mkdtempSync(join(tmpdir(), 'wz-metadata-native-'));
  const artifact = join(folder, 'inert.apk'), manifestPath = join(folder, 'manifest.json');
  writeFileSync(artifact, bytes);
  const options = { database, verifyFile: artifact };
  const snapshot = async () => JSON.stringify(await sql`SELECT
    (SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM site_download_versions v) AS versions,
    (SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM site_download_files f) AS files,
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY application_id) FROM site_download_app_config c) AS configs`);
  const apply = async (m, extra = {}) => {
    const plan = await manage(sql, m, { ...options, ...extra });
    return manage(sql, m, { ...options, ...extra, apply: true, expectPlan: plan.plan_sha256 });
  };
  try {
    const [existing] = await sql`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'`;
    assert.equal(existing.count, 0, 'Refusing non-empty disposable DB; create a fresh wz_metadata_test_<suffix>');
    await sql.unsafe(`CREATE TABLE applications(id INTEGER PRIMARY KEY,name TEXT,active BOOLEAN,published BOOLEAN);
      CREATE TABLE site_users(id TEXT PRIMARY KEY); INSERT INTO applications VALUES(201,'Legacy catalog sentinel',true,true),(202,'Draft',true,false);`);
    await sql.unsafe(readFileSync(join(__dirname, '../migrations/001_downloads.sql'), 'utf8'));
    const legacy = JSON.stringify(await sql`SELECT * FROM applications ORDER BY id`);
    await t.test('default dry-run is read-only, deterministic and inserts nothing', async () => {
      const before = await snapshot(); const p = await manage(sql, pending(), options);
      assert.equal(p.applied, false); assert.deepEqual(p.changes, ['version', 'file']);
      assert.equal(p.plan_sha256, (await manage(sql, pending(), options)).plan_sha256); assert.equal(await snapshot(), before);
    });
    await t.test('apply requires reviewed plan and database identity', async () => {
      await assert.rejects(manage(sql, pending(), { ...options, apply: true }), /expect-plan/);
      await assert.rejects(manage(sql, pending(), { ...options, database: 'different' }), /database/);
    });
    await t.test('cannot create already verified/active or published records', async () => {
      for (const m of [verified(), active(), published()]) await assert.rejects(manage(sql, m, options), /New files/);
      await assert.rejects(manage(sql, { ...pending(), application_id: 999 }, options), /Application does not exist/);
    });
    await t.test('insert pending, config remains legacy, repeat becomes no-op', async () => {
      assert.equal((await apply(pending())).applied, true);
      const before = await snapshot(); const plan = await manage(sql, pending(), options);
      assert.deepEqual(plan.changes, []); await apply(pending()); assert.equal(await snapshot(), before);
      const [f] = await sql`SELECT scan_status,active,verified_at FROM site_download_files`; assert.deepEqual({ ...f }, { scan_status: 'pending', active: false, verified_at: null });
    });
    await t.test('pending edit requires flag; review fingerprint includes flag', async () => {
      const edit = { ...pending(), download_filename: 'reviewed.apk' };
      await assert.rejects(manage(sql, edit, options), /allow-pending-update/);
      const plan = await manage(sql, edit, { ...options, allowPendingUpdate: true });
      assert.deepEqual(plan.changes, ['file']); await apply(edit, { allowPendingUpdate: true });
      await apply(pending(), { allowPendingUpdate: true });
    });
    await t.test('stale plan aborts atomically after independent change', async () => {
      const p = await manage(sql, verified(), { ...options, allowPendingUpdate: true });
      await other`UPDATE site_download_versions SET version_label='changed-by-other' WHERE application_id=201`;
      const before = await snapshot();
      await assert.rejects(manage(sql, verified(), { ...options, apply: true, expectPlan: p.plan_sha256, allowPendingUpdate: true }), /Plan changed/);
      assert.equal(await snapshot(), before); await apply(pending(), { allowPendingUpdate: true });
    });
    await t.test('cannot skip verified; missing/wrong local bytes deny verification', async () => {
      await assert.rejects(manage(sql, active(), options), /pass through verified/);
      await assert.rejects(manage(sql, verified(), { database }), /verify-file/);
      const wrong = join(folder, 'wrong.apk'); writeFileSync(wrong, Buffer.alloc(bytes.length, 0));
      await assert.rejects(manage(sql, verified(), { database, verifyFile: wrong }), /SHA-256/);
      writeFileSync(wrong, Buffer.alloc(bytes.length + 1)); await assert.rejects(manage(sql, verified(), { database, verifyFile: wrong }), /size/);
    });
    await t.test('verify stamps time; repeat preserves time; verified metadata immutable', async () => {
      await apply(verified()); const before = await snapshot(); await apply(verified()); assert.equal(await snapshot(), before);
      const [f] = await sql`SELECT scan_status,verified_at,active FROM site_download_files`; assert.equal(f.scan_status, 'verified'); assert.ok(f.verified_at); assert.equal(f.active, false);
      await assert.rejects(manage(sql, { ...verified(), storage_key: 'other.apk' }, { ...options, allowPendingUpdate: true }), /separate operation|immutable/);
      await assert.rejects(manage(sql, pending(), options), /downgrade/);
    });
    await t.test('cannot skip active publication; activate then publish with timestamp', async () => {
      await assert.rejects(manage(sql, published(), options), /pass through active/);
      await apply(active()); await apply(published());
      const [v] = await sql`SELECT active,published,published_at FROM site_download_versions`; assert.equal(v.active, true); assert.equal(v.published, true); assert.ok(v.published_at);
      const before = await snapshot(); await apply(published()); assert.equal(await snapshot(), before);
      await assert.rejects(manage(sql, active(), options), /downgrade/);
    });
    await t.test('publication refuses inactive/unpublished application', async () => {
      await other`UPDATE applications SET published=false WHERE id=201`;
      await assert.rejects(manage(sql, published(), options), /active published application/);
      await other`UPDATE applications SET published=true,active=false WHERE id=201`;
      await assert.rejects(manage(sql, published(), options), /active published application/);
      await other`UPDATE applications SET active=true WHERE id=201`;
    });
    await t.test('explicit disabled/legacy config is reversible; omitted config preserves mode', async () => {
      await apply({ ...published(), config_mode: 'disabled' }); await apply(published());
      assert.equal((await sql`SELECT mode FROM site_download_app_config WHERE application_id=201`)[0].mode, 'disabled');
      await apply({ ...published(), config_mode: 'legacy' });
    });
    await t.test('direct dry-run gives blockers; apply cannot mutate anything or global switches', async () => {
      const m = { ...published(), config_mode: 'direct' }; const before = await snapshot(); const p = await manage(sql, m, options);
      assert.ok(p.blockers.some(x => /intentionally blocked/.test(x))); assert.ok(p.blockers.some(x => /budget/.test(x)));
      await assert.rejects(manage(sql, m, { ...options, apply: true, expectPlan: p.plan_sha256 }), /Direct mode blocked/);
      assert.equal(await snapshot(), before); assert.equal((await sql`SELECT enabled FROM site_download_settings`)[0].enabled, false);
    });
    await t.test('object-key collision and quarantined/retired revival are denied', async () => {
      await assert.rejects(manage(sql, { ...pending(), release_key: 'different' }, options), /already belongs/);
      await other`UPDATE site_download_files SET scan_status='quarantined',active=false`;
      await assert.rejects(manage(sql, published(), options), /cannot be revived/);
      await other`UPDATE site_download_files SET scan_status='verified',active=true,retired_at=clock_timestamp()`;
      await assert.rejects(manage(sql, published(), options), /cannot be revived/);
      await other`UPDATE site_download_files SET retired_at=null`;
    });
    await t.test('config-only emergency disable works on quarantined file; metadata stays untouched', async () => {
      await other`UPDATE site_download_files SET scan_status='quarantined',active=false`;
      const m = { schema_version: 1, application_id: 201, config_mode: 'disabled' };
      const before = await snapshot(); const p = await manageConfig(sql, m, { database }); assert.equal(await snapshot(), before);
      await assert.rejects(manageConfig(sql, m, { database, apply: true, expectPlan: 'a'.repeat(64) }), /Plan changed/);
      await manageConfig(sql, m, { database, apply: true, expectPlan: p.plan_sha256 });
      const [f] = await sql`SELECT scan_status,active FROM site_download_files`; assert.equal(f.scan_status, 'quarantined'); assert.equal(f.active, false);
      const noop = await manageConfig(sql, m, { database }); assert.deepEqual(noop.changes, []);
      const snapshotBefore = await snapshot(); await manageConfig(sql, m, { database, apply: true, expectPlan: noop.plan_sha256 }); assert.equal(await snapshot(), snapshotBefore);
      const legacy = { ...m, config_mode: 'legacy' }, plan = await manageConfig(sql, legacy, { database });
      await manageConfig(sql, legacy, { database, apply: true, expectPlan: plan.plan_sha256 });
      await other`UPDATE site_download_files SET scan_status='verified',active=true`;
    });
    await t.test('config-only direct is blocked; unsafe selection cannot mutate config', async () => {
      const m = { schema_version: 1, application_id: 201, config_mode: 'direct', release_key: '1.0.0-r1' };
      const before = await snapshot(); const p = await manageConfig(sql, m, { database }); assert.ok(p.blockers.length);
      await assert.rejects(manageConfig(sql, m, { database, apply: true, expectPlan: p.plan_sha256 }), /Direct mode blocked/);
      assert.equal(await snapshot(), before);
      const bad = await manageConfig(sql, { ...m, release_key: 'missing' }, { database }); assert.ok(bad.blockers.some(x => /active\/published/.test(x)));
    });
    await t.test('config-only CLI works independently of artifact manifest', async () => {
      writeFileSync(manifestPath, JSON.stringify({ schema_version: 1, application_id: 201, config_mode: 'legacy' }));
      const args = ['--config-only', '--manifest', manifestPath], env = { DOWNLOAD_METADATA_DATABASE_URL: url };
      const result = await cli(args, env); assert.equal(result.code, 0, result.stderr); const p = JSON.parse(result.stdout);
      assert.equal((await cli([...args, '--apply', '--expect-plan', p.plan_sha256], env)).code, 0);
      assert.equal((await cli([...args, '--verify-file', artifact], env)).code, 1);
    });
    await t.test('native CLI emits review plan, then commits and reports no-op', async () => {
      writeFileSync(manifestPath, JSON.stringify(published()));
      const env = { DOWNLOAD_METADATA_DATABASE_URL: url };
      const result = await cli(['--manifest', manifestPath, '--verify-file', artifact], env);
      assert.equal(result.code, 0, result.stderr); const p = JSON.parse(result.stdout); assert.equal(p.applied, false);
      const applied = await cli(['--manifest', manifestPath, '--verify-file', artifact, '--apply', '--expect-plan', p.plan_sha256], env);
      assert.equal(applied.code, 0, applied.stderr); assert.deepEqual(JSON.parse(applied.stdout).changes, []);
      writeFileSync(manifestPath, JSON.stringify({ ...published(), config_mode: 'direct' }));
      const blocked = await cli(['--manifest', manifestPath, '--verify-file', artifact], env);
      assert.equal(blocked.code, 2); assert.ok(JSON.parse(blocked.stdout).blockers.length);
    });
    await t.test('concurrent same-plan inserts serialize; stale contender cannot duplicate', async () => {
      const m = { ...pending(), release_key: 'parallel', storage_key: 'parallel.apk' }; const p = await manage(sql, m, options);
      const results = await Promise.allSettled([sql, other].map(connection => manage(connection, m, { ...options, apply: true, expectPlan: p.plan_sha256 })));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal((await sql`SELECT count(*)::int AS n FROM site_download_versions WHERE release_key='parallel'`)[0].n, 1);
      assert.equal((await sql`SELECT count(*)::int AS n FROM site_download_files WHERE storage_key='parallel.apk'`)[0].n, 1);
      assert.deepEqual((await manage(sql, m, options)).changes, []);
    });
    await t.test('database constraint failure rolls back version/file/config together', async () => {
      await sql.unsafe(`CREATE FUNCTION reject_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.storage_key='reject.apk' THEN RAISE EXCEPTION 'fixture only'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_fixture BEFORE INSERT ON site_download_files FOR EACH ROW EXECUTE FUNCTION reject_fixture();`);
      const m = { ...pending(), release_key: 'rollback', storage_key: 'reject.apk', config_mode: 'disabled' };
      const before = await snapshot(); await assert.rejects(apply(m)); assert.equal(await snapshot(), before);
    });
    await t.test('legacy applications/bot-like fields and safety/budget tables preserved', async () => {
      assert.equal(JSON.stringify(await sql`SELECT * FROM applications ORDER BY id`), legacy);
      assert.equal((await sql`SELECT enabled FROM site_download_settings`)[0].enabled, false);
      assert.equal((await sql`SELECT count(*)::int AS n FROM site_download_budget`)[0].n, 0);
      assert.equal((await sql`SELECT count(*)::int AS n FROM site_download_requests`)[0].n, 0);
    });
    await t.test('new legacy applications get legacy config; unchanged manifests preserve current pointer', async () => {
      await sql`INSERT INTO applications(id,name,active,published) VALUES(203,'Post-migration fixture',true,true)`;
      const m = { ...pending(), application_id: 203, storage_key: 'post-migration.apk' };
      await apply(m);
      const [c] = await sql`SELECT mode,current_version_id FROM site_download_app_config WHERE application_id=203`;
      assert.equal(c.mode, 'legacy'); assert.equal(c.current_version_id, null);
      const [v] = await sql`SELECT id FROM site_download_versions WHERE application_id=203`;
      await sql`UPDATE site_download_app_config SET current_version_id=${v.id},mode='disabled' WHERE application_id=203`;
      await apply(m); assert.equal((await sql`SELECT current_version_id FROM site_download_app_config WHERE application_id=203`)[0].current_version_id, v.id);
    });
    await t.test('all active siblings must be immutable verified objects before publication', async () => {
      const [v] = await sql`SELECT id FROM site_download_versions WHERE application_id=201 AND release_key='1.0.0-r1'`;
      await sql`INSERT INTO site_download_files(id,version_id,variant_key,artifact_type,size_bytes,sha256,mime_type,download_filename,storage_backend,storage_key,scan_status,active)
        VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd',${v.id},'bad-sibling','apk',${bytes.length},${hash},${pending().mime_type},'qa.apk','fixture','bad-sibling.apk','pending',true)`;
      await assert.rejects(manage(sql, published(), options), /all active variants/);
      await sql`UPDATE site_download_files SET active=false WHERE variant_key='bad-sibling'`;
    });
    await t.test('Railway staged metadata binds planned UUID/hash, preserves null version, and never enables direct', async () => {
      const seed = { ...pending(), release_key: 'railway-r1', storage_key: 'railway-seed.apk' };
      const id = (await manage(sql, seed, options)).file.after.id;
      const m = { ...seed, storage_backend: 'railway-s3', storage_object_version: null, storage_key: `artifacts/${id}/${hash}.apk` };
      await assert.rejects(manage(sql, { ...m, storage_key: m.storage_key.replace(id, '12345678-1234-4234-8234-123456789abc') }, options), /exact planned file UUID/);
      await apply(m);
      const v = { ...m, file_state: 'verified', verification: { ...verified().verification, immutable_key: true } };
      await apply(v); await apply({ ...v, file_state: 'active', version_state: 'active' });
      const pub = { ...v, file_state: 'active', version_state: 'published' };
      await apply(pub); const before = await snapshot(); await apply(pub); assert.equal(await snapshot(), before);
      const [f] = await sql`SELECT id,storage_key,storage_object_version,scan_status FROM site_download_files WHERE id=${id}`;
      assert.equal(f.storage_key, `artifacts/${id}/${hash}.apk`); assert.equal(f.storage_object_version, null); assert.equal(f.scan_status, 'verified');
      const direct = { ...pub, config_mode: 'direct' }, plan = await manage(sql, direct, options);
      await assert.rejects(manage(sql, direct, { ...options, apply: true, expectPlan: plan.plan_sha256 }), /Direct mode blocked/);
      assert.equal(await snapshot(), before);
    });
  } finally {
    await sql.end(); await other.end(); rmSync(folder, { recursive: true, force: true });
    // Keep the uniquely named disposable database for inspection; never reset a catalog.
  }
});
