/** Optional browser checks against the same disposable integration fixtures. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {base}=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8'));
assert.ok(process.env.WZ_BROWSER_MODULE,'Set WZ_BROWSER_MODULE to an isolated Playwright index.mjs.');
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser=await chromium.launch({headless:true,...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
let checks=0;
try {
 for(const width of [360,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  const pending=new Set();
  page.on('request',request=>pending.add(request.url()));
  page.on('requestfinished',request=>pending.delete(request.url()));
  page.on('requestfailed',request=>pending.delete(request.url()));
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  try {await page.goto(base,{waitUntil:'domcontentloaded'});} catch(error) {
   console.error('Navigation diagnostics:',{url:page.url(),pending:[...pending],errors});
   console.error('Rendered content:',await page.locator('body').innerText({timeout:2000}).catch(()=>'(no body)'));
   throw error;
  }
  await page.getByRole('heading',{level:1}).waitFor();
  await page.locator('main .app-card').first().waitFor();
  assert.ok(await page.locator('main .app-card').count()>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks++;
  await page.route('**/api/search?*',async route=>{
   await new Promise(resolve=>setTimeout(resolve,650));
   try {await route.continue();} catch {} // Superseded searches are intentionally cancelled.
  });
  const input=page.locator('.intro-search input[type="search"]');
  await input.fill('واتساب');
  const suggestion=page.locator('.search-suggestions');
  await suggestion.locator('.suggestion-loading').waitFor();
  assert.equal(await input.isEnabled(),true);
  assert.equal(await input.inputValue(),'واتساب');
  assert.equal(await suggestion.locator('.suggestion-loading [aria-hidden="true"]').count(),3);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await suggestion.locator('.suggestion-loading span').first().evaluate(node=>getComputedStyle(node).animationName),'none');
  await suggestion.getByRole('link').filter({hasText:'WhatsApp'}).first().waitFor();
  checks++;
  await input.fill('Telegram');
  await suggestion.locator('.suggestion-loading').waitFor();
  await input.fill('واتساب');
  await suggestion.getByRole('link').filter({hasText:'WhatsApp'}).first().waitFor();
  assert.ok(!(await suggestion.innerText()).includes('Telegram'));
  await suggestion.getByRole('link').filter({hasText:'WhatsApp'}).first().click();
  await page.waitForURL('**/apps/whatsapp-201');
  await page.getByRole('heading',{name:'WhatsApp',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // Agent A shows the sticky CTA only after the primary action scrolls offscreen.
  assert.equal(await page.locator('.mobile-download-bar').isVisible(),false);
  await page.locator('.detail-download').evaluate(node=>window.scrollTo(0,node.getBoundingClientRect().bottom+window.scrollY+20));
  if(width<1024)await page.locator('.mobile-download-bar').waitFor({state:'visible'});
  assert.equal(await page.locator('.mobile-download-bar').isVisible(),width<1024);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks++;
  await page.goto(`${base}/games/clash-of-clans-207`,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Clash of Clans',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks++;
  await page.goto(`${base}/?q=zzzzzzzzzz`,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'ما لقينا نتيجة مطابقة',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.goto(`${base}/privacy`,{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('main [aria-busy="true"]').count(),0);
  assert.deepEqual(errors,[]);
  checks++;
  await page.close();
 }
 console.log(`Browser integration: ${checks} flows passed at 360/768/1440px, normal/reduced motion, no console/runtime errors.`);
} finally {await browser.close();}
