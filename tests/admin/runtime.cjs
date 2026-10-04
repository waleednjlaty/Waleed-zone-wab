'use strict';
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const {randomBytes,createHash}=require('node:crypto');
const Module=require('node:module');
require('../helpers/typescript.cjs');
const routePaths={session:'session',catalog:'catalog',versions:'downloads/versions',version:'downloads/versions/[version_id]',files:'downloads/files',file:'downloads/files/[file_id]',config:'downloads/config/[application_id]',status:'downloads/status',control:'downloads/control'};
async function createFixture(t, options={}) {
  const selectedPaths={...routePaths,...(options.monetization?{analytics:"analytics",monetization:"monetization",review:"monetization/[application_id]"}:{})};
  require('../downloads/harness.cjs').blockExternalIO();
  const db=await PGlite.create(),saved={...process.env},origin='https://admin.example.test';
  Object.assign(process.env,{NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:origin,OWNER_USER_ID:'qa-owner',WEBSITE_STATS_TOKEN:'QA_STATS_SENTINEL',DIRECT_DOWNLOADS_ENABLED:'false'});
  const sessions={owner:randomBytes(32).toString('base64url'),otherOwner:randomBytes(32).toString('base64url'),visitor:randomBytes(32).toString('base64url'),expired:randomBytes(32).toString('base64url')};
  let context,sqlFault=false,serviceFault=false,authFault=false,queue=Promise.resolve();
  const serialize=fn=>{const value=queue.then(fn);queue=value.catch(()=>{});return value;};
  function sqlFor(executor,transaction=false) {
    const run=(query,values=[])=>{
      if(sqlFault || serviceFault&&query.includes('site_download_') || authFault&&query.includes('site_sessions'))throw Object.assign(new Error('QA_DB_PASSWORD_SENTINEL postgres://private@provider.invalid site_download_files'),{code:'ECONNREFUSED'});
      const execute=()=>executor.query(query,values).then(r=>r.rows);
      return transaction?execute():serialize(execute);
    };
    const sql=(parts,...values)=>run(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values);
    sql.begin=(mode,fn)=>serialize(()=>db.transaction(async tx=>{await tx.exec('SET TRANSACTION '+mode);return fn(sqlFor(tx,true));}));
    return sql;
  }
  const sql=sqlFor(db);
  // Independent state/security subtests must not inherit another subtest's limiter traffic.
  t.beforeEach(async()=>{await sql`DELETE FROM site_rate_limits`;});
  await db.exec(`CREATE TABLE applications(id INTEGER PRIMARY KEY,name TEXT,description TEXT,version TEXT,size TEXT,category TEXT,platform TEXT,developer TEXT,shrankme_url TEXT,image_url TEXT,devupload_url TEXT,downloads INTEGER,views INTEGER,active BOOLEAN,published BOOLEAN,created_at TIMESTAMPTZ);
    CREATE TABLE site_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,password_hash TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE site_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES site_users(id),expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW());
    INSERT INTO applications(id,name,shrankme_url,devupload_url,active,published) VALUES(201,'Public QA','QA_PRIVATE_BOT_URL','QA_PRIVATE_BOT_FIELD',true,true),(202,'Other QA',NULL,NULL,true,true),(999,'PRIVATE DRAFT SECRET',NULL,NULL,false,false);
    INSERT INTO site_users VALUES('qa-owner','QA owner','QA_OWNER_EMAIL@example.test','QA_PASSWORD_HASH',NOW()),('qa-visitor','QA visitor','visitor@example.test','QA_PASSWORD_HASH',NOW());`);
  await db.exec(readFileSync(require.resolve('../../migrations/003_runtime_security.sql'),'utf8'));
  await db.exec(readFileSync(require.resolve('../../migrations/001_downloads.sql'),'utf8'));
  if(options.monetization){
    await db.exec(readFileSync(require.resolve('../../migrations/002_delivery_sources.sql'),'utf8'));
    await db.exec(readFileSync(require.resolve('../../migrations/005_monetization.sql'),'utf8'));
  }
  for(const [key,secret] of Object.entries(sessions))await sql`INSERT INTO site_sessions VALUES(${createHash('sha256').update(secret).digest('hex')},${key==='visitor'?'qa-visitor':'qa-owner'},${new Date(Date.now()+(key==='expired'?-60000:86400000))},NOW())`;
  const original=Module._load;
  Module._load=function(name,...args) {
    if(name==='server-only')return {};
    if(name==='@/lib/db')return {getSql:()=>sql};
    if(name==='next/headers')return {cookies:async()=>({get(name){const value=(context.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return value?{value:value.slice(name.length+1)}:undefined;}})};
    if(name==='next/navigation')return {notFound(){throw Error('NEXT_HTTP_ERROR_FALLBACK;404');}};
    return original.call(this,name,...args);
  };
  let routes;
  try {routes=Object.fromEntries(Object.entries(selectedPaths).map(([op,path])=>[op,require('../../src/app/api/admin/'+path+'/route.ts')]));}
  finally {Module._load=original;}
  t.after(async()=>{await queue;await db.close();for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);});
  let csrf;
  async function call(op,{method='GET',body,raw,actor='owner',id,headers={},query}={}) {
    const h=new Headers({'Sec-Fetch-Site':'same-origin'});
    if(sessions[actor])h.set('Cookie','__Host-wz_session='+sessions[actor]);
    if(method!=='GET'){h.set('Origin',origin);h.set('Content-Type','application/json');if(csrf)h.set('X-CSRF-Token',csrf);}
    for(const [name,value] of Object.entries(headers)){if(value===null)h.delete(name);else h.set(name,value);}
    const scoped=query??(op==='versions'&&method==='GET'?'?application_id=201':'');
    const route=selectedPaths[op].replace(/\[[^\]]+\]/,id??'201');
    context=new Request(origin+'/api/admin/'+route+scoped,{method,headers:h,...(method==='GET'?{}:{body:raw??JSON.stringify(body??{})})});
    const params={application_id:id??'201',version_id:id,file_id:id};
    return routes[op][method](context,{params:Promise.resolve(params)});
  }
  const snapshot=async()=>JSON.stringify((await db.query(`SELECT
    (SELECT jsonb_agg(v ORDER BY id) FROM site_download_versions v) AS versions,
    (SELECT jsonb_agg(f ORDER BY id) FROM site_download_files f) AS files,
    (SELECT jsonb_agg(c ORDER BY application_id) FROM site_download_app_config c) AS configs,
    (SELECT jsonb_agg(s) FROM site_download_settings s) AS settings,
    (SELECT jsonb_agg(b) FROM site_download_budget b) AS budget,
    (SELECT jsonb_agg(a ORDER BY id) FROM applications a) AS apps`)).rows);
  const boot=await call('session');if(boot.status!==200)throw Error('Owner session positive control failed: '+boot.status);csrf=(await boot.json()).csrf_token;
  return {call,db,sql,snapshot,sessions,origin,get csrf(){return csrf;},setFault(name,value){if(name==='sql')sqlFault=value;else if(name==='service')serviceFault=value;else authFault=value;}};
}
module.exports={createFixture,routePaths};
