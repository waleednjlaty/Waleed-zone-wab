'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const hasApi=existsSync(require('node:path').join(__dirname,'../src/lib/admin/http.ts'));
const strict=process.env.WZ_ADMIN_CONTRACT_STRICT==='1';
const {routePaths}=require('./admin/runtime.cjs');
const writes=[['versions','POST'],['version','PATCH'],['files','POST'],['file','PATCH'],['config','PUT'],['control','POST']];
test('Agent R: Admin route security/state contract against real handlers + PostgreSQL', {skip:!hasApi&&!strict?'BLOCKED: Agent P Admin APIs absent':false,timeout:60000},async t=>{
  assert.ok(hasApi,'BLOCKED: Agent P Admin APIs absent');
  const h=await require('./admin/runtime.cjs').createFixture(t);
  async function data(r,status=200,code) {
    assert.equal(r.status,status);assert.match(r.headers.get('cache-control')||'',/no-store/);assert.match(r.headers.get('x-robots-tag')||'',/noindex/);
    assert.equal(r.headers.get('location'),null);assert.equal(r.headers.get('access-control-allow-origin'),null);
    const value=await r.json(),text=JSON.stringify(value);if(code)assert.equal(value.error.code,code);
    for(const secret of [...Object.values(h.sessions),'QA_DB_PASSWORD_SENTINEL','QA_PASSWORD_HASH','QA_PRIVATE_BOT_URL','QA_PRIVATE_BOT_FIELD','QA_OWNER_EMAIL@example.test'])assert.ok(!text.includes(secret),'Credential/private bot value leaked');
    assert.ok(!/storage_key|storage_object_version|X-Amz-(Signature|Credential)|postgres(?:ql)?:\/\/|password_hash|token_hash/.test(text));return value;
  }
  async function deny(op,options,status,code){const before=await h.snapshot();await data(await h.call(op,options),status,code);assert.equal(await h.snapshot(),before,'Denied request mutated metadata/settings/catalog');}
  for(const actor of ['anonymous','visitor','expired'])await t.test(`direct API ${actor}: all reads and writes denied without mutation`,async()=>{
    const status=actor==='visitor'?403:401;
    for(const op of Object.keys(routePaths))await deny(op,{actor},status,'OWNER_REQUIRED');
    for(const [op,method] of writes)await deny(op,{actor,method,raw:'{'},status,'OWNER_REQUIRED');
  });
  await t.test('stats token, forged role/owner headers and duplicate session cannot authorize Admin',async()=>{
    await deny('catalog',{actor:'anonymous',headers:{Authorization:'Bearer QA_STATS_SENTINEL'}},401);
    await deny('control',{method:'POST',actor:'visitor',headers:{'X-User-Id':'qa-owner','X-Role':'owner'},body:{enabled:false}},403);
    await deny('catalog',{headers:{Cookie:'__Host-wz_session='+h.sessions.owner+'; __Host-wz_session='+h.sessions.owner}},401);
  });
  for(const headers of [{'X-CSRF-Token':null},{'X-CSRF-Token':'forged'},{Origin:null},{Origin:'null'},{Origin:'https://evil.example'},{'Sec-Fetch-Site':'same-site'},{'Sec-Fetch-Site':'cross-site'},{Origin:'https://evil.example',Host:'evil.example','X-Forwarded-Host':'evil.example',Forwarded:'host=evil.example'}])await t.test('write protection '+JSON.stringify(headers),async()=>{
    for(const [op,method] of writes)await deny(op,{method,headers,body:{enabled:false}},403);
  });
  await t.test('CSRF from another valid owner session cannot perform writes',async()=>{for(const [op,method] of writes)await deny(op,{method,actor:'otherOwner',body:{enabled:false}},403,'CSRF_REJECTED');});
  await t.test('CSRF expiry/owner/origin binding are checked before state writes',async()=>{
    const {issueAdminCsrf}=require('../src/lib/admin/security.ts');
    for(const token of [issueAdminCsrf(h.sessions.owner,'qa-owner',h.origin,Date.now()-901000).csrf_token,issueAdminCsrf(h.sessions.owner,'qa-owner',h.origin,Date.now()+901000).csrf_token,issueAdminCsrf(h.sessions.owner,'other-owner',h.origin).csrf_token,issueAdminCsrf(h.sessions.owner,'qa-owner','https://evil.example').csrf_token])await deny('control',{method:'POST',body:{enabled:false},headers:{'X-CSRF-Token':token}},403,'CSRF_REJECTED');
  });
  for(const raw of ['{','null','[]','"owner"',JSON.stringify({padding:'x'.repeat(3000)}),JSON.stringify({padding:'و'.repeat(1100)})])await t.test(`invalid actual JSON stream: ${Buffer.byteLength(raw)} bytes`,async()=>{
    for(const [op,method] of writes)await deny(op,{method,raw,headers:{'Content-Length':'2'}},Buffer.byteLength(raw)>2048?413:400);
  });
  await t.test('owner allowed read/create positive controls; exact retries preserve pending identity',async()=>{
    for(const op of ['catalog','status','control','config','session'])await data(await h.call(op));
    const payload={application_id:201,release_key:'qa-release',version_label:'1.0'};
    const v=await data(await h.call('versions',{method:'POST',body:payload}));assert.equal(v.active,false);assert.equal(v.published,false);
    assert.deepEqual(await data(await h.call('versions',{method:'POST',body:payload})),v);
    const before=await h.snapshot();await data(await h.call('versions'));assert.equal(await h.snapshot(),before,'Reads write state');
  });
  const versions=(await data(await h.call('versions'))).items,v=versions[0];
  const fileId=randomUUID(),sha='a'.repeat(64),metadata={variant_key:'universal',artifact_type:'apk',size_bytes:24,sha256:sha,mime_type:'application/vnd.android.package-archive',download_filename:'qa.apk',storage_backend:'railway-s3',storage_key:`artifacts/${fileId}/${sha}.apk`,storage_object_version:null};
  const file=await data(await h.call('files',{method:'POST',body:{id:fileId,version_id:v.id,metadata}}));assert.equal(file.scan_status,'pending');assert.equal(file.active,false);
  const fv=async()=>data(await h.call('file',{id:fileId}));const vv=async()=>data(await h.call('version',{id:v.id}));
  await t.test('UUID/app validation, nonexistent records and unauthorized app/version/file reads/writes',async()=>{
    for(const op of ['file','version'])for(const id of ['not-uuid',"' OR 1=1--",'00000000-0000-0000-0000-000000000000'])await deny(op,{id},400);
    for(const op of ['file','version'])await deny(op,{id:randomUUID()},404,'RECORD_NOT_FOUND');
    for(const id of ['0','201 OR 1=1','2147483648'])await deny('config',{id},400);
    for(const actor of ['anonymous','visitor'])for(const [op,id,method,body] of [['file',fileId,'GET'],['version',v.id,'GET'],['config','201','GET'],['file',fileId,'PATCH',{action:'activate',expected_revision:file.revision}],['version',v.id,'PATCH',{action:'publish',expected_revision:v.revision}]])await deny(op,{id,method,body,actor},actor==='visitor'?403:401);
    await deny('versions',{method:'POST',body:{application_id:2147483647,version_label:'1.0',release_key:'missing'}},404);
    await deny('files',{method:'POST',body:{id:fileId,version_id:randomUUID(),metadata}},404);
    const other=await data(await h.call('versions',{method:'POST',body:{application_id:202,release_key:'other-release',version_label:'2.0'}}));
    await deny('files',{method:'POST',body:{id:fileId,version_id:other.id,metadata}},409,'IDENTITY_CONFLICT');
    assert.equal((await data(await h.call('files',{query:'?version_id='+other.id}))).items.length,0);
  });
  await t.test('unsafe state transitions and forged scan evidence rejected atomically',async()=>{
    await deny('file',{id:fileId,method:'PATCH',body:{action:'activate',expected_revision:(await fv()).revision}},409,'VERIFIED_FILES_REQUIRED');
    await deny('file',{id:fileId,method:'PATCH',body:{action:'verify',expected_revision:(await fv()).revision}},400);
    await deny('version',{id:v.id,method:'PATCH',body:{action:'publish',expected_revision:(await vv()).revision}},409);
    await deny('files',{method:'POST',body:{id:fileId,version_id:v.id,metadata:{...metadata,scan_status:'verified',verified_at:new Date().toISOString(),active:true}}},400);
    await deny('file',{id:fileId,method:'PATCH',body:{action:'edit',expected_revision:(await fv()).revision,metadata:{...metadata,storage_key:'artifacts/other-object.apk'}}},400);
  });
  await t.test('verified → active → published succeeds only after out-of-band fixture verification; quarantined/retired never revive',async()=>{
    await h.db.query("UPDATE site_download_files SET scan_status='verified',verified_at=clock_timestamp() WHERE id=$1",[fileId]);
    let f=await fv();await deny('file',{id:fileId,method:'PATCH',body:{action:'edit',expected_revision:f.revision,metadata}},409,'IMMUTABLE_METADATA');
    f=await data(await h.call('file',{id:fileId,method:'PATCH',body:{action:'activate',expected_revision:f.revision}}));assert.equal(f.active,true);
    await deny('version',{id:v.id,method:'PATCH',body:{action:'publish',expected_revision:(await vv()).revision}},409,'PUBLICATION_BLOCKED');
    let current=await data(await h.call('version',{id:v.id,method:'PATCH',body:{action:'activate',expected_revision:(await vv()).revision}}));
    current=await data(await h.call('version',{id:v.id,method:'PATCH',body:{action:'publish',expected_revision:current.revision}}));assert.equal(current.published,true);
    const stale=current.revision;current=await data(await h.call('version',{id:v.id,method:'PATCH',body:{action:'withdraw',expected_revision:current.revision}}));
    await deny('version',{id:v.id,method:'PATCH',body:{version_label:'mutated',expected_revision:current.revision}},409,'IMMUTABLE_METADATA');
    await deny('version',{id:v.id,method:'PATCH',body:{action:'activate',expected_revision:stale}},409,'STALE_REVISION');
    f=await data(await h.call('file',{id:fileId,method:'PATCH',body:{action:'quarantine',expected_revision:f.revision}}));
    await deny('file',{id:fileId,method:'PATCH',body:{action:'activate',expected_revision:f.revision}},409);
    f=await data(await h.call('file',{id:fileId,method:'PATCH',body:{action:'retire',expected_revision:f.revision}}));
    await deny('file',{id:fileId,method:'PATCH',body:{action:'activate',expected_revision:f.revision}},409);
  });
  await t.test('direct and re-enable cannot bypass missing gates or deployment override; reversible config positive controls',async()=>{
    let c=await data(await h.call('config'));
    c=await data(await h.call('config',{method:'PUT',body:{mode:'disabled',current_version_id:null,expected_revision:c.revision}}));assert.equal(c.mode,'disabled');
    for(const enabled of ['false','true']) {
      process.env.DIRECT_DOWNLOADS_ENABLED=enabled;
      await deny('config',{method:'PUT',body:{mode:'direct',current_version_id:v.id,expected_revision:c.revision}},409,'ROLLOUT_BLOCKED');
      await deny('control',{method:'POST',body:{enabled:true}},409,'ROLLOUT_BLOCKED');
    }
    process.env.DIRECT_DOWNLOADS_ENABLED='false';
    await deny('config',{method:'PUT',body:{mode:'legacy',current_version_id:v.id,expected_revision:c.revision}},400);
    c=await data(await h.call('config',{method:'PUT',body:{mode:'legacy',current_version_id:null,expected_revision:c.revision}}));assert.equal(c.mode,'legacy');
    await h.db.exec('UPDATE site_download_settings SET enabled=true');await data(await h.call('control',{method:'POST',body:{enabled:false}}));
    assert.equal((await data(await h.call('control'))).shared_enabled,false);
  });
  for(const table of ['site_download_settings','site_download_versions','site_download_files','site_download_app_config','site_download_budget'])await t.test('missing table '+table+' denies reads/writes without repair',async()=>{
    const before=await h.snapshot();await h.db.exec('ALTER TABLE '+table+' RENAME TO qa_missing');
    try {for(const op of ['catalog','status','config'])await data(await h.call(op),503,'ADMIN_SCHEMA_UNAVAILABLE');await data(await h.call('control',{method:'POST',body:{enabled:false}}),503,'ADMIN_SCHEMA_UNAVAILABLE');assert.equal((await h.db.query("SELECT to_regclass($1) AS present",[table])).rows[0].present,null);}
    finally {await h.db.exec('ALTER TABLE qa_missing RENAME TO '+table);}assert.equal(await h.snapshot(),before);
  });
  await t.test('database outage fails closed with safe errors for both auth and service failures',async()=>{
    const before=await h.snapshot();h.setFault('auth',true);await data(await h.call('catalog'),401,'OWNER_REQUIRED');h.setFault('auth',false);
    h.setFault('sql',true);await data(await h.call('session'),401);h.setFault('sql',false);
    h.setFault('service',true);await data(await h.call('catalog'),503,'ADMIN_UNAVAILABLE');await data(await h.call('control',{method:'POST',body:{enabled:false}}),503,'ADMIN_UNAVAILABLE');h.setFault('service',false);assert.equal(await h.snapshot(),before);
    // Auth succeeds, then the service read fails: a real dropped column maps to safe 503.
    await h.db.exec('ALTER TABLE applications RENAME COLUMN name TO qa_missing_name');
    try{await data(await h.call('catalog'),503,'ADMIN_SCHEMA_UNAVAILABLE');}finally{await h.db.exec('ALTER TABLE applications RENAME COLUMN qa_missing_name TO name');}
  });
});
