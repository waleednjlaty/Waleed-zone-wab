const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const config=process.env.WZ_TEST_CONFIG?JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8')):null;
const run=(name,fn)=>test(name,{skip:!config},fn),base=config?.base;
const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
const headers=()=>({Origin:base,'Content-Type':'application/json'});
run('Phase8 actual response CSP nonces rotate and inline script is absent without nonce',async()=>{
 const nonces=[];
 for(const route of ['/','/login','/apps/whatsapp-201','/admin']){
  const response=await request(route,{headers:{Cookie:config.ownerCookie}}),html=await response.text(),policy=response.headers.get('content-security-policy');
  assert.equal(response.status,200);assert.ok(!policy.includes('unsafe-eval'));assert.ok(!/script-src [^;]*unsafe-inline/.test(policy));
  const nonce=/'nonce-([^']+)'/.exec(policy)?.[1];assert.ok(nonce);nonces.push(nonce);
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
   if(!match[1].includes('src=')&&match[2])assert.ok(match[1].includes(`nonce="${nonce}"`),route+': inline script lacks exact nonce');
  }
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cross-origin-opener-policy'),'same-origin');
 }
 assert.equal(new Set(nonces).size,nonces.length);
});
run('Phase8 auth session rotation invalidates previous browser token; logout invalidates latest',async()=>{
 const email=`rotation-${Date.now()}@example.test`,password='QA-only-12-plus-password';
 const registered=await request('/api/auth/register',{method:'POST',headers:headers(),body:JSON.stringify({name:'QA rotation',email,password})});assert.equal(registered.status,200);
 const old=registered.headers.get('set-cookie').split(';')[0];assert.match(old,/^__Host-wz_session=/);
 const login=await request('/api/auth/login',{method:'POST',headers:{...headers(),Cookie:old},body:JSON.stringify({email,password})});assert.equal(login.status,200);
 const latest=login.headers.get('set-cookie').split(';')[0];assert.notEqual(latest,old);
 assert.equal((await request('/account',{headers:{Cookie:old}})).status,307);assert.equal((await request('/account',{headers:{Cookie:latest}})).status,200);
 const logout=await request('/api/auth/logout',{method:'POST',headers:{...headers(),Cookie:latest},body:'{}'});
 assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Secure/i);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/i);
 assert.equal((await request('/account',{headers:{Cookie:latest}})).status,307);
});
run('Phase8 forged forwarding does not bypass auth identity throttles',async()=>{
 const email=`abuse-${Date.now()}@example.test`;
 for(let i=0;i<9;i++){
  const r=await request('/api/auth/login',{method:'POST',headers:{...headers(),'X-Forwarded-For':`203.0.113.${i+1}`,'X-Real-IP':`203.0.113.${i+1}`},body:JSON.stringify({email,password:'wrong-password'})});
  assert.equal(r.status,i<8?401:429);if(i===8)assert.equal(r.headers.get('retry-after'),'900');
 }
});
run('Phase8 public HTML/RSC/JSON no server credentials or source metadata',async()=>{
 const secrets=[...(config.secrets||[]),config.statsToken,config.ownerCookie.split('=')[1],config.userCookie.split('=')[1]];
 for(const path of ['/','/apps/whatsapp-201','/download/201','/login','/account','/admin','/api/search?q=WhatsApp']){
  for(const rsc of [false,true]){
   const response=await request(path,{headers:{Cookie:config.ownerCookie,...(rsc?{RSC:'1'}:{})}}),text=await response.text();
   for(const value of secrets)assert.ok(!text.includes(value),path);
   assert.ok(!/telegram_file_id|api\.telegram\.org\/file|postgres(?:ql)?:\/\//.test(text),path);
   if(path.includes('download'))assert.ok(!/telegram_message_id|https:\/\/t.me\/files_channel/.test(text));
  }
 }
});
run('Phase8 oversized and malformed auth streams/media fail without exposing internals',async()=>{
 for(const [body,type] of [['{','application/json'],['[]','application/json'],['{}','application/json-evil'],['x'.repeat(4097),'application/json']]){
  const r=await request('/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':type},body});assert.equal(r.status,400);
  assert.ok(!/stack|site_sessions|password_hash|postgres|DATABASE_URL/.test(await r.text()));
 }
});
