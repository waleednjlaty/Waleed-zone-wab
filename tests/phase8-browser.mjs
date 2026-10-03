/** Adversarial stored/reflected input on real local HTTPS routes. External traffic is blocked. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const config=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8')),base=config.base;
assert.equal(new URL(base).hostname,'127.0.0.1');
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
let checks=0;
try {
 for(const width of [360,768,1440]) {
  const context=await browser.newContext({viewport:{width,height:960},ignoreHTTPSErrors:true});
  const [name,value]=config.ownerCookie.split('=');
  await context.addCookies([{name,value,url:base,secure:true,httpOnly:true,sameSite:'Lax'}]);
  const external=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();external.push(route.request().url());return route.abort();});
  const session=await context.request.get(base+'/api/admin/session').then(r=>r.json());
  const headers={Origin:base,'X-CSRF-Token':session.csrf_token};
  const payload='<script>window.PHASE8_XSS=1</script><img src=x onerror="window.PHASE8_XSS=2"><svg onload="window.PHASE8_XSS=3"></svg>';
  const metadata={name:'Phase8 XSS '+width,description:payload,version:'1',size:'24 B',category:'أدوات',platform:'Android',developer:"'; DROP TABLE applications; --",image_url:null};
  const created=await context.request.post(base+'/api/admin/catalog',{headers,data:{metadata}});
  assert.equal(created.status(),200);const row=await created.json();
  const published=await context.request.patch(base+'/api/admin/catalog/'+row.id,{headers,data:{expected_revision:row.revision,action:'publish'}});
  assert.equal(published.status(),200);
  for(const image_url of ['javascript:alert(1)','data:text/html,'+payload,'https://127.0.0.1/x','https://example.test/x\r\nInjected: yes']) {
   const rejected=await context.request.post(base+'/api/admin/catalog',{headers,data:{metadata:{...metadata,image_url}}});assert.equal(rejected.status(),400);checks++;
  }
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const response=await page.goto(base+'/apps/fixture-'+row.id);
  assert.equal(response.status(),200);
  await page.getByRole('heading',{name:metadata.name,exact:true}).waitFor();
  assert.ok((await page.locator('main').innerText()).includes(payload));
  assert.equal(await page.evaluate(()=>window.PHASE8_XSS),undefined);
  assert.equal(await page.locator('main script:not([type="application/ld+json"]),main [onerror],main [onload]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);checks+=4;
  await page.goto(base+'/?q='+encodeURIComponent(payload));
  await page.locator('main').first().waitFor();
  assert.equal(await page.evaluate(()=>window.PHASE8_XSS),undefined);assert.deepEqual(errors,[]);checks++;
  assert.deepEqual(external,[]);
  await context.close();
  // Separate fresh browser: registration must not revoke the fixture owner's session.
  const auth=await browser.newContext({viewport:{width,height:960},ignoreHTTPSErrors:true});
  await auth.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const registered=await auth.request.post(base+'/api/auth/register',{headers:{Origin:base},data:{name:'QA browser auth',email:`browser-${width}-${Date.now()}@example.test`,password:'QA-browser-password-123'}});
  assert.equal(registered.status(),200);
  assert.ok((await auth.cookies()).some(c=>c.name==='__Host-wz_session'&&c.secure&&c.httpOnly));
  const account=await auth.newPage();assert.equal((await account.goto(base+'/account')).status(),200);
  assert.equal((await auth.request.post(base+'/api/auth/logout',{headers:{Origin:base},data:{}})).status(),200);
  assert.ok(!(await auth.cookies()).some(c=>c.name==='__Host-wz_session'));
  await account.goto(base+'/account');assert.equal(new URL(account.url()).pathname,'/login');
  checks+=4;await auth.close();
 }
 console.log(`Phase 8 adversarial browser: ${checks} checks passed at 360/768/1440; no payload execution or external traffic.`);
}finally{await browser.close();}
