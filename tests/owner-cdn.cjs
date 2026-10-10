'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
require('./helpers/typescript.cjs');
const load=Module._load;Module._load=function(n,...a){return n==='server-only'?{}:load.call(this,n,...a);};
const {createOwnerCdnCache,ownerCdnBinding,ownerScopeKey,OWNER_CDN_TTL_MS}=require('../src/lib/downloads/owner-cdn.ts');
const {providerError}=require('../src/lib/downloads/providers/public-http.ts');Module._load=load;
const page='https://buzzheavier.com/file-xyz',url='https://ts.bzzhr.to/d/file-xyz?v=QA_SIGNED_SENTINEL',sig=()=>new AbortController().signal;
test('owner binding accepts distinct signatures for one exact file and rejects adversarial destinations',()=>{
 for(const v of ['abc_DEF-123','another_signature'])assert.equal(ownerCdnBinding(page,page,url.replace('QA_SIGNED_SENTINEL',v)).fileId,'file-xyz');
 for(const raw of [url.replace('ts.bzzhr.to','ts.bzzhr.to.evil.test'),url.replace('ts.bzzhr.to','evil.ts.bzzhr.to'),url.replace('https:','http:'),url.replace('/d/file-xyz','/d/another'),url+'&next=evil',url+'#part',url.replace('ts.bzzhr.to','ts.bzzhr.to:443'),url.replace('/d/','/d/%2e%2e/')])assert.throws(()=>ownerCdnBinding(page,page,raw));
 assert.throws(()=>ownerCdnBinding('https://buzzheavier.com/other',page,url),e=>e.code==='FILE_ID_MISMATCH');
 assert.throws(()=>ownerCdnBinding('https://evil.test/game',page,url));
});
test('owner cache is revision/source/application/session-bound, bounded by TTL and never exposes links in metadata',async()=>{
 let now=0,checks=0;const cache=createOwnerCdnCache(async x=>{checks++;return x;},()=>now);
 const scope=ownerScopeKey('owner','session');await cache.put(scope,1,'r',page,page,url,false,sig());
 assert.equal(cache.peek(scope,1,'r',page).verification,'verified');assert.ok(!JSON.stringify(cache.peek(scope,1,'r',page)).includes('QA_SIGNED'));
 for(const [s,id,r,p] of [[ownerScopeKey('owner','another'),1,'r',page],[scope,2,'r',page],[scope,1,'new',page],[scope,1,'r','https://buzzheavier.com/other']])assert.equal(cache.peek(s,id,r,p),null);
 const result=await cache.resolve(scope,1,'r',page,sig());assert.equal(result.destination,url);assert.equal(checks,2);
 now=OWNER_CDN_TTL_MS;assert.throws(result.assertCurrent,e=>e.code==='OWNER_LINK_EXPIRED');assert.equal(cache.peek(scope,1,'r',page),null);assert.equal(await cache.resolve(scope,1,'r',page,sig()),null);
});
test('HEAD barriers need explicit owner exception; expiry, HTML, foreign redirects and 429 fail closed',async()=>{
 for(const code of ['PROVIDER_FORBIDDEN','PROVIDER_CHALLENGE','HEAD_UNAVAILABLE','PROVIDER_DNS_FAILED']){
  const cache=createOwnerCdnCache(async()=>{throw providerError(code);});
  await assert.rejects(cache.put('owner',1,'r',page,page,url,false,sig()));
  const info=await cache.put('owner',1,'r',page,page,url,true,sig());assert.equal(info.verification,'owner_unverified');assert.equal((await cache.resolve('owner',1,'r',page,sig())).destination,url);
 }
 for(const code of ['SOURCE_REMOVED','INVALID_FILE_RESPONSE','INVALID_SOURCE','PROVIDER_RATE_LIMITED']){
  const cache=createOwnerCdnCache(async()=>{throw providerError(code);});await assert.rejects(cache.put('owner',1,'r',page,page,url,true,sig()));assert.equal(cache.peek('owner',1,'r',page),null);
 }
 for(const final of [url.replace('file-xyz','other'),url.replace('ts.bzzhr.to','evil.test')]){const cache=createOwnerCdnCache(async()=>final);await assert.rejects(cache.put('owner',1,'r',page,page,url,true,sig()));}
});
test('early invalidation evicts link and a cleared/replaced link cannot be delivered after async verification',async()=>{
 let fail=false,release;const cache=createOwnerCdnCache(async x=>{if(fail)throw providerError('SOURCE_REMOVED');if(release===true)await new Promise(r=>release=r);return x;});
 await cache.put('s',1,'r',page,page,url,false,sig());fail=true;await assert.rejects(cache.resolve('s',1,'r',page,sig()));assert.equal(cache.peek('s',1,'r',page),null);
 fail=false;await cache.put('s',1,'r',page,page,url,false,sig());release=true;const pending=cache.resolve('s',1,'r',page,sig());await new Promise(r=>setImmediate(r));cache.clear('s',1,'r',page);release();await assert.rejects(pending,e=>e.code==='OWNER_LINK_EXPIRED');
});
test('owner endpoint and normal download route enforce actual sessions, CSRF, countdown, one-use grant and publication',async t=>{
 t.mock.method(console,'warn',()=>{});
 const h=await require('./admin/runtime.cjs').createFixture(t,{monetization:true});
 let now=Date.now(),checks=0;const cache=createOwnerCdnCache(async x=>{checks++;return x;},()=>now);
 const original=Module._load;Module._load=function(n,...a){if(n==='server-only')return {};if(n==='@/lib/analytics/schedule')return {scheduleMetrics:()=>{}};return original.call(this,n,...a);};
 const {createOwnerCdnHandler}=require('../src/lib/admin/owner-cdn-http.ts'),{createLegacyHandler}=require('../src/lib/delivery/http.ts');Module._load=original;
 const env={...process.env,OWNER_CDN_TEST_ENABLED:'true',LEGACY_DOWNLOAD_SIGNING_KEY:'x'.repeat(64)};
 await h.sql`UPDATE applications SET shrankme_url=NULL,devupload_url=${page} WHERE id=201`;
 const invoke=(fn,path,body,{actor='owner',csrf=h.csrf,origin=h.origin,method='POST',extraCookie='',contentType='application/json',accept='application/json'}={})=>{
  const request=new Request(h.origin+path,{method,headers:{origin,'sec-fetch-site':'same-origin',cookie:(h.sessions[actor]?'__Host-wz_session='+h.sessions[actor]+'; ':'')+extraCookie,'x-csrf-token':csrf||'','content-type':contentType,accept},...(method==='GET'?{}:{body:contentType==='application/json'?JSON.stringify(body):new URLSearchParams(body)})});
  return h.withRequest(request,()=>fn(request));
 };
 const handler=createOwnerCdnHandler({sql:h.sql,env,cache});
 const put={application_id:201,expected_revision:'',bzzhr_page:page,signed_url:url,allow_unverified:false,confirm_source:true};
 const read=async options=>invoke(handler,'/api/admin/downloads/cdn-test?application_id=201',null,{method:'GET',...options});
 put.expected_revision=(await (await read()).json()).source_revision;
 await t.test('anonymous, visitor, expired session and CSRF attacks cannot import a link',async()=>{
  for(const actor of ['anonymous','visitor','expired']){const r=await invoke(handler,'/api/admin/downloads/cdn-test',put,{actor});assert.ok([401,403].includes(r.status));}
  for(const options of [{csrf:''},{csrf:'fake'},{origin:'https://evil.test'},{actor:'otherOwner'}])assert.equal((await invoke(handler,'/api/admin/downloads/cdn-test',put,options)).status,403);
  assert.equal(checks,0);
 });
 await t.test('flag off, wrong file, stale source and missing attestation fail without exposure',async()=>{
  const off=createOwnerCdnHandler({sql:h.sql,env:{...env,OWNER_CDN_TEST_ENABLED:'false'},cache});assert.equal((await invoke(off,'/api/admin/downloads/cdn-test',put)).status,503);
  for(const body of [{...put,signed_url:url.replace('file-xyz','another')},{...put,expected_revision:'stale'},{...put,confirm_source:false}]){const r=await invoke(handler,'/api/admin/downloads/cdn-test',body);assert.ok([400,409].includes(r.status));assert.ok(!(await r.text()).includes('QA_SIGNED'));}
 });
 await t.test('import returns only safe metadata, and normal mobile flow enforces exact 20 seconds and replay',async()=>{
  const saved=await invoke(handler,'/api/admin/downloads/cdn-test',put);assert.equal(saved.status,200);assert.ok(!(await saved.text()).includes('QA_SIGNED'));
  const scope=ownerScopeKey('qa-owner',h.sessions.owner);
  const call=(operation,body,options={})=>invoke(createLegacyHandler(operation,{sql:h.sql,env,now:()=>now,ownerCache:cache,resolve:async()=>{throw providerError('PROVIDER_CHALLENGE');}}),'/api/downloads/legacy/'+operation,body,{...options,contentType:operation==='prepare'?'application/json':'application/x-www-form-urlencoded'});
  const prepared=await call('prepare',{application_id:201});const grant=await prepared.json(),cookie=prepared.headers.get('set-cookie').split(';')[0];assert.ok(grant.owner_test);assert.ok(!JSON.stringify(grant).includes('QA_SIGNED'));
  const body={application_id:'201',token:grant.token};now=Date.parse(grant.ready_at)-1;assert.equal((await call('redeem',body,{extraCookie:cookie})).status,425);now++;
  const status=await call('status',body,{extraCookie:cookie});assert.ok(!(await status.text()).includes('QA_SIGNED'));
  const response=await call('redeem',body,{extraCookie:cookie,accept:'text/html'});assert.equal(response.status,303);assert.equal(response.headers.get('location'),url);assert.equal(await response.text(),'');
  assert.equal((await call('redeem',body,{extraCookie:cookie})).status,410);
  const another=await call('prepare',{application_id:201},{actor:'visitor'});assert.ok(!(await another.text()).includes('owner_test'));
  const pending=await call('prepare',{application_id:201}),fresh=await pending.json(),client=pending.headers.get('set-cookie').split(';')[0];now=Date.parse(fresh.ready_at);
  await h.sql`UPDATE applications SET published=false WHERE id=201`;
  assert.equal((await call('redeem',{application_id:'201',token:fresh.token},{extraCookie:client})).status,404);
 });
});
