/** Reproducible API/security tests with a dedicated, EMPTY local PostgreSQL DB.
 * Never accepts production hosts or overwrites an existing catalog. */
import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
const connection=process.env.WZ_TEST_DATABASE_URL;
assert.ok(connection,'Set WZ_TEST_DATABASE_URL to an EMPTY local wz_phase2_test database.');
const url=new URL(connection);
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&/^\/wz_phase2_test(?:_[a-z0-9]+)?$/.test(url.pathname),'Only a dedicated local wz_phase2_test database is allowed.');
const sql=postgres(connection,{prepare:false,max:1});
const port=Number(process.env.WZ_TEST_PORT||3100);
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535,'WZ_TEST_PORT must be an unprivileged TCP port.');
const base=`http://127.0.0.1:${port}`,folder=mkdtempSync(join(tmpdir(),'wz-phase2-tests-'));
let server;
try {
  const [existing]=await sql`SELECT to_regclass('public.applications') AS catalog, to_regclass('public.site_users') AS users`;
  assert.ok(!existing.catalog&&!existing.users,'Refusing to modify a non-empty test database. Create a new dedicated test database.');
  await sql.unsafe(`CREATE TABLE applications(id SERIAL PRIMARY KEY,name TEXT,description TEXT,version TEXT,size TEXT,category TEXT,platform TEXT,developer TEXT,shrankme_url TEXT,image_url TEXT,devupload_url TEXT,downloads INTEGER,views INTEGER,active BOOLEAN,published BOOLEAN,created_at TIMESTAMP);
    CREATE TABLE site_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE site_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
  for(const [index,name] of ['WhatsApp','Telegram','Instagram','Spotify','TikTok','Facebook','Clash of Clans','Grand Theft Auto','Call of Duty'].entries()) {
    await sql`INSERT INTO applications(id,name,description,version,size,category,platform,developer,downloads,active,published,created_at)
      VALUES(${201+index},${name},${'Test fixture only. '.repeat(40)},'9.1','85 MB',${index>=6?'ألعاب':'تواصل'},'Android',${[0,2,5].includes(index)?'Meta':'Test Developer'},10,true,true,NOW())`;
  }
  await sql`INSERT INTO applications(id,name,category,active,published) VALUES(999,'PRIVATE DRAFT SECRET','تواصل',true,false),(1000,'INACTIVE PRIVATE','تواصل',false,true)`;
  // Optional public-only SEO fixtures exercise pagination beyond both page sizes.
  if(process.env.WZ_SEO_FIXTURES==='true') for(let i=0;i<27;i++) {
    await sql`INSERT INTO applications(id,name,description,category,active,published,created_at)
      VALUES(${3000+i},${`QA Tool ${i+1}`},'Repeated fixture description','أدوات',true,true,NOW())`;
  }
  const config={base,statsToken:randomBytes(32).toString('hex')};
  for(const [id,name,key] of [['owner-qa','QA owner','ownerCookie'],['visitor-qa','QA visitor','userCookie']]) {
    await sql`INSERT INTO site_users(id,name,email,password_hash) VALUES(${id},${name},${`${id}@example.test`},'intentionally-disabled-test-login')`;
    const token=randomBytes(32).toString('base64url');
    await sql`INSERT INTO site_sessions(token_hash,user_id,expires_at) VALUES(${createHash('sha256').update(token).digest('hex')},${id},NOW()+INTERVAL '1 hour')`;
    config[key]=`__Host-wz_session=${token}`;
  }
  const expired=randomBytes(32).toString('base64url');
  await sql`INSERT INTO site_sessions(token_hash,user_id,expires_at) VALUES(${createHash('sha256').update(expired).digest('hex')},'owner-qa',NOW()-INTERVAL '1 hour')`;
  config.expiredCookie=`__Host-wz_session=${expired}`;
  const configPath=join(folder,'config.json');writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{
    env:{...process.env,DATABASE_URL:connection,NEXT_PUBLIC_SITE_URL:base,OWNER_USER_ID:'owner-qa',WEBSITE_STATS_TOKEN:config.statsToken},stdio:['ignore','inherit','inherit'],
  });
  let ready=false;
  for(let i=0;i<60;i++){
    assert.equal(server.exitCode,null,`Test server stopped; check that port ${port} is free.`);
    try{if((await fetch(`${base}/api/stats`,{headers:{Authorization:`Bearer ${config.statsToken}`},signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,'Production server did not become ready. Run npm run build first.');
  const code=await new Promise(resolve=>{
    const tests=spawn(process.execPath,['--test','tests/integration.cjs','tests/seo-integration.cjs','tests/download-integration.cjs','tests/admin-regression.cjs','tests/admin-api.cjs'],{env:{...process.env,WZ_TEST_CONFIG:configPath},stdio:'inherit'});
    tests.on('exit',(status)=>resolve(status??1));
  });
  process.exitCode=code;
  if(code===0 && process.env.WZ_BROWSER_TESTS==='true') {
    for(const file of ['tests/browser.mjs','tests/seo-browser.mjs','tests/admin-security-browser.mjs']) {
      process.exitCode=await new Promise(resolve=>{
        const browser=spawn(process.execPath,[file],{env:{...process.env,WZ_TEST_CONFIG:configPath},stdio:'inherit'});
        browser.on('exit',status=>resolve(status??1));
      });
      if(process.exitCode!==0)break;
    }
  }
} finally {
  if(server&&server.exitCode===null&&server.signalCode===null){
    const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped;
  }
  await sql.end();rmSync(folder,{recursive:true,force:true});
  // The explicitly dedicated database is retained for inspection; no DROP/reset.
}
