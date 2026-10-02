'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { deniedAdminHtml } = require('./admin/denial.cjs');
const enabled = Boolean(process.env.WZ_TEST_CONFIG);
const config = enabled ? JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8')) : {};
if(enabled) assert.equal(new URL(config.base).hostname,'127.0.0.1','Only literal-loopback disposable fixtures are allowed.');
const strict = process.env.WZ_ADMIN_CONTRACT_STRICT === '1';
const hasAdmin = existsSync(path.join(__dirname,'../src/app/admin/page.tsx'));
const integration = (name,fn,skip=false) => test(name,{skip:!enabled || skip},fn);
const fetchLocal = (route, options={}) => {
  const url=new URL(route,config.base);assert.equal(url.origin,config.base,'External requests forbidden.');
  return fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000),...options});
};
const sentinels = () => [...(config.secrets||[]),config.statsToken,config.ownerCookie?.split('=')[1],config.userCookie?.split('=')[1]].filter(Boolean);
function noSecrets(text) {
  for(const secret of sentinels())assert.ok(!text.includes(secret),'Fixture credential leaked');
  assert.ok(!/X-Amz-(?:Signature|Credential|Security-Token)|QA_SIGNATURE_SENTINEL|postgres(?:ql)?:\/\//i.test(text),'Storage/database credential leaked');
}
integration('strict Admin presence gate (absent implementation is never certification)', () => {
  if(strict)assert.ok(hasAdmin,'BLOCKED: Agent Q /admin implementation is not integrated.');
  else if(!hasAdmin)console.log('Admin owner/browser acceptance BLOCKED: /admin is absent; set WZ_ADMIN_CONTRACT_STRICT=1 for release.');
});
for(const [actor,cookie] of [['anonymous',''],['non-owner',config.userCookie],['expired owner',config.expiredCookie],['forged owner','__Host-wz_session=forged']]) integration(`Admin HTML denies ${actor} without data leakage`,async()=>{
  const r=await fetchLocal('/admin',{headers:cookie?{Cookie:cookie}:{}}),html=await r.text();
  deniedAdminHtml(r.status,html);assert.match(r.headers.get('x-robots-tag')||'',/noindex/);assert.match(r.headers.get('cache-control')||'',/no-store/);
  noSecrets(html);assert.ok(!/PRIVATE DRAFT SECRET|owner-qa@example\.test|visitor-qa@example\.test/.test(html));
});
integration('real owner can access nonindexable Admin HTML',async()=>{
  const r=await fetchLocal('/admin',{headers:{Cookie:config.ownerCookie}});
  assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag')||'',/noindex/);assert.match(r.headers.get('cache-control')||'',/no-store/);noSecrets(await r.text());
},!hasAdmin);
for(const route of ['/', '/?q=واتساب', '/apps/whatsapp-201','/games/clash-of-clans-207','/download/201','/login']) integration(`public HTML unchanged/no credentials: ${route}`,async()=>{
  const r=await fetchLocal(route);assert.equal(r.status,200);const html=await r.text();noSecrets(html);
  assert.ok(!html.includes('PRIVATE DRAFT SECRET'));assert.ok(!html.includes('INACTIVE PRIVATE'));
  assert.ok(!/storage_key|storage_object_version|password_hash|token_hash/.test(html));
  if(route.startsWith('/download')) {assert.ok(!html.includes('action="/api/downloads/redeem"'));assert.ok(html.includes('التحميل المباشر غير متاح حاليًا'));}
});
integration('account redirects anonymous and remains usable for ordinary user/owner',async()=>{
  const r=await fetchLocal('/account');assert.equal(r.status,307);assert.equal(r.headers.get('location'),'/login');noSecrets(await r.text());
  for(const cookie of [config.userCookie,config.ownerCookie]){const account=await fetchLocal('/account',{headers:{Cookie:cookie}});assert.equal(account.status,200);noSecrets(await account.text());}
});
integration('sitemap omits entire Admin/API/private/download surface and private catalog',async()=>{
  const r=await fetchLocal('/sitemap.xml');assert.equal(r.status,200);const xml=await r.text();noSecrets(xml);
  const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);assert.ok(urls.length>=6);
  for(const url of urls)assert.ok(!/\/admin(?:\/|$)|\/api\/|\/account|\/download|\/login|private-draft|inactive-private/.test(url),url);
});
integration('public search still matches bilingual catalog without private records',async()=>{
  for(const q of ['WhatsApp','واتساب']) {const r=await fetchLocal('/api/search?q='+encodeURIComponent(q));assert.equal(r.status,200);const text=await r.text();noSecrets(text);assert.ok(text.includes('WhatsApp'));assert.ok(!/PRIVATE DRAFT|INACTIVE PRIVATE|storage_key/.test(text));}
});
integration('compiled client JavaScript exposes no provider credentials, signed URLs or fixture secrets',async()=>{
  const files=[];
  function walk(folder){for(const e of readdirSync(folder,{withFileTypes:true})){const p=path.join(folder,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.js'))files.push(p);}}
  walk(path.join(__dirname,'../.next/static'));assert.ok(files.length);
  for(const file of files){const text=readFileSync(file,'utf8');noSecrets(text);assert.ok(!/AWS_SECRET_ACCESS_KEY|DOWNLOAD_STORAGE_SECRET_ACCESS_KEY|WEBSITE_STATS_TOKEN|OWNER_USER_ID|@aws-sdk\/client-s3/.test(text),path.relative(__dirname,file));}
});
module.exports = { noSecrets, fetchLocal };
