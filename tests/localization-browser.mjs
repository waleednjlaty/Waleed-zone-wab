/** Real server rendering, cookie persistence and owner UI on a disposable HTTPS catalog. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const config=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8')),base=config.base;
assert.equal(new URL(base).hostname,'127.0.0.1');
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
const routes=['/','/apps','/games','/?q=WhatsApp','/category/'+encodeURIComponent('تواصل'),'/apps/whatsapp-201','/games/grand-theft-auto-208','/download/501','/download/210','/login','/register','/account','/about','/privacy','/terms','/copyright','/contact','/admin','/not-a-page'];
let checks=0;mkdirSync('tests/screenshots',{recursive:true});
try{
 for(const width of [360,768,1440]){
  const context=await browser.newContext({viewport:{width,height:960},ignoreHTTPSErrors:true,reducedMotion:'reduce'});
  const [name,value]=config.ownerCookie.split('=');await context.addCookies([{name,value,url:base,secure:true,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:200,body:''}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');assert.equal(await page.locator('html').getAttribute('lang'),'ar');assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  const favorite=await context.request.post(base+'/api/favorites',{headers:{Origin:base},data:{appId:201}});assert.equal(favorite.status(),200);
  // Use the visible control through keyboard, then verify cookie and fresh server content.
  await page.locator('.language-switcher:not([disabled])').waitFor();
  await page.getByRole('button',{name:'التبديل إلى الإنجليزية'}).press('Enter');
  try { await page.getByRole('heading',{name:/^Waleed Zone — Apps & Games/}).waitFor(); }
  catch(error){
    console.log('Locale switch diagnostics',JSON.stringify({width,lang:await page.locator('html').getAttribute('lang'),dir:await page.locator('html').getAttribute('dir'),headings:await page.locator('h1').allTextContents(),localeCookie:(await context.cookies()).find(c=>c.name==='wz_locale')?.value,englishControl:await page.getByRole('button',{name:'Switch to Arabic'}).count(),errors}));
    await page.screenshot({path:`tests/screenshots/i18n-switch-failure-${width}.png`,fullPage:true});throw error;
  }
  const preference=(await context.cookies()).find(c=>c.name==='wz_locale');assert.equal(preference.value,'en');assert.equal(preference.path,'/');assert.equal(preference.sameSite,'Lax');assert.equal(preference.secure,true);
  assert.equal((await context.cookies()).find(c=>c.name===name)?.value,value,'session preserved by switch');
  await page.reload();await page.getByRole('button',{name:'Switch to Arabic'}).waitFor();
  assert.ok((await context.request.get(base+'/account').then(r=>r.text())).includes('WhatsApp'),'saved favorite preserved after English switch/reload');
  for(const locale of ['en','ar']){
   if(locale==='ar'){
    await page.getByRole('button',{name:'Switch to Arabic'}).click();await page.getByRole('button',{name:'التبديل إلى الإنجليزية'}).waitFor();await page.reload();
   }
   assert.ok((await context.request.get(base+'/account').then(r=>r.text())).includes('WhatsApp'),'saved favorite preserved in '+locale);
   for(const route of routes){
    const response=await page.goto(base+route);assert.equal(response.status(),route==='/not-a-page'?404:200,`${locale} ${width} ${route}`);
    await page.locator('.language-switcher:not([disabled])').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),locale);assert.equal(await page.locator('html').getAttribute('dir'),locale==='en'?'ltr':'rtl');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow ${locale} ${width} ${route}`);
    assert.equal(await page.locator('[data-nextjs-dialog]').count(),0);checks++;
    if(locale==='en'&&['/about','/privacy','/terms','/copyright','/contact','/login','/register','/admin'].includes(route)){
      const text=await page.locator('#main-content').innerText();assert.ok(!/[\u0600-\u06ff]/.test(text),`mixed static UI ${route}: ${text}`);
    }
    if(route==='/login'||route==='/register')assert.equal(await page.getByLabel(locale==='en'?'Email':'البريد الإلكتروني',{exact:true}).count(),1);
    if(route==='/')assert.equal(await page.getByLabel(locale==='en'?'Search for an app or game':'ابحث عن تطبيق أو لعبة',{exact:true}).count(),1);
    if(route==='/admin'){
      for(const section of ['applications','configuration','versions','files','analytics','monetization','system','kill-switch']){
        await page.locator(`nav a[href="#${section}"]`).click();await page.waitForTimeout(150);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`admin ${section} ${locale} ${width}`);
        if(locale==='en')assert.ok(!/[\u0600-\u06ff]/.test(await page.locator('#main-content h2').innerText()));
      }
    }
    if(route==='/download/501'||route==='/download/210'){
      await page.getByRole('button',{name:locale==='en'?'Prepare download link':'تجهيز رابط التحميل',exact:true}).click();await page.getByRole('timer').waitFor();
      assert.equal(await page.locator('[data-download-state]').getAttribute('data-download-state'),'COUNTDOWN');
      assert.equal(await page.getByRole('progressbar',{name:locale==='en'?'Link preparation progress':'تقدم تجهيز الرابط'}).count(),1);
      assert.equal(await page.locator('.skeleton').count(),0);
    }
    if(['/','/apps/whatsapp-201','/privacy','/admin'].includes(route))await page.screenshot({path:`tests/screenshots/i18n-${locale}-${width}-${route.replace(/\W/g,'')||'home'}.png`,fullPage:true});
   }
   assert.equal((await context.cookies()).find(c=>c.name===name)?.value,value);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(`Bilingual browser matrix passed: ${checks} routes at 360/768/1440 plus keyboard, cookie, refresh, owner and countdown checks.`);
}finally{await browser.close();}
