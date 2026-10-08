/** Anonymous, read-only production canary. No downloads redeemed or accounts changed. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const base='https://waleed-zone.up.railway.app';
assert.ok(process.env.WZ_BROWSER_MODULE,'Browser tooling required.');
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
mkdirSync('tests/screenshots',{recursive:true});
let checks=0;
try {
 for(const width of [360,768,1440]) {
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',()=>errors.push('PAGE_ERROR'));
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const resource=message.location().url;
    if(resource && ['/admin','/not-a-page'].includes(new URL(resource,base).pathname) && /server responded with a status of 404/.test(message.text()))return;
    errors.push('CONSOLE_ERROR');
  });
  const home=await page.goto(base+'/');
  assert.equal(home.status(),200);
  assert.equal(await page.locator('html').getAttribute('lang'),'ar');
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  const category=await page.locator('main a[href^="/category/"]').first().getAttribute('href');
  await page.goto(base+'/apps');
  const app=await page.locator('main a[href^="/apps/"]').first().getAttribute('href');
  await page.goto(base+'/games');
  const game=await page.locator('main a[href^="/games/"]').first().getAttribute('href');
  for(const path of [category,app,game]) {
    assert.ok(path && path.startsWith('/'));
    assert.equal(new URL(path,base).origin,base);
  }
  await page.goto(base+'/');
  await page.locator('.language-switcher:not([disabled])').waitFor();
  await page.getByRole('button',{name:'التبديل إلى الإنجليزية'}).press('Enter');
  await page.getByRole('heading',{name:/^Waleed Zone — Apps & Games/}).waitFor();
  const preference=(await context.cookies()).find(cookie=>cookie.name==='wz_locale');
  assert.equal(preference.value,'en');assert.equal(preference.path,'/');
  assert.equal(preference.sameSite,'Lax');assert.equal(preference.secure,true);
  await page.reload();await page.getByRole('button',{name:'Switch to Arabic'}).waitFor();
  const routes=['/','/apps','/games','/?q=WhatsApp',category,app,game,'/download/60','/download/54','/login','/register','/account','/about','/privacy','/terms','/copyright','/contact','/admin','/not-a-page'];
  for(const locale of ['en','ar']) {
    if(locale==='ar') {
      await page.goto(base+'/');await page.locator('.language-switcher:not([disabled])').waitFor();
      await page.getByRole('button',{name:'Switch to Arabic'}).press('Enter');
      await page.getByRole('button',{name:'التبديل إلى الإنجليزية'}).waitFor();
      await page.reload();
      assert.equal((await context.cookies()).find(cookie=>cookie.name==='wz_locale').value,'ar');
    }
    for(const route of routes) {
      const response=await page.goto(base+route);
      assert.equal(response.status(),['/not-a-page','/admin'].includes(route)?404:200,locale+' '+width+' '+route);
      await page.locator('.language-switcher:not([disabled])').waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'),locale);
      assert.equal(await page.locator('html').getAttribute('dir'),locale==='en'?'ltr':'rtl');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow');
      assert.equal(await page.locator('[data-nextjs-dialog]').count(),0);
      assert.equal(await page.locator('script[src*="pagead2.googlesyndication.com"]').count(),0,'ads must remain disabled');
      if(route==='/account')assert.equal(new URL(page.url()).pathname,'/login','anonymous account access denied');
      if(locale==='en' && ['/about','/privacy','/terms','/copyright','/contact','/login','/register'].includes(route)) {
        assert.equal(/[\u0600-\u06ff]/.test(await page.locator('#main-content').innerText()),false,'mixed static English UI');
      }
      if(route==='/login'||route==='/register')assert.equal(await page.getByLabel(locale==='en'?'Email':'البريد الإلكتروني',{exact:true}).count(),1);
      if(route==='/')assert.equal(await page.getByLabel(locale==='en'?'Search for an app or game':'ابحث عن تطبيق أو لعبة',{exact:true}).count(),1);
      if(route==='/'||route==='/privacy')await page.screenshot({path:'tests/screenshots/production-'+locale+'-'+width+'-'+(route==='/'?'home':'privacy')+'.png',fullPage:true});
      checks++;
    }
  }
  const search=await context.request.get(base+'/api/search?q=WhatsApp');
  assert.equal(search.status(),200);assert.ok(Array.isArray((await search.json()).items));
  for(const route of ['/api/admin/analytics','/api/admin/catalog','/api/admin/downloads/status']) {
    const response=await context.request.get(base+route);
    assert.ok([401,403].includes(response.status()),'anonymous API access denied');
  }
  assert.deepEqual(errors,[],'production JavaScript or console error');
  await context.close();
 }
 console.log('Production read-only bilingual canary passed: '+checks+' routes at 360/768/1440; switch, refresh, search and anonymous Admin denial verified.');
} finally {await browser.close();}
