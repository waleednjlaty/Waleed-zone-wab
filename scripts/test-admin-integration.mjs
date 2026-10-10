/** Real production Next + HTTPS loopback + disposable native PostgreSQL.
 * No production DB, provider calls or storage traffic. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import https from 'node:https';
import http from 'node:http';
import postgres from 'postgres';
const connection=process.env.WZ_ADMIN_TEST_DATABASE_URL;
assert.ok(connection,'Set WZ_ADMIN_TEST_DATABASE_URL to EMPTY loopback wz_admin_test.');
const dbUrl=new URL(connection);
assert.ok(['postgres:','postgresql:'].includes(dbUrl.protocol)&&['127.0.0.1','localhost'].includes(dbUrl.hostname)&&/^\/wz_admin_test(?:_[a-z0-9]+)?$/.test(dbUrl.pathname)&&!dbUrl.search&&!dbUrl.hash,'Only dedicated local Admin test DB accepted.');
const sql=postgres(connection,{max:1,onnotice(){}});
const folder=mkdtempSync(join(tmpdir(),'wz-admin-native-'));
const backendPort=Number(process.env.WZ_ADMIN_BACKEND_PORT||3103),tlsPort=Number(process.env.WZ_ADMIN_TLS_PORT||3443);
for(const port of [backendPort,tlsPort])assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535);
const base=`https://127.0.0.1:${tlsPort}`;
let server,proxy;
try {
  const [existing]=await sql`SELECT to_regclass('applications') AS catalog,to_regclass('site_users') AS users`;
  assert.ok(!existing.catalog&&!existing.users,'Refusing non-empty disposable DB.');
  await sql.unsafe(`CREATE TABLE applications(id SERIAL PRIMARY KEY,name TEXT,description TEXT,version TEXT,size TEXT,category TEXT,platform TEXT,developer TEXT,shrankme_url TEXT,image_url TEXT,devupload_url TEXT,downloads INTEGER,views INTEGER,active BOOLEAN,published BOOLEAN,created_at TIMESTAMP);
    CREATE TABLE site_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE site_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES site_users(id),expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());`);
  for(const [i,name] of ['WhatsApp','Telegram','Instagram','Spotify','TikTok','Facebook','Clash of Clans','Grand Theft Auto','Call of Duty'].entries())
    await sql`INSERT INTO applications(id,name,description,version,size,category,platform,developer,downloads,views,active,published,created_at) VALUES(${201+i},${name},${'Local QA catalog. '.repeat(40)},'9.1','85 MB',${i>=6?'ألعاب':'تواصل'},'Android','Test Developer',10,0,true,true,NOW())`;
  await sql`INSERT INTO applications(id,name,category,active,published) VALUES(999,'PRIVATE DRAFT SECRET','تواصل',true,false),(1000,'INACTIVE PRIVATE','تواصل',false,true)`;
  await sql.unsafe((await import('node:fs')).readFileSync('migrations/003_runtime_security.sql','utf8'));
  await sql.unsafe(readFileSync('migrations/001_downloads.sql','utf8'));
  await sql.unsafe(readFileSync('migrations/002_delivery_sources.sql','utf8'));
  await sql.unsafe((await import('node:fs')).readFileSync('migrations/005_monetization.sql','utf8'));
  await sql.unsafe((await import('node:fs')).readFileSync('migrations/006_download_processing.sql','utf8'));
  await sql`INSERT INTO site_download_budget(id,starts_at,expires_at,allowance_verified,byte_limit,reserved_bytes) VALUES(1,NOW(),NOW()+INTERVAL '1 day',true,9007199254740993,9007199254740992)`;
  // Exact immutable trusted-publisher fixture; no real object or provider attestation.
  await sql`INSERT INTO site_download_versions(id,application_id,version_label,release_key) VALUES('11111111-1111-4111-8111-111111111111',201,'QA draft','qa-draft')`;
  await sql`INSERT INTO site_download_files(id,version_id,variant_key,size_bytes,mime_type,download_filename,sha256,storage_backend,storage_key,scan_status,verified_at) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','universal',24,'application/vnd.android.package-archive','qa.apk',${'a'.repeat(64)},'railway-s3',${`artifacts/22222222-2222-4222-8222-222222222222/${'a'.repeat(64)}.apk`},'verified',NOW())`;
  await sql`UPDATE site_download_settings SET enabled=true`;
  await sql`INSERT INTO applications(id,name,description,version,size,category,platform,devupload_url,active,published,created_at) VALUES(210,'Authorized owner QA','Tiny authorized fixture','1','38 B','ألعاب','PC','https://bzzhr.to/file-xyz',true,true,NOW())`;
  const config={base,statsToken:randomBytes(32).toString('hex'),secrets:['QA_STORAGE_SECRET_SENTINEL'],fixture:'native-postgresql-https'};
  for(const [id,key] of [['owner-qa','ownerCookie'],['visitor-qa','userCookie']]){
    await sql`INSERT INTO site_users(id,name,email,password_hash) VALUES(${id},'QA user',${id+'@example.test'},'intentionally-disabled-test-login')`;
    const token=randomBytes(32).toString('base64url');
    await sql`INSERT INTO site_sessions VALUES(${createHash('sha256').update(token).digest('hex')},${id},NOW()+INTERVAL '1 hour',NOW())`;
    config[key]='__Host-wz_session='+token;
  }
  const expired=randomBytes(32).toString('base64url');
  await sql`INSERT INTO site_sessions VALUES(${createHash('sha256').update(expired).digest('hex')},'owner-qa',NOW()-INTERVAL '1 hour',NOW())`;
  config.expiredCookie='__Host-wz_session='+expired;
  const configPath=join(folder,'config.json');writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
  const key=join(folder,'key.pem'),cert=join(folder,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  const safeEnv={...process.env};
  for(const name of Object.keys(safeEnv))if(/(?:DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|STORAGE|AWS_|S3_|RAILWAY_|DIRECT_DOWNLOAD|ADSENSE)/.test(name))delete safeEnv[name];
  Object.assign(safeEnv,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:connection,NEXT_PUBLIC_SITE_URL:base,OWNER_USER_ID:'owner-qa',WEBSITE_STATS_TOKEN:config.statsToken,DIRECT_DOWNLOADS_ENABLED:'false',DOWNLOAD_STORAGE_PROVIDER_VERIFIED:'false',DOWNLOAD_INGRESS_VERIFIED:'false',DOWNLOAD_STORAGE_SECRET_ACCESS_KEY:'QA_STORAGE_SECRET_SENTINEL',NODE_OPTIONS:`--require=${resolve('tests/providers/runtime-fixture.cjs')}`,OWNER_CDN_TEST_ENABLED:'true',LEGACY_DOWNLOAD_SIGNING_KEY:'qa-only-owner-cdn-signing-key-01234567890123456789',NODE_EXTRA_CA_CERTS:cert,WZ_TEST_CONFIG:configPath,WZ_ADMIN_CONTRACT_STRICT:'1'});
  await sql.end(); // Setup is complete; no seed connection is needed during HTTP tests.
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(backendPort)],{env:safeEnv,stdio:'inherit'});
  proxy=https.createServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{
    const upstream=http.request({hostname:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
  });
  await new Promise(resolve=>proxy.listen(tlsPort,'127.0.0.1',resolve));
  let ready=false;
  for(let i=0;i<60;i++){
    assert.equal(server.exitCode,null,'Next fixture server exited.');
    try{const r=await fetch(`http://127.0.0.1:${backendPort}/api/stats`,{headers:{Authorization:'Bearer '+config.statsToken},signal:AbortSignal.timeout(2000)});if(r.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,'Build first; fixture failed to start.');
  for(const args of [['--test','tests/admin-regression.cjs'],['tests/admin-security-browser.mjs'],['tests/admin-real-browser.mjs'],['tests/owner-cdn-browser.mjs']]){
    const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env:safeEnv,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>resolve(code??1));});
    assert.equal(code,0,'Real Admin integration release gate failed.');
  }
}finally{
  if(server&&server.exitCode===null&&server.signalCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped;}
  if(proxy)await new Promise(resolve=>proxy.close(resolve));
  await sql.end();rmSync(folder,{recursive:true,force:true});
}
