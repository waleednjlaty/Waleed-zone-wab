/** Local-only browser regression; network routes reject every external request. */
import assert from 'node:assert/strict';
import { readFileSync,existsSync,mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import denial from './admin/denial.cjs';
const config=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8'));
assert.equal(new URL(config.base).hostname,'127.0.0.1','Only disposable literal-loopback fixtures are allowed.');
assert.ok(process.env.WZ_BROWSER_MODULE,'Set WZ_BROWSER_MODULE to an isolated Playwright index.mjs.');
const { chromium }=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
const hasAdmin=existsSync('src/app/admin/page.tsx');
const strict=process.env.WZ_ADMIN_CONTRACT_STRICT==='1';
const secrets=[...(config.secrets||[]),config.statsToken,config.ownerCookie.split('=')[1],config.userCookie.split('=')[1]];
let checks=0,blocked=0;
async function cookie(context,header) {
  await context.clearCookies();
  if(header){const i=header.indexOf('=');await context.addCookies([{name:header.slice(0,i),value:header.slice(i+1),domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax',secure:true}]);}
}
async function inspect(page,errors,label) {
  await page.locator('main').first().waitFor();
  await page.locator('main [aria-busy="true"]').first().waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Horizontal overflow: ${label}`);
  const html=await page.content();for(const secret of secrets)assert.ok(!html.includes(secret),`Credential in HTML: ${label}`);
  assert.ok(!/X-Amz-(Signature|Credential|Security-Token)|storage_object_version|password_hash|token_hash/.test(html),label);
  assert.deepEqual(errors,[],`Runtime/console errors: ${label}`);
  if(process.env.WZ_ADMIN_SCREENSHOT_DIR){mkdirSync(process.env.WZ_ADMIN_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.WZ_ADMIN_SCREENSHOT_DIR,label.replace(/[^a-zA-Z0-9]+/g,'-')+'.png'),fullPage:true});}
  checks++;
}
try {
  for(const width of [360,768,1440]) {
    const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:config.fixture==='native-postgresql-https'});
    const blockedRequests=[];
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===config.base)return route.continue();
      blockedRequests.push(url.origin);return route.abort('blockedbyclient');
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_BLOCKED_BY_CLIENT')&&!m.text().includes('404 (Not Found)'))errors.push(m.text());});
    try { await page.goto(config.base,{waitUntil:'domcontentloaded'}); } catch(e) { console.error('Browser diagnostics:',page.url(),errors,await page.content().catch(()=>''));throw e; }
    await page.locator('main .app-card:not([aria-hidden="true"])').first().waitFor();await inspect(page,errors,`${width} homepage`);
    await page.locator('.intro-search input[type="search"]').fill('واتساب');
    const result=page.locator('.search-suggestions').getByRole('link').filter({hasText:'WhatsApp'}).first();
    await result.waitFor();await inspect(page,errors,`${width} bilingual search`);
    await result.click();await page.waitForURL('**/apps/whatsapp-201');
    await page.getByRole('heading',{name:'WhatsApp',exact:true}).waitFor();await inspect(page,errors,`${width} details`);
    await page.goto(config.base+'/download/201',{waitUntil:'domcontentloaded'});
    await page.getByText('التحميل المباشر غير متاح حاليًا',{exact:false}).first().waitFor();
    assert.equal(await page.locator('form[action="/api/downloads/redeem"]').count(),0);await inspect(page,errors,`${width} gated download`);
    await page.goto(config.base+'/login',{waitUntil:'domcontentloaded'});
    assert.ok(await page.locator('input[type="email"]').count());assert.ok(await page.locator('input[type="password"]').count());
    await page.getByRole('button',{name:'فتح البحث',exact:true}).click();await page.locator('.search-dialog').waitFor();
    await page.keyboard.press('Escape');await page.locator('.search-dialog').waitFor({state:'hidden'});await inspect(page,errors,`${width} login/keyboard search`);
    await cookie(context,config.userCookie);
    await page.goto(config.base+'/account',{waitUntil:'domcontentloaded'});assert.equal(new URL(page.url()).pathname,'/account');await inspect(page,errors,`${width} ordinary account`);
    for(const [actor,header] of [['anonymous',''],['non-owner',config.userCookie],['forged','__Host-wz_session=forged']]) {
      await cookie(context,header);const r=await page.goto(config.base+'/admin',{waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:/الصفحة مو موجودة|This page could not be found\./}).waitFor();
      denial.deniedAdminHtml(r.status(),await page.content());assert.match(r.headers()['x-robots-tag']||'',/noindex/);
      assert.ok(!(await page.content()).includes('PRIVATE DRAFT SECRET'));await inspect(page,errors,`${width} Admin denied ${actor}`);
    }
    if(hasAdmin) {
      await cookie(context,config.ownerCookie);const r=await page.goto(config.base+'/admin',{waitUntil:'domcontentloaded'});
      assert.equal(r.status(),200);assert.match(r.headers()['x-robots-tag']||'',/noindex/);await inspect(page,errors,`${width} owner Admin`);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement!==document.body),true,'Keyboard focus must reach a control.');
      const buttons=page.locator('main').first().getByRole('button');assert.ok(await buttons.count()>0,'Owner dashboard needs keyboard-operable controls.');
      if (!existsSync('src/app/api/admin')) {
        await page.getByText('حالة النظام غير متاحة',{exact:true}).waitFor();
        // No backend: do not count unlocked mutation controls as readiness.
        assert.equal(await page.locator('main button[type="submit"]:enabled').count(),0);
      }
      if(process.env.WZ_ADMIN_SCREENSHOT_DIR){mkdirSync(process.env.WZ_ADMIN_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.WZ_ADMIN_SCREENSHOT_DIR,`admin-${width}.png`),fullPage:true});}
    } else blocked++;
    assert.deepEqual(blockedRequests,[],'Fixture unexpectedly attempted external traffic (requests were blocked).');
    await context.close();
  }
  console.log(`Admin/public browser: ${checks} flows passed at 360/768/1440; ${blocked} owner Admin flows blocked by absent UI.`);
  if(strict)assert.equal(blocked,0,'BLOCKED: Agent Q dashboard has not been integrated.');
} finally {await browser.close();}
