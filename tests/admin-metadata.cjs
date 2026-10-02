'use strict';
// Phase 4 metadata defenses that Admin must preserve. These are NOT Admin API tests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync,writeFileSync,mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {createHash}=require('node:crypto');
require('./downloads/harness.cjs').blockExternalIO();
function sqlFor(db) {
  const run=(text,values=[])=>db.query(text,values).then(r=>r.rows);
  const sql=(parts,...values)=>run(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values);
  sql.unsafe=run;
  sql.begin=(mode,fn)=>db.transaction(async tx=>{await tx.exec('SET TRANSACTION '+mode);return fn(sqlFor(tx));});
  return sql;
}
test('metadata lifecycle/relationship defenses in disposable PostgreSQL (Admin integration prerequisite)',async t=>{
  const {manageMetadata,manageConfig}=await import('../scripts/lib/download-metadata.mjs');
  const db=await PGlite.create(),sql=sqlFor(db),folder=mkdtempSync(join(tmpdir(),'wz-admin-metadata-'));
  t.after(async()=>{await db.close();rmSync(folder,{recursive:true,force:true});});
  await db.exec(`CREATE TABLE applications(id INTEGER PRIMARY KEY,name TEXT,active BOOLEAN,published BOOLEAN);CREATE TABLE site_users(id TEXT PRIMARY KEY);INSERT INTO applications VALUES(201,'QA app',true,true),(202,'Other app',true,true),(999,'Draft',true,false)`);
  await db.exec(readFileSync(join(__dirname,'../migrations/001_downloads.sql'),'utf8'));
  const bytes=Buffer.from('Inert local QA artifact.\n'),file=join(folder,'qa.apk');writeFileSync(file,bytes);
  const base={schema_version:1,application_id:201,version_label:'1.0',release_key:'qa-r1',variant_key:'universal',artifact_type:'apk',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),mime_type:'application/vnd.android.package-archive',download_filename:'qa.apk',storage_backend:'fixture',storage_key:'qa/metadata.apk',storage_object_version:'fixture-v1',file_state:'pending',version_state:'pending'};
  const database=(await sql`SELECT current_database() AS name`)[0].name;
  const options={database,verifyFile:file};
  const verified={...base,file_state:'verified',verification:{scanner:'QA local fixture',scan_reference:'QA-report',scanned_sha256:base.sha256}};
  const active={...verified,file_state:'active',version_state:'active'},published={...active,version_state:'published'};
  const snap=async()=>JSON.stringify(await sql`SELECT (SELECT jsonb_agg(v) FROM site_download_versions v) AS versions,(SELECT jsonb_agg(f) FROM site_download_files f) AS files,(SELECT jsonb_agg(c) FROM site_download_app_config c) AS configs,(SELECT jsonb_agg(s) FROM site_download_settings s) AS settings`);
  const apply=async m=>{const plan=await manageMetadata(sql,m,options);return manageMetadata(sql,m,{...options,apply:true,expectPlan:plan.plan_sha256});};
  await t.test('new active/verified/published artifacts cannot skip pending',async()=>{
    const before=await snap();for(const m of [verified,active,published])await assert.rejects(apply(m));assert.equal(await snap(),before);
  });
  await apply(base);
  await t.test('pending cannot skip verification',async()=>{const before=await snap();await assert.rejects(apply(active),/verified/);assert.equal(await snap(),before);});
  await t.test('verification requires independently matching inert local bytes',async()=>{
    const before=await snap();await assert.rejects(manageMetadata(sql,verified,{database}),/verify-file/);
    writeFileSync(file,Buffer.alloc(bytes.length));await assert.rejects(manageMetadata(sql,verified,options),/SHA-256/);writeFileSync(file,bytes);assert.equal(await snap(),before);
  });
  await apply(verified);
  await t.test('verified metadata cannot be rewritten or downgraded',async()=>{
    const before=await snap();await assert.rejects(apply({...verified,storage_key:'replacement.apk'}),/separate operation|immutable/);await assert.rejects(apply(base),/downgrade/);assert.equal(await snap(),before);
  });
  await t.test('verified cannot skip active on publication',async()=>{await assert.rejects(apply(published),/pass through active/);});
  await apply(active);await apply(published);
  await t.test('published cannot downgrade or rewrite labels',async()=>{await assert.rejects(apply(active),/downgrade/);await assert.rejects(apply({...published,version_label:'spoof'}),/label edits/);});
  await t.test('IDOR defense: another application cannot select this version (real FK)',async()=>{
    const [{id}]=await sql`SELECT id FROM site_download_versions WHERE application_id=201`;
    const before=await snap();await assert.rejects(sql`UPDATE site_download_app_config SET current_version_id=${id} WHERE application_id=202`);assert.equal(await snap(),before);
  });
  await t.test('reusing an object key across application/release rejected',async()=>{await assert.rejects(apply({...base,application_id:202}),/already belongs/);});
  await t.test('nonexistent applications cannot create artifacts/config',async()=>{
    const before=await snap();await assert.rejects(apply({...base,application_id:2147483647}),/does not exist/);
    await assert.rejects(manageConfig(sql,{schema_version:1,application_id:2147483647,config_mode:'disabled'},{database}),/does not exist/);assert.equal(await snap(),before);
  });
  await t.test('direct metadata activation lacks settings/budget/provider/ingress gates and cannot write',async()=>{
    const m={...published,config_mode:'direct'},before=await snap(),plan=await manageMetadata(sql,m,options);
    assert.ok(plan.blockers.some(x=>/settings are disabled/.test(x)));assert.ok(plan.blockers.some(x=>/budget/.test(x)));assert.ok(plan.blockers.some(x=>/Provider\/ingress/.test(x)));
    await assert.rejects(manageMetadata(sql,m,{...options,apply:true,expectPlan:plan.plan_sha256}),/Direct mode blocked/);assert.equal(await snap(),before);
  });
  await t.test('config-only direct cannot bypass unconditional rollout deny even with valid published selection',async()=>{
    const m={schema_version:1,application_id:201,config_mode:'direct',release_key:'qa-r1'},before=await snap();const plan=await manageConfig(sql,m,{database});
    assert.ok(plan.blockers.some(x=>/intentionally blocked/.test(x)));await assert.rejects(manageConfig(sql,m,{database,apply:true,expectPlan:plan.plan_sha256}),/Direct mode blocked/);assert.equal(await snap(),before);
  });
  await t.test('cross-application release lookup cannot change current selection',async()=>{
    const m={schema_version:1,application_id:202,config_mode:'direct',release_key:'qa-r1'};const plan=await manageConfig(sql,m,{database});assert.equal(plan.selection,null);assert.ok(plan.blockers.length);await assert.rejects(manageConfig(sql,m,{database,apply:true,expectPlan:plan.plan_sha256}));
  });
  for(const state of ['quarantined','failed'])await t.test(`${state} file cannot be revived; emergency config disable still works`,async()=>{
    await sql`UPDATE site_download_files SET scan_status=${state},active=false`;
    await assert.rejects(apply(published),/cannot be revived/);
    const m={schema_version:1,application_id:201,config_mode:'disabled'},plan=await manageConfig(sql,m,{database});await manageConfig(sql,m,{database,apply:true,expectPlan:plan.plan_sha256});
    assert.equal((await sql`SELECT scan_status FROM site_download_files`)[0].scan_status,state);
  });
  await t.test('retired file cannot be revived',async()=>{await sql`UPDATE site_download_files SET scan_status='verified',retired_at=clock_timestamp()`;await assert.rejects(apply(published),/cannot be revived/);});
  await t.test('missing metadata table fails without recreating migration or changing other tables',async()=>{
    await sql`ALTER TABLE site_download_versions RENAME TO missing_versions`;
    await assert.rejects(manageMetadata(sql,base,options));
    assert.equal((await sql`SELECT to_regclass('site_download_versions') AS table_name`)[0].table_name,null);
    assert.equal((await sql`SELECT enabled FROM site_download_settings`)[0].enabled,false);
  });
});
