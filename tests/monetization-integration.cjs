'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const config=process.env.WZ_TEST_CONFIG?JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8')):null;
const run=(name,fn)=>test(name,{skip:!config},fn);
const get=(path,cookie)=>fetch(config.base+path,{redirect:'manual',headers:{...(cookie?{cookie}:{}),'User-Agent':'Googlebot'}});
run('trust pages are accessible, distinct, self-canonical, noindex and advertising-free',async()=>{
 for(const path of ['/terms','/copyright','/contact','/privacy']){
  const response=await get(path);assert.equal(response.status,200,path);const html=await response.text();assert.match(html,/<h1\b/);assert.match(html,/name="robots" content="noindex, follow"/);assert.ok(html.includes(`rel="canonical" href="${config.base+path}"`));assert.ok(!html.includes('adsbygoogle.js'));assert.ok(!response.headers.get('content-security-policy').includes('googlesyndication'));
  for(const link of ['/about','/privacy','/terms','/copyright','/contact'])assert.ok(html.includes(`href="${link}"`));assert.ok(!html.includes('الشروط — قريبًا'));
 }
 const contact=await(await get('/contact')).text();assert.ok(contact.includes('mailto:contact@example.test'));assert.ok(!contact.includes('owner-qa@example.test'));
 const sitemap=await(await get('/sitemap.xml')).text();for(const path of ['/terms','/privacy','/copyright','/contact'])assert.ok(!sitemap.includes(`<loc>${config.base+path}</loc>`));
});
run('actual analytics API denies anonymous/non-owner and bounds owner windows',async()=>{
 assert.equal((await get('/api/admin/analytics')).status,401);assert.equal((await get('/api/admin/analytics',config.userCookie)).status,403);
 assert.equal((await get('/api/admin/analytics?days=91',config.ownerCookie)).status,400);
 const response=await get('/api/admin/analytics?days=30&limit=10',config.ownerCookie);assert.equal(response.status,200);const value=await response.json();assert.equal(value.days,30);assert.ok(value.top.length<=10);assert.ok(value.metrics.detail_view>=0);assert.match(response.headers.get('cache-control'),/no-store/);
});
run('all-gates-on fixtures still omit SDK from blocked/unreviewed details and forbidden routes',async()=>{
 for(const path of ['/apps/monetization-blocked-502','/apps/monetization-unreviewed-503','/download/201','/admin','/account','/login','/register','/search','/api/search?q=Telegram','/missing-page','/apps/not-found-2147483647']){
  const response=await get(path,path==='/admin'?config.ownerCookie:undefined),body=await response.text();assert.ok(!body.includes('<script src="https://pagead2.googlesyndication.com'),path);assert.ok(!body.includes('class="adsbygoogle"'),path);
 }
});
