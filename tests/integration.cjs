const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const enabled=Boolean(process.env.WZ_TEST_CONFIG);
const config=enabled?JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8')):{};
if(enabled)assert.ok(['127.0.0.1','localhost'].includes(new URL(config.base).hostname),'Integration tests require an isolated local fixture server.');
const base=config.base;
const headers={'Content-Type':'application/json',Origin:base};
const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
const integration=(name,fn)=>test(name,{skip:!enabled},fn);
integration('private stats: anonymous, ordinary user, forged/expired cookie denied before data',async()=>{
 for(const [cookie,status] of [['',401],[config.userCookie,403],['__Host-wz_session=forged',401],[config.expiredCookie,401]]) {
  const response=await request('/api/stats',{headers:cookie?{Cookie:cookie}:{}});assert.equal(response.status,status);
  const data=await response.json();assert.deepEqual(Object.keys(data),['error']);assert.match(response.headers.get('cache-control'),/no-store/);
 }
});
integration('owner session and existing scoped owner automation can read statistics',async()=>{
 for(const h of [{Cookie:config.ownerCookie},{Authorization:`Bearer ${config.statsToken}`}]){const response=await request('/api/stats',{headers:h});assert.equal(response.status,200);assert.equal(typeof (await response.json()).applications,'number');}
 assert.equal((await request('/api/stats',{headers:{Authorization:'Bearer invalid'}})).status,401);
});
integration('all absent administrative pages and APIs disclose no private data',async()=>{
 // Admin now has its own owner/anonymous acceptance suite; it may be implemented.
 for(const route of ['users','dashboard','settings','database','debug','logs','uploads','private','manage','management'])for(const path of [`/${route}`,`/api/${route}`]) {
  const response=await request(path);assert.equal(response.status,404,path);
  const body=await response.text();assert.ok(!body.includes('owner-qa@example.test')&&!body.includes('password_hash')&&!body.includes('PRIVATE DRAFT SECRET'),path);
 }
 for(const path of ['/api/internal','/api/users/1','/admin/users','/users/1'])assert.equal((await request(path)).status,404,path);
});
integration('file exposure defenses and production source maps',async()=>{
 for(const path of ['/.env','/.env.local','/.git/config','/backup.sql','/logs/server.log','/database.sqlite','/next.config.js','/source.map','/_next/static/chunks/missing.js.map'])assert.equal((await request(path)).status,404,path);
});
integration('personal account requires a real session and sends no data before redirect',async()=>{
 const response=await request('/account');assert.equal(response.status,307);assert.equal(response.headers.get('location'),'/login');assert.ok(!(await response.text()).includes('QA owner'));
 for(const cookie of [config.ownerCookie,config.userCookie])assert.equal((await request('/account',{headers:{Cookie:cookie}})).status,200);
});
integration('favorites: direct unauthenticated request and cross-origin writes denied',async()=>{
 for(const method of ['POST','DELETE']){
  assert.equal((await request('/api/favorites',{method,headers,body:'{"appId":201}'})).status,401);
  assert.equal((await request('/api/favorites',{method,headers:{...headers,Cookie:config.userCookie,Origin:'https://evil.example'},body:'{"appId":201}'})).status,403);
 }
});
integration('favorites are bound to the session, not a supplied user ID',async()=>{
 const response=await request('/api/favorites',{method:'POST',headers:{...headers,Cookie:config.userCookie},body:JSON.stringify({appId:201,userId:'owner-qa'})});assert.equal(response.status,200);
 const user=await (await request('/account',{headers:{Cookie:config.userCookie}})).text(),owner=await (await request('/account',{headers:{Cookie:config.ownerCookie}})).text();
 assert.ok(user.includes('WhatsApp'));assert.ok(!owner.includes('WhatsApp'));
 assert.equal((await request('/api/favorites',{method:'POST',headers:{...headers,Cookie:config.userCookie},body:'{"appId":999}'})).status,404);
 assert.equal((await request('/api/favorites',{method:'DELETE',headers:{...headers,Cookie:config.userCookie},body:'{"appId":201}'})).status,200);
});
integration('registration ignores self-assigned owner role; stores usable hashed credentials',async()=>{
 const identity=`qa-${Date.now()}@example.test`,password='QA-only-password-123456',body=JSON.stringify({name:'QA Visitor',email:identity,password,role:'owner',id:'owner-qa'});
 const response=await request('/api/auth/register',{method:'POST',headers,body});assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Lax/i);
 const session=cookie.split(';')[0];assert.equal((await request('/api/stats',{headers:{Cookie:session}})).status,403);
 assert.equal((await request('/api/auth/logout',{method:'POST',headers:{...headers,Cookie:session}})).status,200);
 assert.equal((await request('/api/stats',{headers:{Cookie:session}})).status,401);
 assert.equal((await request('/api/auth/login',{method:'POST',headers,body:JSON.stringify({email:identity,password:'wrong-password'})})).status,401);
 assert.equal((await request('/api/auth/login',{method:'POST',headers,body:JSON.stringify({email:identity,password})})).status,200);
});
integration('auth writes enforce same origin and bounded JSON payloads',async()=>{
 for(const endpoint of ['login','register','logout'])assert.equal((await request(`/api/auth/${endpoint}`,{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
 assert.equal((await request('/api/auth/register',{method:'POST',headers,body:JSON.stringify({name:'x'.repeat(5000)})})).status,400);
});
const cases={201:['WhatsApp','واتساب','واتس اب','whatsap','واتس','واتسب'],202:['Telegram','تلغرام','تيليجرام','telegrm'],203:['Instagram','انستغرام','instgram'],204:['Spotify','سبوتيفاي','spotif'],205:['TikTok','تيك توك','tiktok'],206:['Facebook','فيسبوك','facebook']};
for(const [id,queries] of Object.entries(cases))for(const q of queries)integration(`API first-result ranking: ${q}`,async()=>{
 const response=await request(`/api/search?q=${encodeURIComponent(q)}`);assert.equal(response.status,200);const data=await response.json();assert.equal(data.items[0]?.id,Number(id));assert.ok(data.items.length<=8);
 for(const item of data.items)assert.deepEqual(Object.keys(item).sort(),['category','developer','href','id','imageUrl','name'].sort());
});
integration('empty/no-result search, published-only details and sitemap',async()=>{
 for(const q of ['', '---', 'zzzzzzzzzz', 'PRIVATE DRAFT SECRET', 'INACTIVE PRIVATE'])assert.deepEqual((await (await request(`/api/search?q=${encodeURIComponent(q)}`)).json()).items,[]);
 for(const id of [999,1000,9999999999])assert.equal((await request(`/app/${id}`)).status,404);
 const response=await request('/app/201');assert.equal(response.status,308);assert.ok(response.headers.get('location').endsWith('/apps/whatsapp-201'));
 const sitemap=await (await request('/sitemap.xml')).text();assert.ok(sitemap.includes('/apps/whatsapp-201'));assert.ok(sitemap.includes('/games/clash-of-clans-207'));
 assert.ok(!/\/account|\/users|\/admin|\/app\/|private-draft|inactive-private/.test(sitemap));
});
integration('per-app/game canonical metadata and truthful structured data',async()=>{
 for(const path of ['/apps/whatsapp-201','/games/clash-of-clans-207']) {
  const response=await request(path);assert.equal(response.status,200);const body=await response.text();assert.ok(body.includes(`${base}${path}`));assert.ok(body.includes('SoftwareApplication'));assert.ok(body.includes('BreadcrumbList'));assert.ok(!body.includes('priceCurrency'));assert.ok(!/>\s*(?:undefined|null|N\/A)\s*</.test(body.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'')));
 }
 assert.equal((await request('/apps/wrong-name-201')).status,308);
 assert.equal((await request('/games/whatsapp-201')).status,308);
});

integration('Arabic category URL and spoofed route context do not bypass guards',async()=>{
 assert.equal((await request('/category/'+encodeURIComponent('تواصل'))).status,200);
 const response=await request('/account',{headers:{'x-wz-route':'%2F'}});assert.equal(response.status,307);
});
