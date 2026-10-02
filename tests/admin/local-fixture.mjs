/** Ephemeral local PostgreSQL via PGlite's official socket wrapper.
 * Optional tooling stays outside the application dependency tree.
 * This proves HTTP/RSC behavior, NOT native PostgreSQL concurrency/locking.
 */
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
assert.ok(process.env.WZ_PGLITE_SOCKET_MODULE, 'Set WZ_PGLITE_SOCKET_MODULE to an isolated @electric-sql/pglite-socket module.');
const { PGLiteSocketServer } = await import(pathToFileURL(process.env.WZ_PGLITE_SOCKET_MODULE).href);
const db = await PGlite.create();
const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
const folder = mkdtempSync(join(tmpdir(), 'wz-admin-local-'));
let server;
try {
  await db.exec(`CREATE TABLE applications(id SERIAL PRIMARY KEY,name TEXT,description TEXT,version TEXT,size TEXT,category TEXT,platform TEXT,developer TEXT,shrankme_url TEXT,image_url TEXT,devupload_url TEXT,downloads INTEGER,views INTEGER,active BOOLEAN,published BOOLEAN,created_at TIMESTAMP);
    CREATE TABLE site_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE site_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES site_users(id),expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());`);
  for (const [i,name] of ['WhatsApp','Telegram','Instagram','Spotify','TikTok','Facebook','Clash of Clans','Grand Theft Auto','Call of Duty'].entries())
    await db.query(`INSERT INTO applications(id,name,description,version,size,category,platform,developer,downloads,views,active,published,created_at) VALUES($1,$2,$3,'9.1','85 MB',$4,'Android',$5,10,0,true,true,NOW())`, [201+i,name,'Local QA catalog. '.repeat(40),i>=6?'ألعاب':'تواصل',[0,2,5].includes(i)?'Meta':'Test Developer']);
  await db.exec(`INSERT INTO applications(id,name,category,active,published) VALUES(999,'PRIVATE DRAFT SECRET','تواصل',true,false),(1000,'INACTIVE PRIVATE','تواصل',false,true)`);
  await db.exec(readFileSync(new URL('../../migrations/001_downloads.sql', import.meta.url),'utf8'));
  await db.exec(`INSERT INTO site_download_versions(id,application_id,version_label,release_key) VALUES('11111111-1111-4111-8111-111111111111',201,'QA pending','qa-pending'),('44444444-4444-4444-8444-444444444444',202,'QA other','qa-other');
    INSERT INTO site_download_files(id,version_id,variant_key,size_bytes,mime_type,download_filename,sha256,storage_backend,storage_key,storage_object_version) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','universal',24,'application/vnd.android.package-archive','qa.apk',repeat('a',64),'fixture','QA_PRIVATE_STORAGE_KEY_SENTINEL','fixture-v1')`);
  const config = { statsToken: randomBytes(32).toString('hex'), fixture: 'pglite-socket', secrets: ['QA_DATABASE_PASSWORD_SENTINEL','QA_STORAGE_SECRET_SENTINEL','QA_SIGNATURE_SENTINEL','QA_PRIVATE_STORAGE_KEY_SENTINEL'] };
  for (const [id,name,key] of [['owner-qa','QA owner','ownerCookie'],['visitor-qa','QA visitor','userCookie']]) {
    await db.query('INSERT INTO site_users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [id,name,`${id}@example.test`,'intentionally-disabled-test-login']);
    const token = randomBytes(32).toString('base64url');
    await db.query("INSERT INTO site_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')", [createHash('sha256').update(token).digest('hex'),id]);
    config[key] = '__Host-wz_session=' + token;
  }
  const expired = randomBytes(32).toString('base64url');
  await db.query("INSERT INTO site_sessions(token_hash,user_id,expires_at) VALUES($1,'owner-qa',NOW()-INTERVAL '1 hour')", [createHash('sha256').update(expired).digest('hex')]);
  config.expiredCookie = '__Host-wz_session=' + expired;
  await socket.start();
  const address = socket.getServerConn();
  const dbPort = Number(new URL(`http://${address}`).port);
  assert.ok(Number.isInteger(dbPort), 'Socket server must expose its assigned loopback port.');
  const port = Number(process.env.WZ_ADMIN_TEST_PORT || 3190);
  assert.ok(Number.isInteger(port) && port>=1024 && port<=65535);
  config.base = `http://127.0.0.1:${port}`;
  const configPath = join(folder,'config.json'); writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
  const safeEnv = { ...process.env };
  for (const key of Object.keys(safeEnv)) if (/(?:DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|STORAGE|AWS_|S3_|RAILWAY_|REDIS_URL|NEON_|SUPABASE_|DIRECT_DOWNLOAD|ADSENSE)/.test(key)) delete safeEnv[key];
  Object.assign(safeEnv, { NODE_OPTIONS:`--require=${fileURLToPath(new URL('./network-guard.cjs', import.meta.url))}`,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:`postgres://postgres@127.0.0.1:${dbPort}/wz_admin_test`,NEXT_PUBLIC_SITE_URL:config.base,OWNER_USER_ID:'owner-qa',WEBSITE_STATS_TOKEN:config.statsToken,DIRECT_DOWNLOADS_ENABLED:'false',DOWNLOAD_STORAGE_PROVIDER_VERIFIED:'false',DOWNLOAD_INGRESS_VERIFIED:'false',DOWNLOAD_STORAGE_SECRET_ACCESS_KEY:'QA_STORAGE_SECRET_SENTINEL' });
  server = spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:safeEnv,stdio:['ignore','inherit','inherit']});
  let ready=false;
  for(let i=0;i<60;i++) {
    assert.equal(server.exitCode,null,'Local fixture server exited.');
    try { const r=await fetch(config.base+'/api/stats',{headers:{Authorization:'Bearer '+config.statsToken},signal:AbortSignal.timeout(2000)});if(r.ok){ready=true;break;} } catch {}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,'Build first; local fixture server failed to start.');
  const files = process.argv.slice(2);
  assert.ok(files.length,'Provide test files; this runner never starts an unattended server.');
  for(const file of files) {
    assert.match(file,/^tests\/[a-zA-Z0-9/_-]+\.(cjs|mjs)$/,'Only repository tests may be launched.');
    const args=file.endsWith('.cjs')?['--test',file]:[file];
    const child=spawn(process.execPath,args,{env:{...safeEnv,WZ_TEST_CONFIG:configPath},stdio:'inherit'});
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',status=>resolve(status??1));});
    if(code!==0){process.exitCode=code;break;}
  }
} finally {
  if(server && server.exitCode===null && server.signalCode===null) { const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped; }
  await socket.stop();await new Promise(resolve=>setTimeout(resolve,100));await db.close();rmSync(folder,{recursive:true,force:true});
}
