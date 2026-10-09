/** Real Website POST redemption, inline errors and attachment transport; finite provider fixtures. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {base}=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8'));
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.WZ_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
let checks=0;
try {
 for(const locale of ['ar','en'])for(const width of [360,768,1440]){
  const en=locale==='en',mobile=width===360;
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:960},acceptDownloads:true,
    ...(mobile?{isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'}:{})});
  await context.addCookies([{name:'wz_locale',value:locale,url:base,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[];let popups=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('popup',()=>popups++);
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(new URL(url).origin===base)return route.continue();
    assert.equal(url,'https://fafda.to/d/file-xyz?v=QA_BROWSER_SECRET');
    return route.fulfill({status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="qa-file.txt"'},body:'Authorized local browser fixture'});
  });
  const response=await page.goto(base+'/download/210');assert.equal(response.status(),200);
  const initial=await page.content();assert.ok(!initial.includes('fafda.to/d/')&&!initial.includes('QA_BROWSER_SECRET'));checks++;
  await page.getByRole('button',{name:en?'Prepare download link':'تجهيز رابط التحميل',exact:true}).click();await page.getByRole('timer').waitFor();
  assert.equal(await page.locator('.skeleton').count(),0);assert.equal(await page.getByRole('button',{name:en?/Start download/:/بدء التحميل/}).count(),0);checks++;
  await page.getByRole('button',{name:en?'Start download ↓':'بدء التحميل ↓',exact:true}).waitFor({timeout:26000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
  const fields=await page.locator('form').evaluate(form=>Object.fromEntries(new FormData(form)));
  // Explicit transient failure: the same page retains the eligible grant and offers retry.
  await page.route('**/api/downloads/legacy/redeem',async route=>{
    await page.unroute('**/api/downloads/legacy/redeem');
    await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'انتهت مهلة تجهيز المصدر. يمكنك إعادة المحاولة.'}})});
  });
  await page.getByRole('button',{name:en?'Start download ↓':'بدء التحميل ↓',exact:true}).click();
  await page.locator('[data-download-state="FAILED"]').waitFor();assert.equal(popups,0);assert.equal(page.url(),base+'/download/210');checks++;
  mkdirSync('tests/screenshots',{recursive:true});await page.screenshot({path:`tests/screenshots/steamrip-failed-${locale}-${width}.png`,fullPage:true});
  const responsePromise=page.waitForResponse(r=>r.url()===base+'/api/downloads/legacy/redeem');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:en?'Try again ↓':'إعادة المحاولة ↓',exact:true}).click();
  const redeemed=await responsePromise;assert.equal(redeemed.status(),200);assert.equal((await redeemed.json()).destination,'https://fafda.to/d/file-xyz?v=QA_BROWSER_SECRET');checks++;
  const download=await downloadPromise;assert.equal(download.suggestedFilename(),'qa-file.txt');assert.equal(await download.failure(),null);checks++;
  assert.equal(page.url(),base+'/download/210');assert.equal(popups,0);assert.equal(context.pages().length,1);
  await page.locator('[data-download-state="DOWNLOADING"]').waitFor();checks++;
  const replay=await context.request.post(base+'/api/downloads/legacy/redeem',{form:fields,headers:{Origin:base,'Sec-Fetch-Site':'same-origin'},maxRedirects:0});assert.equal(replay.status(),410);checks++;
  // One real mobile flow verifies the denied-provider screenshot has a visible same-tab exit.
  if(locale==='ar'&&width===360){
    await page.goto(base+'/download/210');
    assert.equal(await page.getByRole('link',{name:/فتح صفحة المصدر لإكمال التحميل/}).count(),0);checks++;
    await page.getByRole('button',{name:'تجهيز رابط التحميل',exact:true}).click();
    await page.getByRole('button',{name:'بدء التحميل ↓',exact:true}).waitFor({timeout:26000});
    await page.route('**/api/downloads/legacy/redeem',route=>route.fulfill({
      status:503,contentType:'application/json',body:JSON.stringify({error:{code:'PROVIDER_CHALLENGE',
        message:'المصدر يطلب تحققًا بشريًا مؤقتًا. أعد المحاولة لاحقًا.',source_url:'https://steamrip.com/qa-game/'}})
    }));
    await page.getByRole('button',{name:'بدء التحميل ↓',exact:true}).click();
    await page.locator('[data-download-state="FAILED"]').waitFor();
    const fallback=page.getByRole('link',{name:/فتح صفحة المصدر لإكمال التحميل/});
    await fallback.waitFor();
    assert.equal(await fallback.getAttribute('href'),'https://steamrip.com/qa-game/');
    const box=await fallback.boundingBox();assert.ok(box&&box.width>=250);
    assert.equal(await page.getByRole('button',{name:'إعادة المحاولة ↓'}).count(),0);
    assert.equal(page.url(),base+'/download/210');assert.equal(popups,0);
    checks+=4;
    await page.unroute('**/api/downloads/legacy/redeem');
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(`Inline download browser checks passed: ${checks} (ar/en; Android Chromium emulation/Desktop; no popups; POST, retry, attachment, replay)`);
}finally{await browser.close();}
