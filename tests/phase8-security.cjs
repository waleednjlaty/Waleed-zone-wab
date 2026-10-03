'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {readFileSync,readdirSync}=require('node:fs'),{createHmac,randomBytes}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
require('./helpers/typescript.cjs');require('./downloads/harness.cjs').blockExternalIO();
const load=Module._load;Module._load=function(n,...a){return n==='server-only'?{}:load.call(this,n,...a);};
const {downloadBody}=require('../src/lib/downloads/http.ts');
const {readJson}=require('../src/lib/auth.ts');
const {requestNetwork,consumeWindow}=require('../src/lib/security/limits.ts');
const {redact,redactText}=require('../src/lib/security/logging.ts');
const {contentSecurityPolicy}=require('../src/lib/security/csp.ts');
const {OwnerCatalogService}=require('../src/lib/admin/catalog.ts');
const {LegacyCountdown}=require('../src/lib/delivery/legacy.ts');
const {safeExternalUrl,safeJsonLd,sanitizeSearch}=require('../src/lib/utils.ts');
Module._load=load;
const origin='https://phase8.example.test',env={NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:origin,FILES_CHANNEL_USERNAME:'files_channel'};
const body=(raw,type='application/json')=>new Request(origin,{method:'POST',headers:{'content-type':type},body:raw});
for(const [name,raw,type,status] of [
 ['oversize','x'.repeat(4097),'application/json',413],['malformed JSON','{','application/json',400],
 ['array','[]','application/json',400],['null','null','application/json',400],
 ['content-type confusion','{}','application/json-evil',415],['form duplication','a=1&a=2','application/x-www-form-urlencoded',400],
 ['invalid UTF',new Uint8Array([123,34,120,34,58,34,255,34,125]),'application/json',400],
])test('bounded request: '+name,async()=>{
 await assert.rejects(downloadBody(body(raw,type),type==='application/x-www-form-urlencoded',4096),e=>e.status===status);
 if(type!=='application/x-www-form-urlencoded')assert.equal(await readJson(body(raw,type)),null);
});
test('prototype-like form keys are own properties without modifying the prototype',async()=>{
 const parsed=await downloadBody(body('__proto__=bad&constructor=evil','application/x-www-form-urlencoded'),true);
 assert.equal(Object.getPrototypeOf(parsed),Object.prototype);assert.equal(parsed.__proto__,'bad');assert.equal({}.polluted,undefined);
});
test('forwarding headers do not select auth/search/legacy limiter buckets without verified ingress',()=>{
 for(let i=1;i<=20;i++)assert.equal(requestNetwork(new Request(origin,{headers:{'x-forwarded-for':`203.0.113.${i}`,'x-real-ip':`203.0.113.${i}`}}),env),'shared');
 const verified={...env,DOWNLOAD_INGRESS_VERIFIED:'true',DOWNLOAD_TRUSTED_IP_HEADER:'x-ingress-ip',DOWNLOAD_IP_HASH_KEY:'a'.repeat(32)};
 const r=ip=>new Request(origin,{headers:{'x-ingress-ip':ip}});
 assert.equal(requestNetwork(r('2001:db8:1:2::1'),verified),requestNetwork(r('2001:db8:1:2::2'),verified));
 assert.throws(()=>requestNetwork(r('127.0.0.1,evil'),verified));
 assert.throws(()=>requestNetwork(r('127.0.0.1'),{...verified,DOWNLOAD_TRUSTED_IP_HEADER:'x-forwarded-for'}));
});
test('shared SQL limiter admits exactly capacity under concurrent requests and recovers after expiry',async t=>{
 const db=await PGlite.create();t.after(()=>db.close());await db.exec(readFileSync('migrations/003_runtime_security.sql','utf8'));
 const sql=(parts,...values)=>db.query(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values).then(r=>r.rows);
 const a=await Promise.all(Array.from({length:24},()=>consumeWindow(sql,'same-bucket',8,60)));
 assert.equal(a.filter(Boolean).length,8);assert.equal(a.filter(v=>!v).length,16);
 await db.exec("UPDATE site_rate_limits SET reset_at=NOW()-INTERVAL '1 second'");assert.equal(await consumeWindow(sql,'same-bucket',8,60),true);
 assert.equal((await db.query('SELECT max(hits) AS hits FROM site_rate_limits')).rows[0].hits,1);
 await db.exec('DROP TABLE site_rate_limits');await assert.rejects(consumeWindow(sql,'same-bucket',8,60));
});
test('CSP permits framework nonce and exact form hosts; blocks inline handlers and production eval',()=>{
 const p=contentSecurityPolicy('qaNonce',env,true);
 assert.match(p,/script-src 'self' 'nonce-qaNonce'/);assert.match(p,/script-src-attr 'none'/);
 assert.ok(!p.includes('unsafe-eval')&&!/script-src [^;]*unsafe-inline/.test(p));
 assert.match(p,/frame-ancestors 'none'/);assert.match(p,/form-action 'self' https:\/\/t.me/);
 assert.ok(!contentSecurityPolicy('qaNonce',env,false).match(/form-action[^;]*t.me/));
 assert.ok(!p.includes('api.telegram.org'));
});
for(const url of ['javascript:alert(1)','data:text/html,<script>bad</script>','data:image/svg+xml,<svg onload=bad>',
 'https://user:pass@i.ibb.co/p.png','https://api.telegram.org/file/botTOKEN/photo','https://i.ibb.co:444/x',
 'https://127.0.0.1/p','https://[::1]/p','https://localhost/p','https://i.ibb.co/\nfoo'])
 test('unsafe image URL denied: '+url,()=>assert.equal(safeExternalUrl(url),null));
