'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{readFileSync}=require('node:fs'),{createHash}=require('node:crypto');
const connection=process.env.WZ_MONETIZATION_TEST_DATABASE_URL,strict=process.env.WZ_MONETIZATION_CONTRACT_STRICT==='1';
test('005 release runner: fresh/idempotent/checksum/concurrency and existing data preservation',{skip:!connection&&!strict?'Dedicated loopback PostgreSQL fixture is not configured':false,timeout:90000},async t=>{
 assert.ok(connection,'Strict migration gate requires disposable PostgreSQL');
 const url=new URL(connection);assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&/^\/wz_monetization_test(?:_[a-z0-9]+)?$/.test(url.pathname),'Refuse non-fixture database');
 const sql=require('postgres')(connection,{prepare:false,max:2});t.after(()=>sql.end());
 const [existing]=await sql`SELECT to_regclass('applications') AS present`;assert.equal(existing.present,null,'Refuse non-empty fixture');
 await sql.unsafe('CREATE TABLE applications(id INTEGER PRIMARY KEY,name TEXT,description TEXT,version TEXT,size TEXT,category TEXT,platform TEXT,developer TEXT,image_url TEXT,search_text TEXT,icon_file_id TEXT,active BOOLEAN,published BOOLEAN,downloads INTEGER,views INTEGER,shrankme_url TEXT,devupload_url TEXT,created_at TIMESTAMPTZ)');
 await sql`INSERT INTO applications(id,name,description,version,platform,category,developer,active,published,downloads,views) VALUES(201,'Fixture audit crack',${'Meaningful fixture description '.repeat(20)},'1','Android','Utilities','Fixture',true,true,3,4)`;
 await sql.unsafe('CREATE TABLE site_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE site_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES site_users(id),expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 const run=(args)=>new Promise(resolve=>{const child=spawn(process.execPath,args,{env:{...process.env,DATABASE_URL:connection},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('exit',code=>resolve({code,output}));});
 for(const name of ['downloads','delivery','runtime-security'])assert.equal((await run(['scripts/migrate-'+name+'.mjs'])).code,0);
 await sql`INSERT INTO site_users(id,name,email,password_hash) VALUES('fixture-owner','Owner','owner@example.test','disabled')`;
 await sql`INSERT INTO site_sessions(token_hash,user_id,expires_at) VALUES(${'a'.repeat(64)},'fixture-owner',NOW()+INTERVAL '1 day')`;
 await sql`INSERT INTO site_delivery_sources(application_id,provider,telegram_channel_username,telegram_message_id) VALUES(201,'telegram','files_channel',123)`;
 const snapshot=async()=>JSON.stringify(await sql`SELECT (SELECT jsonb_agg(a) FROM applications a) AS apps,(SELECT jsonb_agg(s) FROM site_sessions s) AS sessions,(SELECT jsonb_agg(u) FROM site_users u) AS users,(SELECT jsonb_agg(d) FROM site_delivery_sources d) AS sources`);
 const before=await snapshot();
 await t.test('two concurrent fresh invocations serialize and preserve existing data',async()=>{
  const results=await Promise.all([run(['scripts/migrate-monetization.mjs']),run(['scripts/migrate-monetization.mjs'])]);assert.ok(results.every(r=>r.code===0),JSON.stringify(results));assert.equal(results.filter(r=>/migration: applied\s*$/.test(r.output)).length,1);assert.equal(results.filter(r=>r.output.includes('already_applied')).length,1);assert.equal(await snapshot(),before);
  assert.equal((await sql`SELECT count(*)::int AS n FROM site_schema_migrations WHERE name='005_monetization.sql'`)[0].n,1);
 });
 const checksum=createHash('sha256').update(readFileSync('migrations/005_monetization.sql')).digest('hex');
 await t.test('matching checksum is idempotent; mismatches hard fail without mutation',async()=>{
  assert.equal((await sql`SELECT sha256 FROM site_schema_migrations WHERE name='005_monetization.sql'`)[0].sha256,checksum);assert.equal((await run(['scripts/migrate-monetization.mjs'])).code,0);
  await sql`UPDATE site_schema_migrations SET sha256=${'0'.repeat(64)} WHERE name='005_monetization.sql'`;
  const result=await run(['scripts/migrate-monetization.mjs']);assert.notEqual(result.code,0);assert.match(result.output,/CHECKSUM_MISMATCH/);assert.ok(!result.output.includes(connection));assert.equal(await snapshot(),before);
  await sql`UPDATE site_schema_migrations SET sha256=${checksum} WHERE name='005_monetization.sql'`;
 });
 await t.test('advisory lock blocks a second operator until release',async()=>{
  const lock=require('postgres')(connection,{max:1});await lock`SELECT pg_advisory_lock(748031005)`;
  try{const pending=run(['scripts/migrate-monetization.mjs']);let settled=false;pending.then(()=>settled=true);await new Promise(r=>setTimeout(r,300));assert.equal(settled,false);await lock`SELECT pg_advisory_unlock(748031005)`;assert.equal((await pending).code,0);}finally{await lock.end();}
 });
 await t.test('release command includes 001/002/003/005, excludes optional 004',async()=>{
  const result=await new Promise(resolve=>{const child=spawn('npm',['run','migrate:release'],{env:{...process.env,DATABASE_URL:connection},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('exit',code=>resolve({code,output}));});assert.equal(result.code,0,result.output);
  assert.deepEqual((await sql`SELECT name FROM site_schema_migrations ORDER BY name`).map(r=>r.name),['001_downloads.sql','002_delivery_sources.sql','003_runtime_security.sql','005_monetization.sql','006_download_processing.sql']);assert.equal(await snapshot(),before);
 });
 await t.test('audit CLI is read only, manual-only and never prints secrets/destinations',async()=>{
  const result=await run(['scripts/monetization-audit.mjs']);assert.equal(result.code,0,result.output);const report=JSON.parse(result.output);assert.equal(report.mode,'MANUAL_REVIEW_ONLY');assert.equal(report.summary.total_published,1);assert.equal(report.summary.flagged,1);assert.equal(report.summary.eligible,0);assert.equal(await snapshot(),before);assert.ok(!result.output.includes(connection)&&!result.output.includes('files_channel'));
 });
});
