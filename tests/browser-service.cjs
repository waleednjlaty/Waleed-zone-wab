'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),{readFileSync}=require('node:fs');require('./helpers/typescript.cjs');
const load=Module._load;Module._load=function(n,...a){if(n==='server-only')return {};if(n==='@/lib/analytics/schedule')return {scheduleMetrics:()=>{}};return load.call(this,n,...a);};
const {createLegacyHandler}=require('../src/lib/delivery/http.ts');Module._load=load;
test('browser-enabled redemption and progress preserve durable grant security and stable-only cache',async t=>{
 t.mock.method(console,'warn',()=>{});
 const h=await require('./admin/runtime.cjs').createFixture(t,{monetization:true});await h.db.exec(readFileSync('migrations/007_provider_discovery.sql','utf8'));
 let now=Date.now(),calls=0,change;
 const env={NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:h.origin,FILES_CHANNEL_USERNAME:'files_channel',LEGACY_DOWNLOAD_SIGNING_KEY:'x'.repeat(64),BACKGROUND_BROWSER_ENABLED:'true'};
 await h.sql`UPDATE applications SET shrankme_url=NULL,devupload_url='https://steamrip.com/qa-game/' WHERE id=201`;
 const browser={status:()=> 'FINDING_BZZHR',resolve:async(id,rev,source,cached,hash,signal)=>{calls++;assert.equal(id,201);assert.equal(hash.length,64);assert.equal(signal.aborted,false);if(change)await change();return {destination:'https://ts.buzzheavier.com/d/file-xyz?v=SIGNED_SECRET',discovered:['https://buzzheavier.com/file-xyz']};}};
 const call=(op,body,cookie='',origin=h.origin)=>createLegacyHandler(op,{sql:h.sql,env,now:()=>now,browser})(new Request(h.origin+'/api/downloads/legacy/'+op,{method:'POST',headers:{origin,'sec-fetch-site':'same-origin',accept:'application/json',cookie,'content-type':op==='prepare'?'application/json':'application/x-www-form-urlencoded'},body:op==='prepare'?JSON.stringify(body):new URLSearchParams(body)}));
 const prepare=async()=>{const r=await call('prepare',{application_id:201});assert.equal(r.status,200);return {grant:await r.json(),cookie:r.headers.get('set-cookie').split(';')[0]};};
 const req=(op,p,cookie=p.cookie)=>call(op,{application_id:'201',token:p.grant.token},cookie);
 await t.test('progress polls require ready live browser-bound grant and origin; reveal no links',async()=>{
  const p=await prepare();now=Date.parse(p.grant.ready_at)-1;assert.equal((await req('status',p)).status,425);now++;
  assert.equal((await req('status',p,'__Host-wz_legacy_client='+'z'.repeat(43))).status,400);
  assert.equal((await call('status',{application_id:'201',token:p.grant.token},p.cookie,'https://evil.test')).status,403);
  const poll=await req('status',p);assert.equal(poll.status,200);assert.deepEqual(await poll.json(),{state:'FINDING_BZZHR'});assert.equal(calls,0);
  now=Date.parse(p.grant.expires_at);assert.equal((await req('status',p)).status,410);
 });
 await t.test('fresh browser result issued once; only stable pages persist; consumed polling denied',async()=>{
  const p=await prepare();now=Date.parse(p.grant.ready_at);const r=await req('redeem',p);assert.equal(r.status,200);assert.ok((await r.json()).destination.includes('SIGNED_SECRET'));
  const [cache]=await h.sql`SELECT * FROM site_provider_discovery WHERE application_id=201`;assert.deepEqual(cache.provider_pages,['https://buzzheavier.com/file-xyz']);assert.ok(!JSON.stringify(cache).includes('SIGNED_SECRET'));
  assert.equal((await req('redeem',p)).status,410);assert.equal((await req('status',p)).status,410);
 });
 await t.test('source changes during browser job reject stale final destination and invalidate cached revision',async()=>{
  const p=await prepare();now=Date.parse(p.grant.ready_at);change=()=>h.sql`UPDATE applications SET devupload_url='https://steamrip.com/changed-game/' WHERE id=201`;
  const r=await req('redeem',p);assert.equal(r.status,409);assert.ok(!JSON.stringify(await r.json()).includes('SIGNED_SECRET'));assert.equal((await req('status',p)).status,400);change=undefined;
 });
 await t.test('grant expiring while browser runs never exposes destination',async()=>{
  const p=await prepare();now=Date.parse(p.grant.ready_at);change=async()=>{now=Date.parse(p.grant.expires_at);};const r=await req('redeem',p);assert.equal(r.status,410);assert.ok(!JSON.stringify(await r.json()).includes('SIGNED_SECRET'));change=undefined;
 });
});