test('JSON-LD cannot close its script and search input is bounded including bidi controls',()=>{
 assert.ok(!safeJsonLd({name:'</script><script>window.XSS=1</script>'}).includes('<'));
 assert.equal(sanitizeSearch('a'.repeat(100000)).length,100);assert.equal(sanitizeSearch('x\u202Ey\u0000'),'xy');
});
test('logs redact nested credentials, configured secrets, signed/file URLs, headers and exceptions',()=>{
 const sentinels={BOT_TOKEN:'QA_BOT_PRIVATE',DATABASE_URL:'postgres://qa:QA_PASSWORD@private/db',WEBSITE_STATS_TOKEN:'QA_STATS_SECRET',LEGACY_DOWNLOAD_SIGNING_KEY:'QA_SIGNING_SECRET',DOWNLOAD_STORAGE_SECRET_ACCESS_KEY:'QA_S3_SECRET'};
 const rendered=JSON.stringify(redact({Authorization:'Bearer secret',Cookie:'sid=secret',password:'secret',config:sentinels,
   detail:Object.values(sentinels).join(' '),error:new Error('https://api.telegram.org/file/botUNCONFIGURED/x.apk https://bucket.example/x?X-Amz-Signature=PRIVATE_SIGNATURE')},sentinels));
 for(const value of [...Object.values(sentinels),'UNCONFIGURED','PRIVATE_SIGNATURE','sid=secret','Bearer secret'])assert.ok(!rendered.includes(value),value);
 assert.ok(!redactText('Authorization: Bearer RAWSECRET\nCookie: a=PRIVATE; b=PRIVATE2').includes('PRIVATE2'));
 assert.ok(!redactText('"Cookie": "a=PRIVATE; b=PRIVATE2"').includes('PRIVATE2'));
});
test('signed null/invalid nonce/token replay behavior remains bounded by client/deadline/revision',()=>{
 let now=100000;const key='q'.repeat(32),c=new LegacyCountdown(key,()=>now),g=c.prepare(1,'rev','same');
 const sign=data=>{const e=Buffer.from(JSON.stringify(data)).toString('base64url');return e+'.'+createHmac('sha256',key).update('wz-legacy-v1:'+e).digest('base64url');};
 for(const data of [null,[],{}, {application_id:1,client:'bad',ready_at:120000,expires_at:300000,nonce:'x',revision:'rev'}])assert.throws(()=>c.redeem(sign(data),1,'rev','same'),e=>e.code==='INVALID_TOKEN');
 for(const token of ['', 'x'.repeat(1001),'a.b.c','a.!!!!'])assert.throws(()=>c.redeem(token,1,'rev','same'));
 now=119999;assert.throws(()=>c.redeem(g.token,1,'rev','same'),e=>e.status===425);
 now=120000;assert.doesNotThrow(()=>c.redeem(g.token,1,'rev','same'));
 assert.doesNotThrow(()=>c.redeem(g.token,1,'rev','same')); // intentional stateless retry, public Telegram object
 assert.throws(()=>c.redeem(g.token,1,'changed-source','same'));assert.throws(()=>c.redeem(g.token,1,'rev','other'));
 now=300000;assert.throws(()=>c.redeem(g.token,1,'rev','same'),e=>e.status===410);
});
test('owner metadata adversarial inputs cannot mass assign or smuggle unsafe image URLs',async t=>{
 const db=await PGlite.create();t.after(()=>db.close());await db.exec(`CREATE TABLE applications(id SERIAL PRIMARY KEY,name TEXT,description TEXT,version TEXT,size TEXT,category TEXT,platform TEXT,developer TEXT,image_url TEXT,active BOOLEAN,published BOOLEAN,downloads INT,views INT,created_at TIMESTAMPTZ,search_text TEXT)`);
 const sql=(parts,...values)=>db.query(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values).then(r=>r.rows);
 sql.begin=(_,fn)=>db.transaction(tx=>fn((parts,...values)=>tx.query(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values).then(r=>r.rows)));
 const service=new OwnerCatalogService(sql,env),m={name:'QA',description:null,version:null,size:null,category:null,platform:null,developer:null,image_url:null};
 for(const metadata of [{...m,published:true},{...m,__proto__:null,constructor:{polluted:true}}, {...m,name:'QA\r\nInjected: true'}, {...m,name:'QA\u202E'}, ...['javascript:bad','data:image/svg+xml,<svg>','https://localhost/x','https://api.telegram.org/file/botABC/p'].map(image_url=>({...m,image_url}))])
  await assert.rejects(service.write('catalog',{metadata},'owner'),e=>e.status===400);
 const row=await service.write('catalog',{metadata:{...m,name:"'; DROP TABLE applications; --",description:'<script>window.XSS=1</script><img onerror=bad>'}},'owner');
 assert.equal(row.published,false);assert.equal((await db.query('SELECT COUNT(*) AS n FROM applications')).rows[0].n,1);
});
test('server request code contains no schema creation or startup migrations',()=>{
 for(const folder of ['src/lib','src/app/api']){
  const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name]);
  for(const file of walk(folder).filter(f=>f.endsWith('.ts')))assert.ok(!/CREATE\s+(TABLE|INDEX|EXTENSION)|ALTER\s+TABLE/.test(readFileSync(file,'utf8')),file);
 }
});
test('slow request body is cancelled at deadline even after a syntactically complete prefix',{timeout:8000},async()=>{
 let cancelled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{}'));},cancel(){cancelled=true;}});
 const request=new Request(origin,{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'});
 await assert.rejects(downloadBody(request),e=>e.status===408);assert.equal(cancelled,true);
});
