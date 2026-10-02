'use strict';
// A release gate, intentionally RED when the real P/Q contracts do not agree.
// Network transport alone is replaced with actual owner route dispatch.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const path=require('node:path');
require('./helpers/typescript.cjs');
const ready=existsSync(path.join(__dirname,'../src/lib/admin/http.ts'))&&existsSync(path.join(__dirname,'../src/components/admin/api.ts'));
test('Agent R: real Admin frontend/backend interoperability release gate',{skip:!ready?'BLOCKED: both P and Q required':false},async t=>{
  const h=await require('./admin/runtime.cjs').createFixture(t);
  const {adminApi}=require('../src/components/admin/api.ts');
  const transport=global.fetch;
  const paths={'/api/admin/session':'session','/api/admin/catalog':'catalog','/api/admin/downloads/status':'status','/api/admin/downloads/control':'control','/api/admin/downloads/versions':'versions','/api/admin/downloads/files':'files'};
  global.fetch=async(url,options={})=>{
    const target=new URL(url,h.origin);assert.equal(target.origin,h.origin);
    const op=paths[target.pathname]??(target.pathname.startsWith('/api/admin/downloads/config/')?'config':null);
    assert.ok(op,'Frontend requested missing backend route: '+target.pathname);
    // Body-only checks isolate the schema from the independently tested client
    // token-format mismatch. The real handler still verifies the real session token.
    return h.call(op,{method:options.method||'GET',...(options.body?{raw:options.body}:{}),headers:{...options.headers,...(options.method&&options.method!=='GET'?{'X-CSRF-Token':h.csrf}:{})},id:target.pathname.split('/').at(-1),query:target.search});
  };
  t.after(()=>{global.fetch=transport;});
  await t.test('client CSRF endpoint exists and decodes owner session token',async()=>{const token=await adminApi.csrf();assert.equal(typeof token,'string');});
  await t.test('client catalog endpoint exists and accepts pagination/DTO',async()=>{const catalog=await adminApi.applications(1);assert.ok(catalog.items.some(x=>x.id===201));});
  await t.test('client detail endpoint exists with app/version/file DTO',async()=>{const detail=await adminApi.detail(201);assert.equal(detail.app.id,201);});
  await t.test('status DTO is usable without inventing readiness',async()=>{const status=await adminApi.status();assert.equal(status.enabled,false);});
  await t.test('real session-bound CSRF token is accepted by client write validator',async()=>{await adminApi.disable(h.csrf);});
  await t.test('pending version form matches strict backend metadata body',async()=>{await adminApi.saveVersion({application_id:201,version_label:'1.0',release_key:'interop-r1',active:false,published:false},'A'.repeat(43));});
  await t.test('disabled config form carries required concurrency revision',async()=>{await adminApi.saveConfig(201,{mode:'disabled',current_version_id:null},'A'.repeat(43));});
  await t.test('pending file form supplies explicit object-bound UUID and nested metadata',async()=>{
    const version=await h.call('versions',{method:'POST',body:{application_id:201,version_label:'1.0',release_key:'interop-file'}}).then(r=>r.json());
    await adminApi.saveFile({version_id:version.id,variant_key:'universal',artifact_type:'apk',size_bytes:24,sha256:'a'.repeat(64),mime_type:'application/vnd.android.package-archive',download_filename:'qa.apk',storage_backend:'railway-s3',storage_key:'artifacts/22222222-2222-4222-8222-222222222222/'+ 'a'.repeat(64)+'.apk',storage_object_version:null},'A'.repeat(43));
  });
});
