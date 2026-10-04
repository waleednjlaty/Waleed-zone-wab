/** Real production build + disposable DB only; no request reaches Google. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import postgres from 'postgres';
const fixtureDatabase=new URL(process.env.WZ_TEST_DATABASE_URL);assert.equal(fixtureDatabase.hostname,'127.0.0.1');assert.match(fixtureDatabase.pathname,/^\/wz_phase2_test(?:_[a-z0-9]+)?$/);
const fixtureSql=postgres(fixtureDatabase.href,{prepare:false,max:1});
const config=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8')),base=config.base;
assert.equal(new URL(base).hostname,'127.0.0.1');
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
mkdirSync('docs/screenshots/monetization',{recursive:true});
let checks=0;
try{
 for(const width of [360,768,1440]){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:960},reducedMotion:'reduce'}),errors=[];let ads=0;
  const [name,value]=config.ownerCookie.split('=');await context.addCookies([{name,value,url:base,secure:true,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='pagead2.googlesyndication.com'){ads++;return route.fulfill({headers:{'Access-Control-Allow-Origin':base},contentType:'text/javascript',body:'window.adsbygoogle=[];window.adsbygoogle.push=function(){window.__fixtureAdPush=(window.__fixtureAdPush||0)+1};'});}
   return u.origin===base?route.continue():route.fulfill({contentType:'text/plain',body:''});
  });
  await context.addInitScript(()=>{window.__tcfapi=(command,_version,cb)=>{if(command==='addEventListener')cb({cmpId:300,cmpStatus:'loaded',eventStatus:'tcloaded',tcString:'isolated-fixture-consent',purpose:{consents:{1:true,3:true,4:true}},vendor:{consents:{755:true}}},true);};});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource: the server responded with a status of 404'))errors.push(m.text());});
  const layout=async()=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow ${width} ${page.url()}`);assert.deepEqual(errors,[]);checks++;};
  const axe=async()=>{if(process.env.WZ_AXE_MODULE){await page.evaluate(source=>{const nonce=document.querySelector('script[nonce]')?.nonce;if(!nonce)throw Error('Test page nonce missing');const script=document.createElement('script');script.nonce=nonce;script.textContent=source;document.head.appendChild(script);},readFileSync(process.env.WZ_AXE_MODULE,'utf8'));const violations=await page.evaluate(async()=> (await window.axe.run('#main-content',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[],page.url());}};
  for(const path of ['/terms','/copyright','/contact','/privacy','/about']){
   const before=ads,response=await page.goto(base+path);assert.equal(response.status(),200);await page.getByRole('heading',{level:1}).waitFor();
   for(const href of ['/about','/privacy','/terms','/copyright','/contact'])assert.equal(await page.locator(`footer a[href="${href}"]`).count(),1);
   assert.equal(ads,before);assert.equal(await page.locator('ins.adsbygoogle').count(),0);await layout();await axe();
   await page.screenshot({path:`docs/screenshots/monetization/${path.slice(1)}-${width}.png`,fullPage:true});
  }
  await page.goto(base+'/admin#analytics');await page.getByRole('heading',{name:'تحليلات الموقع',exact:true}).waitFor();
  for(const days of ['1','7','30']){await page.getByLabel('الفترة (UTC)').selectOption(days);await page.getByText('الزوار (مجموع يومي)',{exact:true}).waitFor();await layout();}
  await axe();await page.screenshot({path:`docs/screenshots/monetization/analytics-${width}.png`,fullPage:true});
  await page.getByRole('navigation',{name:'أقسام لوحة المالك'}).getByRole('link',{name:/الربح والإعلانات/}).click();
  await page.getByRole('heading',{name:'مراجعة أهلية الإعلانات'}).waitFor();await page.getByRole('button',{name:/Monetization Eligible/}).waitFor();await layout();await axe();
  const excluded=['/apps/monetization-blocked-502','/apps/monetization-unreviewed-503','/download/501','/admin','/account','/login','/register','/search','/api/search?q=Telegram','/missing-page','/apps/not-found-2147483647'];
  for(const path of excluded){const before=ads;await page.goto(base+path);assert.equal(await page.locator('ins.adsbygoogle').count(),0,path);assert.equal(ads,before,path);if(!path.startsWith('/api/'))await layout();}
  await page.goto(base+'/apps/monetization-eligible-501');await page.getByRole('heading',{name:'Monetization Eligible',exact:true}).waitFor();
  await page.waitForFunction(()=>window.__fixtureAdPush===1);assert.equal(ads,1);assert.equal(await page.locator('script[src*="adsbygoogle.js"]').count(),1);assert.equal(await page.locator('ins.adsbygoogle').count(),1);
  assert.equal(await page.locator('.mobile-download-bar').count(),0);assert.equal(await page.locator('.detail-download-area .adsbygoogle').count(),0);
  const spacing=await page.evaluate(()=>{const ad=document.querySelector('.manual-ad-placement').getBoundingClientRect(),cta=document.querySelector('.detail-download-area').getBoundingClientRect();return ad.top-cta.bottom;});assert.ok(spacing>100,`Ad too close to CTA: ${spacing}`);await layout();await axe();
  await page.screenshot({path:`docs/screenshots/monetization/eligible-${width}.png`,fullPage:true});await context.close();
  // A real server-render failure in this explicitly disposable DB must not mount ads.
  const errorContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:960}});let errorAds=0;
  await errorContext.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(u.hostname.includes('googlesyndication'))errorAds++;return route.fulfill({body:''});});
  await errorContext.addInitScript(()=>{window.__tcfapi=(command,_version,cb)=>{if(command==='addEventListener')cb({cmpId:300,cmpStatus:'loaded',eventStatus:'tcloaded',tcString:'isolated-fixture-consent',purpose:{consents:{1:true,3:true,4:true}},vendor:{consents:{755:true}}},true);};});
  const errorPage=await errorContext.newPage();
  await fixtureSql.unsafe('ALTER TABLE applications RENAME TO qa_error_catalog');
  try{await errorPage.goto(base+'/apps/monetization-eligible-501');await errorPage.getByRole('heading',{name:'صار خطأ غير متوقع',exact:true}).waitFor();assert.equal(await errorPage.locator('ins.adsbygoogle,script[src*="adsbygoogle.js"]').count(),0);assert.equal(errorAds,0);assert.ok(await errorPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;}
  finally{await fixtureSql.unsafe('ALTER TABLE qa_error_catalog RENAME TO applications');await errorContext.close();}
 }
 console.log(`Monetization release browser: ${checks} checks PASS at 360/768/1440; trust links, legal pages, real owner analytics/reviews, eligible/blocked/unreviewed details, exclusions, accessibility, zero live Google traffic.`);
}finally{await browser.close();await fixtureSql.end();}
