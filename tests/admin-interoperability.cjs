'use strict';
// Release gate: real UI client -> actual owner route exports -> PostgreSQL SQL.
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./helpers/typescript.cjs');
test('real Admin frontend/backend interoperability release gate',async t=>{
  const h=await require('./admin/runtime.cjs').createFixture(t);
  const {adminApi}=require('../src/components/admin/api.ts');
  const {formatBytes}=require('../src/components/admin/presentation.ts');
  const transport=global.fetch;
  const paths={'/api/admin/session':'session','/api/admin/catalog':'catalog','/api/admin/downloads/status':'status','/api/admin/downloads/control':'control','/api/admin/downloads/versions':'versions','/api/admin/downloads/files':'files'};
  const requests=[];
  global.fetch=async(url,options={})=>{
    const target=new URL(url,h.origin);assert.equal(target.origin,h.origin);
    const op=paths[target.pathname]??(target.pathname.startsWith('/api/admin/downloads/config/')?'config':target.pathname.startsWith('/api/admin/downloads/versions/')?'version':target.pathname.startsWith('/api/admin/downloads/files/')?'file':null);
    assert.ok(op,'Missing backend route: '+target.pathname);requests.push([target.pathname,options]);
    // No fabricated success, token replacement or body rewriting.
    return h.call(op,{method:options.method||'GET',...(options.body?{raw:options.body}:{}),headers:options.headers,id:target.pathname.split('/').at(-1),query:target.search});
  };
  t.after(()=>{global.fetch=transport;});
  let csrf, versionId;
  await t.test('session token retains dotted server format and passes write validator',async()=>{
    csrf=await adminApi.csrf();assert.match(csrf,/^[0-9]{10}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    await adminApi.disable(csrf);
    await assert.rejects(adminApi.disable('A'.repeat(43)),/CSRF_REQUIRED/);
    await assert.rejects(adminApi.disable(csrf.slice(0,-1)+(csrf.endsWith('a')?'b':'a')),e=>e.status===403);
  });
  await t.test('catalog uses keyset pagination and private-field allowlist',async()=>{
    const catalog=await adminApi.applications(null);assert.ok(catalog.items.some(x=>x.id===201));
    const next=await adminApi.applications(201);assert.ok(next.items.every(x=>x.id>201));
    assert.ok(!JSON.stringify(catalog).includes('QA_PRIVATE'));
  });
  await t.test('detail composes catalog/config/version/file scopes',async()=>{
    const detail=await adminApi.detail(201);assert.equal(detail.app.id,201);assert.match(detail.app.configRevision,/^[a-f0-9]{64}$/);
    assert.equal(detail.directActivationAllowed,false);
  });
  await t.test('status preserves BIGINT decimal strings and cannot invent provider readiness',async()=>{
    await h.db.exec("INSERT INTO site_download_budget(id,starts_at,expires_at,allowance_verified,byte_limit,reserved_bytes) VALUES(1,NOW(),NOW()+INTERVAL '1 day',true,9007199254740993,9007199254740992)");
    const status=await adminApi.status();assert.equal(status.enabled,false);assert.equal(status.activationAllowed,false);
    assert.equal(status.storageReady,false);assert.equal(status.ingressReady,false);assert.equal(status.canaryReady,false);
    assert.equal(status.budget.limitBytes,'9007199254740993');assert.equal(status.budget.remainingBytes,'1');
    assert.match(formatBytes(status.budget.limitBytes),/9,007,199,254,740,993 bytes/);
  });
  await t.test('pending version creates, then draft rename uses authoritative revision',async()=>{
    await adminApi.saveVersion({application_id:201,version_label:'1.0',release_key:'interop-r1'},csrf);
    let detail=await adminApi.detail(201);const v=detail.versions.find(v=>v.releaseKey==='interop-r1');versionId=v.id;
    assert.equal(v.active,false);assert.equal(v.published,false);
    await adminApi.saveVersion({expected_revision:v.revision,version_label:'1.1'},csrf,v.id);
    detail=await adminApi.detail(201);assert.equal(detail.versions.find(x=>x.id===v.id).label,'1.1');
    await assert.rejects(adminApi.saveVersion({expected_revision:v.revision,version_label:'1.2'},csrf,v.id),e=>e.status===409);
  });
  await t.test('config writes include revision, clear non-direct selection and reject stale without retries',async()=>{
    const before=await adminApi.detail(201);
    await adminApi.saveConfig(201,{expected_revision:before.app.configRevision,mode:'disabled',current_version_id:null},csrf);
    const after=await adminApi.detail(201);assert.equal(after.app.mode,'disabled');
    const count=requests.length;
    await assert.rejects(adminApi.saveConfig(201,{expected_revision:before.app.configRevision,mode:'legacy',current_version_id:null},csrf),e=>e.status===409);
    assert.equal(requests.length,count+1,'Conflict must not trigger blind write retry');
    await assert.rejects(adminApi.saveConfig(201,{expected_revision:after.app.configRevision,mode:'direct',current_version_id:versionId},csrf),e=>e.status===409);
  });
  const fileId='22222222-2222-4222-8222-222222222222';
  await t.test('pending file uses explicit UUID, exact SHA/key binding and nested metadata',async()=>{
    const metadata={variant_key:'universal',artifact_type:'apk',size_bytes:24,sha256:'a'.repeat(64),mime_type:'application/vnd.android.package-archive',download_filename:'qa.apk',storage_backend:'railway-s3',storage_key:`artifacts/${fileId}/${'a'.repeat(64)}.apk`,storage_object_version:null};
    await assert.rejects(adminApi.saveFile({id:fileId,version_id:versionId,metadata:{...metadata,storage_key:'artifacts/wrong.apk'}},csrf),e=>e.status===400);
    await adminApi.saveFile({id:fileId,version_id:versionId,metadata},csrf);
    const detail=await adminApi.detail(201);const f=detail.files.find(f=>f.id===fileId);
    assert.equal(f.scanStatus,'pending');assert.equal(f.active,false);
    assert.ok(!/storage_key|sha256|storage_object_version|artifacts\//.test(JSON.stringify(detail)));
    await assert.rejects(adminApi.fileAction(f.id,'activate',f.revision,csrf),e=>e.status===409);
  });
  await t.test('version transitions stay blocked until real verification; staged actions retain revisions',async()=>{
    let detail=await adminApi.detail(201),v=detail.versions.find(v=>v.id===versionId);
    await assert.rejects(adminApi.saveVersion({expected_revision:v.revision,action:'activate'},csrf,v.id),e=>e.status===409);
    // Test-only trusted publisher evidence; the UI/API cannot assert verification.
    await h.db.exec(`UPDATE site_download_files SET scan_status='verified',verified_at=NOW() WHERE id='${fileId}'`);
    detail=await adminApi.detail(201);const f=detail.files.find(f=>f.id===fileId);
    await adminApi.fileAction(f.id,'activate',f.revision,csrf);
    await adminApi.saveVersion({expected_revision:v.revision,action:'activate'},csrf,v.id);
    v=(await adminApi.detail(201)).versions.find(x=>x.id===v.id);
    await adminApi.saveVersion({expected_revision:v.revision,action:'publish'},csrf,v.id);
    v=(await adminApi.detail(201)).versions.find(x=>x.id===v.id);assert.equal(v.published,true);
    await adminApi.saveVersion({expected_revision:v.revision,action:'withdraw'},csrf,v.id);
    v=(await adminApi.detail(201)).versions.find(x=>x.id===v.id);assert.equal(v.active,false);assert.equal(v.published,false);
  });
});
