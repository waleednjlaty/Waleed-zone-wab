/** Real Website countdown/redeem/JSON; native same-tab attachment via a finite browser file fixture. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {base}=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8'));
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.WZ_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
const folder=mkdtempSync(join(tmpdir(),'wz-browser-download-'));
let checks=0;
try {
 for(const locale of ['ar','en'])for(const width of [360,768,1440]){
  const en=locale==='en';
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:960},acceptDownloads:true,
   ...(width===360?{isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36'}:{})});
  await context.addCookies([{name:'wz_locale',value:locale,url:base,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[],posts=[];let finalCalls=0;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===base){
    if(url.pathname==='/api/downloads/legacy/redeem'){
     assert.equal(request.method(),'POST');assert.equal(request.headers().accept,'application/json');
     const response=await route.fetch({maxRedirects:0});assert.equal(response.status(),200);
     const data=await response.json();assert.equal(data.destination,'https://fafda.to/d/file-xyz?v=QA_BROWSER_SECRET');posts.push(request.postData());
     await new Promise(resolve=>setTimeout(resolve,400));return route.fulfill({response});
    }
    return route.continue();
   }
   assert.equal(url.href,'https://fafda.to/d/file-xyz?v=QA_BROWSER_SECRET');assert.equal(request.method(),'GET');
   assert.ok(!request.headers().referer);finalCalls++;
   return route.fulfill({status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename=wz-browser-canary.txt'},body:'Authorized browser fixture bytes.\n'});
  });
  const response=await page.goto(base+'/download/210');assert.equal(response.status(),200);
  const initial=await page.content();assert.ok(!initial.includes('fafda.to/d/')&&!initial.includes('QA_BROWSER_SECRET'));checks++;
  await page.getByRole('button',{name:en?'Prepare download link':'تجهيز رابط التحميل',exact:true}).click();await page.getByRole('timer').waitFor();
  assert.equal(await page.locator('.skeleton').count(),0);assert.equal(await page.getByRole('button',{name:en?'Start download ↓':'بدء التحميل ↓',exact:true}).count(),0);checks++;
  const button=page.getByRole('button',{name:en?'Start download ↓':'بدء التحميل ↓',exact:true});await button.waitFor({timeout:25000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
  const fields=await page.locator('form').evaluate(form=>Object.fromEntries(new FormData(form)));
  assert.equal(await page.locator('form').getAttribute('target'),null);
  const downloadPromise=page.waitForEvent('download');await button.evaluate(button=>{button.click();button.click();});
  await page.locator('[data-download-state="RESOLVING"]').waitFor();assert.equal(page.url(),base+'/download/210');
  const download=await downloadPromise;const saved=join(folder,`canary-${locale}-${width}.txt`);await download.saveAs(saved);
  assert.equal(readFileSync(saved,'utf8'),'Authorized browser fixture bytes.\n');assert.equal(await download.failure(),null);
  await page.locator('[data-download-state="DOWNLOADING"]').waitFor();assert.equal(page.url(),base+'/download/210');assert.equal(context.pages().length,1);assert.equal(posts.length,1);assert.equal(finalCalls,1);checks++;
  assert.ok(!(await page.content()).includes('QA_BROWSER_SECRET'));checks++;
  mkdirSync('tests/screenshots',{recursive:true});await page.screenshot({path:`tests/screenshots/bzzhr-downloading-${locale}-${width}.png`,fullPage:true});
  const replay=await context.request.post(base+'/api/downloads/legacy/redeem',{form:fields,headers:{Origin:base,'Sec-Fetch-Site':'same-origin'},maxRedirects:0});assert.equal(replay.status(),410);checks++;
  assert.deepEqual(errors,[]);await context.close();
 }
 // Lost response after a committed redeem: retry returns 410 and offers a fresh grant.
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:360,height:960},acceptDownloads:true});
 const page=await context.newPage();let dropped=false;
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,base);
  if(url.pathname==='/api/downloads/legacy/redeem'&&!dropped){
   const response=await route.fetch({maxRedirects:0});assert.equal(response.status(),200);dropped=true;return route.abort('failed');
  }
  return route.continue();
 });
 await page.goto(base+'/download/210');
 await page.getByRole('button',{name:'تجهيز رابط التحميل',exact:true}).click();
 const start=page.getByRole('button',{name:'بدء التحميل ↓',exact:true});await start.waitFor({timeout:25000});await start.click();
 await page.locator('[data-download-state="FAILED"]').waitFor();assert.equal(page.url(),base+'/download/210');checks++;
 await page.getByRole('button',{name:'إعادة المحاولة ↓',exact:true}).click();
 await page.getByRole('button',{name:'تجهيز رابط التحميل',exact:true}).waitFor();
 assert.equal(await page.locator('input[name="token"]').count(),0);assert.ok(!(await page.content()).includes('QA_BROWSER_SECRET'));assert.equal(context.pages().length,1);checks++;
 await context.close();
 console.log(`Provider browser checks passed: ${checks} (Arabic/English; 360/768/1440; Android emulation; same-tab attachment bytes; fixture upstream)`);
}finally{await browser.close();rmSync(folder,{recursive:true,force:true});}
