'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {PGlite}=require('@electric-sql/pglite'),{readFileSync}=require('node:fs'),{randomBytes}=require('node:crypto');
require('./helpers/typescript.cjs');
require('./downloads/harness.cjs').blockExternalIO();
const original=Module._load;Module._load=function(name,...args){if(name==='server-only')return {};return original.call(this,name,...args);};
const {OwnerCatalogService}=require('../src/lib/admin/catalog.ts');
const {createAdminHandler}=require('../src/lib/admin/http.ts');
const {LegacyCountdown,legacyDelivery}=require('../src/lib/delivery/legacy.ts');
const {createLegacyHandler}=require('../src/lib/delivery/http.ts');
const {telegramReference,telegramDestination,configuredChannel}=require('../src/lib/delivery/telegram.ts');
Module._load=original;
const origin='https://website.example.test',env={NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:origin,FILES_CHANNEL_USERNAME:'files_channel',LEGACY_DOWNLOAD_SIGNING_KEY:randomBytes(32).toString('hex')};
const metadata={name:'QA App',description:'QA',version:'1',size:'42 MB',category:'ألعاب موبايل',platform:'Android',developer:'QA',image_url:''};

test('shared catalog CRUD and real Telegram metadata routes',async t=>{
 const db=await PGlite.create();t.after(()=>db.close());
 await db.exec(`CREATE TABLE applications(id SERIAL PRIMARY KEY,name TEXT,description TEXT,version TEXT,size TEXT,category TEXT,platform TEXT,developer TEXT,image_url TEXT,search_text TEXT,icon_file_id TEXT,active BOOLEAN,published BOOLEAN,downloads INT,views INT,shrankme_url TEXT,devupload_url TEXT,created_at TIMESTAMPTZ);`);
 await db.exec(readFileSync('migrations/003_runtime_security.sql','utf8'));
 await db.exec(readFileSync('migrations/001_downloads.sql','utf8'));await db.exec(readFileSync('migrations/002_delivery_sources.sql','utf8'));
 await db.exec(readFileSync('migrations/002_delivery_sources.sql','utf8')); // additive/repeatable, preserves rows
 let queue=Promise.resolve();function tag(executor){const sql=(parts,...values)=>executor.query(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values).then(r=>r.rows);
 sql.begin=(mode,fn)=>{const pending=queue.then(()=>db.transaction(tx=>fn(tag(tx))));queue=pending.catch(()=>{});return pending;};return sql;}
 const sql=tag(db),service=new OwnerCatalogService(sql,env),secret=randomBytes(32).toString('base64url');
 let actor='owner',csrf;const deps={service,env,authorize:async()=>actor==='owner'?null:actor==='anon'?401:403,owner:async()=>({id:'owner'})};
 const call=async(op,method,body,id,headers={})=>createAdminHandler(op,deps)(new Request(origin+'/api/admin/catalog',{method,headers:{origin,'sec-fetch-site':'same-origin',cookie:'__Host-wz_session='+secret,...(csrf?{'x-csrf-token':csrf}:{}),'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})}),id);
 csrf=(await (await call('session','GET')).json()).csrf_token;
 let app;
 await t.test('traffic counters preserve catalog revision',async()=>{
  const item=await service.write('catalog',{metadata},'owner');
  await sql`UPDATE applications SET views=views+1,downloads=downloads+1,updated_at=clock_timestamp() WHERE id=${item.id}`;
  assert.equal((await service.read('catalog-record',String(item.id))).revision,item.revision);
 });
 await t.test('owner creates draft without external URL columns',async()=>{const response=await call('catalog','POST',{metadata});assert.equal(response.status,200);app=await response.json();assert.equal(app.published,false);const [row]=await sql`SELECT * FROM applications WHERE id=${app.id}`;assert.equal(row.shrankme_url,null);assert.equal(row.devupload_url,null);});
 const read=async()=>service.read('catalog-record',String(app.id));
 for(const [name,actorValue,status] of [['anonymous','anon',401],['non-owner','visitor',403]])await t.test(name+' catalog writes denied',async()=>{actor=actorValue;assert.equal((await call('catalog','POST',{metadata})).status,status);actor='owner';});
 await t.test('CSRF denied',async()=>{assert.equal((await call('catalog','POST',{metadata},undefined,{'x-csrf-token':''})).status,403);});
 await t.test('cross-origin denied',async()=>{assert.equal((await call('catalog','POST',{metadata},undefined,{origin:'https://evil.test'})).status,403);});
 await t.test('missing target / IDOR payload fails closed',async()=>{assert.equal((await call('catalog-record','PATCH',{metadata,expected_revision:app.revision},'9999')).status,404);assert.equal((await call('catalog-record','PATCH',{metadata,application_id:999,expected_revision:app.revision},String(app.id))).status,400);});
 await t.test('owner edit and stale revision',async()=>{assert.equal((await call('catalog-record','PATCH',{metadata:{...metadata,name:'Edited'},expected_revision:app.revision},String(app.id))).status,200);assert.equal((await call('catalog-record','PATCH',{metadata,expected_revision:app.revision},String(app.id))).status,409);app=await read();assert.equal(app.name,'Edited');});
 await t.test('bot update invalidates website expected revision',async()=>{await sql`UPDATE applications SET version='bot-version' WHERE id=${app.id}`;assert.equal((await call('catalog-record','PATCH',{metadata,expected_revision:app.revision},String(app.id))).status,409);app=await read();});
 await t.test('valid Telegram link binding; revision advanced',async()=>{const old=app.revision;assert.equal((await call('delivery-source','PUT',{source:{url:'https://t.me/files_channel/123'},expected_revision:old},String(app.id))).status,200);app=await read();assert.notEqual(app.revision,old);assert.equal(app.source.message_id,123);});
 for(const source of [{url:'https://evil.test/files_channel/123'},{url:'http://t.me/files_channel/123'},{url:'https://t.me/wrong_channel/123'},{url:'https://t.me/files_channel/0'},{url:'https://t.me/files_channel/123?token=foo'},{url:'https://t.me/files_channel/123#x'},{url:'https://t.me:444/files_channel/123'},{channel_username:'files_channel',message_id:1.5},{channel_username:'files_channel',message_id:'01'},{channel_username:'files_channel',message_id:-1},{channel_username:'files_channel',message_id:2147483648}])await t.test('invalid source '+JSON.stringify(source),async()=>{assert.equal((await call('delivery-source','PUT',{source,expected_revision:app.revision},String(app.id))).status,400);});
 await t.test('publish / unpublish / archive / reactivate',async()=>{for(const [action,active,published] of [['publish',true,true],['unpublish',true,false],['archive',false,false],['activate',true,false],['publish',true,true]]){assert.equal((await call('catalog-record','PATCH',{action,expected_revision:app.revision},String(app.id))).status,200);app=await read();assert.equal(app.active,active);assert.equal(app.published,published);}});
 let now=Date.now(),prepared,client;
 const legacy=(op,body,cookie='',headers={})=>createLegacyHandler(op,{sql,env,now:()=>now})(new Request(origin+'/api/downloads/legacy/'+op,{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':op==='redeem'?'application/x-www-form-urlencoded':'application/json',cookie,...headers},body:op==='redeem'?new URLSearchParams(body):JSON.stringify(body)}));
 await t.test('prepare hides destination and creates HttpOnly cookie',async()=>{const r=await legacy('prepare',{application_id:app.id});assert.equal(r.status,200);const data=await r.text();assert.ok(!data.includes('t.me')&&!data.includes('files_channel'));prepared=JSON.parse(data);client=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);});
 await t.test('19.999 seconds denied, exact 20.000 allows exact 303',async()=>{now=Date.parse(prepared.ready_at)-1;assert.equal((await legacy('redeem',{application_id:app.id,token:prepared.token},client)).status,425);now++;const r=await legacy('redeem',{application_id:app.id,token:prepared.token},client);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'https://t.me/files_channel/123');assert.match(r.headers.get('cache-control'),/no-store/);});
 await t.test('wrong application rejected',async()=>{const other=await service.write('catalog',{metadata},'owner');await sql`UPDATE applications SET published=true WHERE id=${other.id}`;await sql`INSERT INTO site_delivery_sources(application_id,provider,telegram_channel_username,telegram_message_id) VALUES(${other.id},'telegram','files_channel',456)`;assert.equal((await legacy('redeem',{application_id:other.id,token:prepared.token},client)).status,400);});
 await t.test('tampered token denied',async()=>{assert.equal((await legacy('redeem',{application_id:app.id,token:'A'+prepared.token.slice(1)},client)).status,400);});
 await t.test('wrong browser/client denied',async()=>{assert.equal((await legacy('redeem',{application_id:app.id,token:prepared.token},'__Host-wz_legacy_client='+randomBytes(32).toString('base64url'))).status,400);});
 await t.test('expired token denied',async()=>{now=Date.parse(prepared.expires_at);assert.equal((await legacy('redeem',{application_id:app.id,token:prepared.token},client)).status,410);});
 for(const field of ['published','active'])await t.test(field+' off denies prepare/redeem',async()=>{await sql`UPDATE applications SET active=${field!=='active'},published=${field!=='published'} WHERE id=${app.id}`;assert.equal((await legacy('prepare',{application_id:app.id},client)).status,404);assert.equal((await legacy('redeem',{application_id:app.id,token:prepared.token},client)).status,404);await sql`UPDATE applications SET active=true,published=true WHERE id=${app.id}`;});
 for(const change of ['source','app','removed'])await t.test(change+' changed during countdown rejects original grant',async()=>{
  const r=await legacy('prepare',{application_id:app.id},client),g=await r.json();
  if(change==='source')await sql`UPDATE site_delivery_sources SET telegram_message_id=456 WHERE application_id=${app.id}`;
  else if(change==='app')await sql`UPDATE applications SET version='during countdown' WHERE id=${app.id}`;
  else await sql`DELETE FROM site_delivery_sources WHERE application_id=${app.id}`;
  now=Date.parse(g.ready_at);
  assert.equal((await legacy('redeem',{application_id:app.id,token:g.token},client)).status,change==='removed'?404:400);
  await sql`INSERT INTO site_delivery_sources(application_id,provider,telegram_channel_username,telegram_message_id) VALUES(${app.id},'telegram','files_channel',123) ON CONFLICT(application_id,provider) DO UPDATE SET telegram_message_id=123`;
 });
 await t.test('parallel multi-tab grants bound to one browser support retry without new countdown bypass',async()=>{
  const grants=await Promise.all([legacy('prepare',{application_id:app.id},client),legacy('prepare',{application_id:app.id},client)]).then(rs=>Promise.all(rs.map(r=>r.json())));
  assert.notEqual(grants[0].token,grants[1].token);now=Math.max(...grants.map(g=>Date.parse(g.ready_at)));
  const rs=await Promise.all(grants.map(g=>legacy('redeem',{application_id:app.id,token:g.token},client)));
  assert.deepEqual(rs.map(r=>r.status),[303,303]);assert.ok(rs.every(r=>r.headers.get('location')==='https://t.me/files_channel/123'));
 });
 await t.test('wrong configured channel rejected at redemption',async()=>{await sql`UPDATE site_delivery_sources SET telegram_channel_username='other_channel' WHERE application_id=${app.id}`;await assert.rejects(legacyDelivery(sql,app.id,env),e=>e.status===404);});
 await t.test('source absent rejected for new app',async()=>{await sql`DELETE FROM site_delivery_sources WHERE application_id=${app.id}`;await assert.rejects(legacyDelivery(sql,app.id,env),e=>e.status===404);});
 await t.test('no external open redirect; existing approved legacy URL works',async()=>{await sql`UPDATE applications SET shrankme_url='https://evil.test/file' WHERE id=${app.id}`;await assert.rejects(legacyDelivery(sql,app.id,env));await sql`UPDATE applications SET shrankme_url='https://shrinkme.io/old' WHERE id=${app.id}`;assert.equal((await legacyDelivery(sql,app.id,env)).destination,'https://shrinkme.io/old');});
 await t.test('SteamRIP column keeps source semantics',async()=>{await sql`UPDATE applications SET shrankme_url=NULL,devupload_url='https://steamrip.com/qa-game/' WHERE id=${app.id}`;assert.match((await legacyDelivery(sql,app.id,env)).destination,/t\.me\/.+\?start=app_/);});
 await t.test('disabled download config denies fallback',async()=>{await sql`INSERT INTO site_download_app_config(application_id,mode) VALUES(${app.id},'disabled')`;await assert.rejects(legacyDelivery(sql,app.id,env));});
});

test('Files Channel fallback is exact and partial configuration fails closed',()=>{
 assert.equal(configuredChannel({CHANNEL_USERNAME:'Main_channel'}),'main_channel');
 assert.throws(()=>configuredChannel({FILES_CHANNEL_ID:'-1001',CHANNEL_USERNAME:'main_channel'}));
 assert.equal(telegramDestination('@FILES_channel',42,env),'https://t.me/files_channel/42');
 assert.throws(()=>telegramReference({url:'https://t.me/user:pass@files_channel/1'},env));
});
test('stateless countdown signatures fail closed without signing key',()=>assert.throws(()=>new LegacyCountdown('')));
test('prepare uses one clock snapshot even when time advances between reads',()=>{
 let clock=1700000000000;
 const result=new LegacyCountdown('a'.repeat(32),()=>clock++).prepare(1,'1','browser');
 assert.equal(Date.parse(result.ready_at)-Date.parse(result.server_time),20000);
 assert.equal(Date.parse(result.expires_at)-Date.parse(result.ready_at),180000);
});
