'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
require('./helpers/typescript.cjs');
const load=Module._load;let metrics=[];
Module._load=function(name,...args){if(name==='server-only')return {};if(name==='@/lib/analytics/schedule')return {scheduleMetrics:items=>metrics.push(...items)};return load.call(this,name,...args);};
const {createLegacyHandler}=require('../src/lib/delivery/http.ts'),{DownloadError}=require('../src/lib/downloads/rules.ts'),{steamripDestination}=require('../src/lib/downloads/providers/steamrip.ts');
Module._load=load;
const destination='https://fafda.to/d/file-xyz?v=QA_SECRET_SIGNED_DESTINATION';
test('SteamRIP route contract: countdown → fresh mocked provider → atomic 303, replay/stale/retry guards',async t=>{
 const logs=[];t.mock.method(console,'warn',(...values)=>logs.push(values.join(' ')));
 const h=await require('./admin/runtime.cjs').createFixture(t,{monetization:true});let now=Date.now(),resolutions=0,fail=false,change;
 const env={NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:h.origin,FILES_CHANNEL_USERNAME:'files_channel',LEGACY_DOWNLOAD_SIGNING_KEY:'a'.repeat(64)};
 await h.sql`UPDATE applications SET shrankme_url=NULL,devupload_url='https://steamrip.com/qa-game/' WHERE id=201`;
 const resolve=async(id,revision,source)=>{
  resolutions++;assert.equal(id,201);assert.equal(typeof revision,'string');
  // Proves network work starts after the attempt write has committed, not inside sql.begin.
  if(fail)throw new DownloadError(503,'PROVIDER_CHALLENGE');
  if(change){await change();change=undefined;}
  return steamripDestination(source,AbortSignal.timeout(1000),async(url,hosts,signal,headers,follow,method)=>{
   if(method==='HEAD')return {status:200,url,headers:{'content-type':'application/octet-stream'},body:''};
   if(url.includes('steamrip.com'))return {status:200,url,headers:{},body:'<a href="https://bzzhr.to/file-xyz">BZZHR</a>'};
   if(!url.includes('/download'))return {status:200,url,headers:{},body:'<a hx-get="/file-xyz/download?t=abc">Download</a>'};
   return {status:200,url,headers:{'hx-redirect':destination},body:''};
  });
 };
 const call=(op,body,cookie='',accept='text/html')=>createLegacyHandler(op,{sql:h.sql,env,now:()=>now,resolve})(new Request(h.origin+'/api/downloads/legacy/'+op,{method:'POST',headers:{origin:h.origin,'sec-fetch-site':'same-origin',accept,cookie,'content-type':op==='prepare'?'application/json':'application/x-www-form-urlencoded'},body:op==='prepare'?JSON.stringify(body):new URLSearchParams(body)}));
 const prepare=async()=>{const r=await call('prepare',{application_id:201});assert.equal(r.status,200);const text=await r.text();assert.ok(!text.includes('bzzhr')&&!text.includes('fafda')&&!text.includes('QA_SECRET'));return {grant:JSON.parse(text),cookie:r.headers.get('set-cookie').split(';')[0]};};
 const redeem=(p,accept)=>call('redeem',{application_id:201,token:p.grant.token},p.cookie,accept);
 await t.test('early denied without contacting provider; exact boundary allows destination only in 303',async()=>{
  const p=await prepare();now=Date.parse(p.grant.ready_at)-1;assert.equal((await redeem(p)).status,425);assert.equal(resolutions,0);
  now++;metrics=[];const r=await redeem(p);assert.equal(r.status,303);assert.equal(r.headers.get('location'),destination);assert.equal(await r.text(),'');
  assert.deepEqual(metrics.map(m=>m.metric),['download_redeem','external_download_redirect']);assert.ok(!JSON.stringify(metrics).includes('QA_SECRET'));
  assert.equal((await redeem(p)).status,410);assert.equal(resolutions,1);
 });
 await t.test('provider failure retains token; HTML offers same safe POST retry, then succeeds',async()=>{
  const p=await prepare();now=Date.parse(p.grant.ready_at);fail=true;const r=await redeem(p,'text/html');assert.equal(r.status,503);const html=await r.text();assert.ok(html.includes('method="post"'));assert.ok(!html.includes('QA_SECRET')&&!html.includes('SteamRIP stack'));
  const [g]=await h.sql`SELECT attempts,consumed_at FROM site_legacy_download_grants WHERE application_id=201 ORDER BY ready_at DESC LIMIT 1`;assert.equal(g.consumed_at,null);assert.equal(g.attempts,1);
  fail=false;assert.equal((await redeem(p)).status,303);
 });
 await t.test('three failed attempts bound retry; expiry still enforced',async()=>{
  const p=await prepare();now=Date.parse(p.grant.ready_at);fail=true;
  for(let i=0;i<3;i++)assert.equal((await redeem(p)).status,503);
  const count=resolutions;assert.equal((await redeem(p)).status,410);assert.equal(resolutions,count);fail=false;
  now=Date.parse(p.grant.expires_at);assert.equal((await redeem(p)).status,410);
 });
 for(const field of ['devupload_url','active','published','version'])await t.test(field+' changes while provider is resolving deny 303',async()=>{
  await h.sql`UPDATE applications SET active=true,published=true,devupload_url='https://steamrip.com/qa-game/' WHERE id=201`;
  const p=await prepare();now=Date.parse(p.grant.ready_at);
  change=async()=>{if(field==='devupload_url')await h.sql`UPDATE applications SET devupload_url='https://steamrip.com/changed/' WHERE id=201`;
    if(field==='active')await h.sql`UPDATE applications SET active=false WHERE id=201`;
    if(field==='published')await h.sql`UPDATE applications SET published=false WHERE id=201`;
    if(field==='version')await h.sql`UPDATE applications SET version='changed' WHERE id=201`;};
  const r=await redeem(p);assert.ok([404,409].includes(r.status));assert.equal(r.headers.get('location'),null);
 });
 await t.test('Telegram source added during resolution invalidates old SteamRIP destination',async()=>{
  await h.sql`UPDATE applications SET active=true,published=true,devupload_url='https://steamrip.com/qa-game/' WHERE id=201`;
  const p=await prepare();now=Date.parse(p.grant.ready_at);
  change=async()=>{await h.sql`INSERT INTO site_delivery_sources(application_id,provider,telegram_channel_username,telegram_message_id) VALUES(201,'telegram','files_channel',42)`;};
  assert.equal((await redeem(p)).status,409);
  await h.sql`DELETE FROM site_delivery_sources WHERE application_id=201`;
 });
 await t.test('concurrent redemption of the same grant has one winner',async()=>{
  await h.sql`UPDATE applications SET active=true,published=true,devupload_url='https://steamrip.com/qa-game/' WHERE id=201`;
  const p=await prepare();now=Date.parse(p.grant.ready_at);const rs=await Promise.all([redeem(p),redeem(p)]);assert.deepEqual(rs.map(r=>r.status).sort(),[303,410]);
 });
 await t.test('inline JSON contains a destination only after successful atomic redeem, replay denied',async()=>{
  await h.sql`UPDATE applications SET active=true,published=true,shrankme_url=NULL,devupload_url='https://buzzheavier.com/file-xyz' WHERE id=201`;
  const p=await prepare();now=Date.parse(p.grant.ready_at)-1;
  assert.equal((await redeem(p,'application/json')).status,425);now++;
  // Injected resolver asserts the app/revision and handles a direct provider source too.
  const inline=createLegacyHandler('redeem',{sql:h.sql,env,now:()=>now,resolve:async()=>destination});
  const request=()=>new Request(h.origin+'/api/downloads/legacy/redeem',{method:'POST',headers:{origin:h.origin,'sec-fetch-site':'same-origin',accept:'application/json',cookie:p.cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({application_id:201,token:p.grant.token})});
  const r=await inline(request());assert.equal(r.status,200);assert.deepEqual(await r.json(),{destination});assert.match(r.headers.get('cache-control'),/no-store/);
  assert.equal((await inline(request())).status,410);
 });
 await t.test('failure metadata appears only after eligibility, source mutation prevents stale manual fallback',async()=>{
  const {ProviderFailure,providerError}=require('../src/lib/downloads/providers/public-http.ts');
  await h.sql`UPDATE applications SET active=true,published=true,shrankme_url=NULL,devupload_url='https://bzzhr.co/file-xyz' WHERE id=201`;
  const p=await prepare();now=Date.parse(p.grant.ready_at)-1;let calls=0,mutate=false;
  const handler=createLegacyHandler('redeem',{sql:h.sql,env,now:()=>now,resolve:async()=>{calls++;if(mutate)await h.sql`UPDATE applications SET devupload_url='https://bzzhr.co/changed' WHERE id=201`;throw new ProviderFailure(providerError('PROVIDER_CHALLENGE'),'bzzhr_page','bzzhr.co',403);}});
  const request=()=>new Request(h.origin+'/api/downloads/legacy/redeem',{method:'POST',headers:{origin:h.origin,'sec-fetch-site':'same-origin',accept:'application/json',cookie:p.cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({application_id:201,token:p.grant.token})});
  let r=await handler(request()),data=await r.json();assert.equal(r.status,425);assert.equal(calls,0);assert.equal(data.error.source_url,undefined);
  now++;r=await handler(request());data=await r.json();assert.equal(r.status,503);assert.equal(data.error.stage,'bzzhr_page');assert.equal(data.error.upstream_status,403);assert.equal(data.error.source_url,'https://bzzhr.co/file-xyz');
  mutate=true;r=await handler(request());data=await r.json();assert.equal(r.status,409);assert.equal(data.error.code,'SOURCE_CHANGED');assert.equal(data.error.source_url,undefined);
  await h.sql`UPDATE applications SET devupload_url='https://bzzhr.co/d/file-xyz?v=must-not-persist' WHERE id=201`;
  assert.equal((await call('prepare',{application_id:201})).status,404);
  await h.sql`UPDATE applications SET devupload_url='https://steamrip.com/qa-game/' WHERE id=201`;
 });
 await t.test('Telegram priority unchanged; manual host policy fails closed',async()=>{
  await h.sql`INSERT INTO site_delivery_sources(application_id,provider,telegram_channel_username,telegram_message_id) VALUES(201,'telegram','files_channel',42)`;
  const p=await prepare();now=Date.parse(p.grant.ready_at);const count=resolutions;const r=await redeem(p);assert.equal(r.headers.get('location'),'https://t.me/files_channel/42');assert.equal(resolutions,count);
  await h.sql`DELETE FROM site_delivery_sources WHERE application_id=201`;
  await h.sql`UPDATE applications SET shrankme_url='https://evil.test/file' WHERE id=201`;assert.equal((await call('prepare',{application_id:201})).status,404);
 });
 assert.ok(!logs.join('\n').includes('QA_SECRET')&&!logs.join('\n').includes('SteamRIP stack'));
});
