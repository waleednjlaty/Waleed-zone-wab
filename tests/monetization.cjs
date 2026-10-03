'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./helpers/typescript.cjs');
const {adsenseState,adsTxt,adRouteAllowed,manualAdConfig}=require('../src/lib/ads.ts');
const {adConsentGranted}=require('../src/lib/monetization/consent.ts');
const {contentSecurityPolicy}=require('../src/lib/security/csp.ts');
const enabled={ADSENSE_PUBLISHER_ID:'ca-pub-0000000000000000',ADSENSE_CONTENT_REVIEWED:'true',ADSENSE_SITE_APPROVED:'true',ADSENSE_PRIVACY_READY:'true',ADSENSE_ENABLED:'true',ADSENSE_DETAIL_SLOT_ID:'0000000000',ADSENSE_CMP_ID:'300'};
test('verification is independent; all 32 gate combinations fail closed except all five',()=>{
  const gates=['ADSENSE_CONTENT_REVIEWED','ADSENSE_SITE_APPROVED','ADSENSE_PRIVACY_READY','ADSENSE_ENABLED'];
  for(let mask=0;mask<32;mask++){
    const env={ADSENSE_PUBLISHER_ID:mask&16?enabled.ADSENSE_PUBLISHER_ID:''};
    gates.forEach((key,i)=>env[key]=mask&(1<<i)?'true':'false');
    assert.equal(adsenseState(env).serving,mask===31);
    assert.equal(Boolean(adsTxt(env)),Boolean(mask&16));
  }
  for(const key of gates)for(const value of [undefined,'TRUE','1',' true','true ','yes',''])assert.equal(adsenseState({...enabled,[key]:value}).serving,false);
  for(const publisher of ['pub-0000000000000000','ca-pub-1','ca-pub-00000000000000000',' ca-pub-0000000000000000','ca-pub-0000000000000000\n','ca-pub-٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠']){
    assert.equal(adsenseState({...enabled,ADSENSE_PUBLISHER_ID:publisher}).serving,false);assert.equal(adsTxt({ADSENSE_PUBLISHER_ID:publisher}),null);
  }
  assert.equal(adsTxt({ADSENSE_PUBLISHER_ID:enabled.ADSENSE_PUBLISHER_ID}),'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n');
  assert.equal(manualAdConfig({...enabled,ADSENSE_CMP_ID:''}),null);assert.equal(manualAdConfig({...enabled,ADSENSE_DETAIL_SLOT_ID:''}),null);
});
test('SDK CSP restricted to canonical detail pages, never download/admin/account/search even with all gates',()=>{
  for(const path of ['/download/201','/admin','/account','/search','/','/apps','/games','/apps/test/201','/apps/test-0','/apps/test-201?ads=1']){
    assert.equal(adRouteAllowed(path),false);
    const csp=contentSecurityPolicy('test',enabled,false,path);assert.ok(!csp.includes('googlesyndication'));assert.ok(!csp.includes('connect-src \'self\' https:'));
  }
  for(const path of ['/apps/test-201','/games/لعبة-202']){
    assert.equal(adRouteAllowed(path),true);assert.match(contentSecurityPolicy('test',enabled,false,path),/pagead2/);
    assert.ok(!contentSecurityPolicy('test',enabled,true,path).includes('googlesyndication'));
    assert.ok(!contentSecurityPolicy('test',{...enabled,ADSENSE_PRIVACY_READY:'false'},false,path).includes('googlesyndication'));
  }
});
test('CMP missing/failed/wrong/stub/denied/restricted cannot authorize; revocation immediately denies',()=>{
  const data={cmpId:300,cmpStatus:'loaded',eventStatus:'tcloaded',tcString:'fixture-only-not-a-real-tc-string',purpose:{consents:{1:true,3:true,4:true}},vendor:{consents:{755:true}}};
  assert.equal(adConsentGranted(data,true,300),true);
  for(const value of [null,{}, {...data,cmpId:42},{...data,cmpStatus:'stub'},{...data,eventStatus:'cmpuishown'},{...data,tcString:''},{...data,vendor:{consents:{755:false}}},{...data,publisher:{restrictions:{1:{755:0}}}}])assert.equal(adConsentGranted(value,true,300),false);
  assert.equal(adConsentGranted(data,false,300),false);
  for(const key of [1,3,4])assert.equal(adConsentGranted({...data,purpose:{consents:{...data.purpose.consents,[key]:false}}},true,300),false);
});
test('owner review routes: security, strict validation, CAS, privacy, invalidation, missing schema and outage', {timeout:60000}, async t=>{
  const h=await require('./admin/runtime.cjs').createFixture(t,{monetization:true});
  const Module=require('node:module'),original=Module._load;
  let applicationAdEligible;
  try { Module._load=function(name,...args){if(name==='server-only')return {};if(name==='@/lib/db')return {getSql:()=>h.sql};return original.call(this,name,...args);};
    ({applicationAdEligible}=require('../src/lib/monetization/eligibility.ts'));
  } finally {Module._load=original;}
  Object.assign(process.env,enabled);
  const reviewSnapshot=async()=>JSON.stringify((await h.db.query('SELECT * FROM site_ad_eligibility ORDER BY application_id')).rows);
  async function data(response,status=200,code){assert.equal(response.status,status);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('x-robots-tag'),/noindex/);const row=await response.json();if(code)assert.equal(row.error.code,code);return row;}
  async function deny(options,status,code){const before=await reviewSnapshot();await data(await h.call('review',options),status,code);assert.equal(await reviewSnapshot(),before);}
  for(const actor of ['anonymous','visitor','expired']){
    await data(await h.call('monetization',{actor}),actor==='visitor'?403:401);
    await deny({actor,method:'PUT',raw:'{'},actor==='visitor'?403:401);
  }
  const initial=await data(await h.call('review'));
  assert.equal(initial.status,'unreviewed');assert.equal(initial.rights_basis,'unknown');
  assert.equal(await applicationAdEligible(201),false);
  const payload={expected_revision:initial.revision,status:'eligible',rights_basis:'publisher_permission',review_notes:'INTERNAL_REVIEW_SENTINEL https://publisher.example.test/license reviewed for redistribution'};
  for(const headers of [{'X-CSRF-Token':null},{Origin:'https://evil.example'},{Origin:null},{'Sec-Fetch-Site':'cross-site'}])await deny({method:'PUT',headers,body:payload},403);
  await deny({method:'PUT',actor:'otherOwner',body:payload},403,'CSRF_REJECTED');
  for(const [key,value] of [['status','safe'],['rights_basis','pirated'],['expected_revision','0'],['review_notes','x'.repeat(1001)],['review_notes','invisible\u200b'],['active',true],['reviewed_at',new Date().toISOString()],['application_id',202]])await deny({method:'PUT',body:{...payload,[key]:value}},400);
  await deny({method:'PUT',body:{...payload,rights_basis:'unknown'}},400,'RIGHTS_EVIDENCE_REQUIRED');
  await deny({method:'PUT',body:{...payload,review_notes:''}},400,'RIGHTS_EVIDENCE_REQUIRED');
  for(const raw of ['{','null','[]',JSON.stringify({padding:'x'.repeat(6200)})])await deny({method:'PUT',raw,headers:{'Content-Length':'2'}},Buffer.byteLength(raw)>6144?413:400);
  for(const id of ['0','-1','201 OR 1=1','2147483648','201.0'])await deny({method:'PUT',body:payload,id},400);
  await deny({id:'2147483647',method:'PUT',body:payload},404);
  const catalogBefore=await h.snapshot();
  let current=await data(await h.call('review',{method:'PUT',body:payload}));
  assert.equal(await h.snapshot(),catalogBefore,'Review must never increment catalog revision or mutate downloads');
  assert.equal(await applicationAdEligible(201),true);
  await deny({method:'PUT',body:payload},409,'STALE_REVISION');
  const list=await data(await h.call('monetization',{query:'?limit=1'}));assert.deepEqual(list.counts,{eligible:1,blocked:0,unreviewed:2});assert.equal(list.items.length,1);assert.equal(list.next_after,201);
  await data(await h.call('monetization',{query:'?limit=1&limit=2'}),400);await data(await h.call('monetization',{query:'?limit=101'}),400);
  // Public authority never contains internal review data; its return type is boolean.
  assert.equal(JSON.stringify(await applicationAdEligible(201)).includes('INTERNAL_REVIEW_SENTINEL'),false);
  await h.db.exec('UPDATE applications SET views=views+1 WHERE id=201');
  assert.equal(await applicationAdEligible(201),true,'Counters do not revoke review');
  await h.db.exec("UPDATE applications SET version='NEW CONTENT' WHERE id=201");
  assert.equal(await applicationAdEligible(201),false);assert.equal((await data(await h.call('review'))).status,'unreviewed');
  await deny({method:'PUT',body:{...payload,expected_revision:current.revision}},409);
  current=await data(await h.call('review'));
  current=await data(await h.call('review',{method:'PUT',body:{...payload,expected_revision:current.revision}}));
  await h.db.exec("INSERT INTO site_delivery_sources(application_id,provider,telegram_channel_username,telegram_message_id) VALUES(201,'telegram','files_channel',1)");
  assert.equal(await applicationAdEligible(201),false,'Bot/source change revokes review');
  current=await data(await h.call('review'));
  for(const status of ['blocked','unreviewed','eligible']){
    current=await data(await h.call('review',{method:'PUT',body:{...payload,status,expected_revision:current.revision}}));assert.equal(current.status,status);
  }
  await h.db.exec('UPDATE applications SET published=false WHERE id=201');assert.equal(await applicationAdEligible(201),false);
  await h.db.exec('ALTER TABLE site_ad_eligibility RENAME TO qa_missing');
  await data(await h.call('monetization'),503,'ADMIN_SCHEMA_UNAVAILABLE');
  await data(await h.call('review',{method:'PUT',body:payload}),503,'ADMIN_SCHEMA_UNAVAILABLE');
  assert.equal(await applicationAdEligible(201),false);
  assert.equal((await h.db.query("SELECT to_regclass('site_ad_eligibility') AS present")).rows[0].present,null);
  await h.db.exec('ALTER TABLE qa_missing RENAME TO site_ad_eligibility');
  h.setFault('sql',true);assert.equal(await applicationAdEligible(201),false);await data(await h.call('monetization'),401);h.setFault('sql',false);
  const {readFileSync}=require('node:fs');const root=readFileSync(require.resolve('../src/app/layout.tsx'),'utf8');
  assert.ok(!root.includes('adsbygoogle.js'));assert.ok(!root.includes('ADSENSE_READY'));
  for(const file of ['../src/lib/queries.ts','../src/app/api/search/route.ts']){const src=readFileSync(require.resolve(file),'utf8');assert.ok(!src.includes('review_notes'));}
});
