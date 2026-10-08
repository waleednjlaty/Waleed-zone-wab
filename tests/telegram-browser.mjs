/** Real TLS/HTTP owner forms and native Telegram 303; no mocked admin API. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import WebSocket from 'next/dist/compiled/ws/index.js';
const config=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8')),base=config.base;
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'https:');
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
// Observe/intercept EVERY native redirect hop via a separate local CDP session.
// Playwright route() only handles the first request in a redirect chain.
// The real application POST and 303 remain untouched; Telegram is a fixture.
const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const debugPort=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox',`--remote-debugging-port=${debugPort}`,'--remote-debugging-address=127.0.0.1'],...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
const {webSocketDebuggerUrl}=await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r=>r.json());
const socket=new WebSocket(webSocketDebuggerUrl);await new Promise(resolve=>socket.once('open',resolve));
let sequence=0,destinations=0,redirects=0;const pending=new Map();
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
 const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});
socket.on('message',async raw=>{
 const message=JSON.parse(raw.toString());
 if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p?.reject(message.error):p?.resolve(message.result);return;}
 if(message.method==='Target.attachedToTarget'){
  const target=message.params;
  if(target.targetInfo.type==='page'){
   await send('Fetch.enable',{patterns:[{urlPattern:'https://t.me/*',requestStage:'Request'},
    {urlPattern:base+'/api/downloads/legacy/redeem',requestStage:'Response'}]},target.sessionId);
  }
  await send('Runtime.runIfWaitingForDebugger',{},target.sessionId);
 }
 if(message.method==='Fetch.requestPaused'){
  const {request,requestId}=message.params;
  if(request.url===base+'/api/downloads/legacy/redeem'){
   assert.equal(message.params.responseStatusCode,200);
   assert.ok(message.params.responseHeaders.some(({name,value})=>name.toLowerCase()==='content-type'&&value.includes('application/json')));redirects++;
   const body=await send('Fetch.getResponseBody',{requestId},message.sessionId);
   assert.equal(JSON.parse(body.base64Encoded?Buffer.from(body.body,'base64').toString():body.body).destination,'https://t.me/files_channel/123');
   await send('Fetch.continueRequest',{requestId},message.sessionId);return;
  }
  assert.equal(request.url,'https://t.me/files_channel/123');assert.equal(request.method,'GET');
  assert.ok(!Object.keys(request.headers).some(name=>name.toLowerCase()==='referer'));
  destinations++;
  await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],
   body:Buffer.from('<h1>Telegram destination intercepted locally</h1>').toString('base64')},message.sessionId);
 }
});
await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
let checks=0;
mkdirSync('tests/screenshots',{recursive:true});
try{
 for(const width of [360,768,1440]){
  const context=await browser.newContext({viewport:{width,height:960},ignoreHTTPSErrors:true,reducedMotion:'reduce'});
  const [name,value]=config.ownerCookie.split('=');await context.addCookies([{name,value,url:base,secure:true,httpOnly:true,sameSite:'Lax'}]);
  const external=[],errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();external.push(u.href);return route.fulfill({contentType:'text/html',body:'<h1>Telegram destination intercepted locally</h1>'});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  context.on('request',request=>{if(request.url().endsWith('/legacy/redeem'))assert.equal(request.headers().origin,base);});
  await page.goto(base+'/admin');await page.getByRole('navigation',{name:'أقسام لوحة المالك'}).getByRole('link',{name:'التطبيقات'}).click();
  await page.getByRole('heading',{name:'إنشاء وتعديل التطبيقات والألعاب'}).waitFor();
  await page.getByLabel('الاسم',{exact:true}).fill('Shared QA '+width);
  await page.getByLabel('الوصف',{exact:true}).fill('Local browser catalog integration');
  await page.getByLabel('الإصدار',{exact:true}).fill('1.2');
  await page.getByLabel('الحجم',{exact:true}).fill('24 B');
  await page.getByLabel('النظام',{exact:true}).fill('Android');
  await page.getByLabel('التصنيف (مثال: ألعاب موبايل)',{exact:true}).fill('ألعاب موبايل');
  await page.getByRole('button',{name:'حفظ المسودة',exact:true}).click();
  await page.getByText('تم الحفظ وتأكيد الحالة من الخادم.',{exact:true}).waitFor();
  const text=await page.getByRole('group',{name:/بيانات التطبيق #/}).innerText();
  const id=Number(/بيانات التطبيق #(\d+)/.exec(text)?.[1]);assert.ok(id>0);
  const denied=await context.request.get(base+'/download/'+id);
  assert.ok([200,404].includes(denied.status()));assert.ok(!(await denied.text()).includes('تحميل Shared QA '+width));
  await page.getByLabel('رابط الرسالة',{exact:true}).fill('https://t.me/files_channel/123');
  await page.getByRole('button',{name:'حفظ مصدر الملف',exact:true}).click();
  await page.getByText('ملف مرتبط: @files_channel · رسالة 123',{exact:true}).waitFor();
  await page.getByRole('button',{name:'نشر',exact:true}).click();
  await page.getByText('الحالة: فعّال · منشور',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Admin overflow '+width);
  await page.screenshot({path:`tests/screenshots/telegram-admin-${width}.png`,fullPage:true});
  // Another authenticated writer changes the revision between read and save.
  const session=await context.request.get(base+'/api/admin/session').then(r=>r.json());
  const current=await context.request.get(base+'/api/admin/catalog/'+id).then(r=>r.json());
  const competing=await context.request.patch(base+'/api/admin/catalog/'+id,{headers:{Origin:base,'X-CSRF-Token':session.csrf_token},data:{expected_revision:current.revision,metadata:{name:'Competing QA '+width,description:'changed',version:'2',size:'24 B',category:'ألعاب موبايل',platform:'Android',developer:null,image_url:null}}});assert.equal(competing.status(),200);
  await page.getByLabel('الاسم',{exact:true}).fill('Stale editor');await page.getByRole('button',{name:'حفظ التعديل',exact:true}).click();
  await page.getByText('تعارض في التعديل: أُعيدت قراءة النسخة الحالية. راجعها ثم احفظ مجددًا.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('الاسم',{exact:true}).inputValue(),'Competing QA '+width);
  checks+=5;
  await page.goto(base+'/download/'+id);
  const initial=await page.content();assert.ok(!initial.includes('https://t.me/files_channel/123'));assert.ok(!initial.includes('telegram_file_id'));
  await page.getByRole('button',{name:'تجهيز رابط التحميل',exact:true}).click();
  await page.getByRole('timer').waitFor();assert.equal(await page.getByRole('button',{name:/تحميل الملف عبر Telegram/}).count(),0);
  await page.screenshot({path:`tests/screenshots/telegram-countdown-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'تحميل الملف عبر Telegram ↓',exact:true}).waitFor({timeout:25000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Download overflow '+width);
  let popups=0;page.on('popup',()=>popups++);
  const redeemResponse=page.waitForResponse(r=>r.url()===base+'/api/downloads/legacy/redeem');
  await page.getByRole('button',{name:'تحميل الملف عبر Telegram ↓',exact:true}).click();
  assert.equal((await redeemResponse).status(),200);
  await page.waitForURL('https://t.me/files_channel/123',{timeout:10000});
  assert.equal(popups,0);assert.equal(context.pages().length,1);
  assert.deepEqual(errors,[]);checks+=4;
  for(const route of ['/','/?q=WhatsApp','/apps/whatsapp-201','/login','/account']){const response=await page.goto(base+route);assert.ok([200,307].includes(response.status()));assert.equal(await page.locator('[data-nextjs-dialog]').count(),0);checks++;}
  await context.close();
 }
 assert.equal(destinations,3);
 assert.equal(redirects,3);
 console.log(`Telegram/catalog browser checks passed: ${checks} (360, 768, 1440; real APIs, atomic JSON redeem and exact same-tab destination)`);
}finally{await send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true});socket.close();await browser.close();}
