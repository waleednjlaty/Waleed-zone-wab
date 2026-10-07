/** Native POST/303 through real Website routes with finite provider fixtures. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import WebSocket from 'next/dist/compiled/ws/index.js';
const {base}=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8'));
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const browser=await chromium.launch({headless:true,executablePath:process.env.WZ_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${port}`]});
const {webSocketDebuggerUrl}=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json());
const socket=new WebSocket(webSocketDebuggerUrl);await new Promise(r=>socket.once('open',r));let seq=0,destinations=0,redirects=0,redirectResolve;const pending=new Map();
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
socket.on('message',async raw=>{const m=JSON.parse(raw.toString());if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);return;}
 if(m.method==='Target.attachedToTarget'){if(m.params.targetInfo.type==='page')await send('Fetch.enable',{patterns:[{urlPattern:'https://fafda.to/*',requestStage:'Request'},{urlPattern:base+'/api/downloads/legacy/redeem',requestStage:'Response'}]},m.params.sessionId);await send('Runtime.runIfWaitingForDebugger',{},m.params.sessionId);}
 if(m.method==='Fetch.requestPaused'){if(m.params.request.url===base+'/api/downloads/legacy/redeem'){assert.equal(m.params.responseStatusCode,303);assert.equal(m.params.responseHeaders.find(h=>h.name.toLowerCase()==='location')?.value,'https://fafda.to/d/file-xyz?v=QA_BROWSER_SECRET');redirects++;redirectResolve();await send('Fetch.continueRequest',{requestId:m.params.requestId},m.sessionId);return;}assert.equal(m.params.request.url,'https://fafda.to/d/file-xyz?v=QA_BROWSER_SECRET');destinations++;await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<h1>Local destination intercepted</h1>').toString('base64')},m.sessionId);}
});
await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
let checks=0;
try {
 for(const width of [360,768,1440]){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:960}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({contentType:'text/html',body:'<h1>Local destination intercepted</h1>'}));
  const response=await page.goto(base+'/download/210');assert.equal(response.status(),200);
  const initial=await page.content();assert.ok(!initial.includes('fafda.to/d/')&&!initial.includes('QA_BROWSER_SECRET'));checks++;
  await page.getByRole('button',{name:'تجهيز رابط التحميل',exact:true}).click();await page.getByRole('timer').waitFor();
  assert.equal(await page.locator('.skeleton').count(),0);assert.equal(await page.getByRole('button',{name:/توليد رابط تحميل آمن/}).count(),0);checks++;
  await page.getByRole('button',{name:'توليد رابط تحميل آمن ↓',exact:true}).waitFor({timeout:25000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
  mkdirSync('tests/screenshots',{recursive:true});await page.screenshot({path:`tests/screenshots/steamrip-ready-${width}.png`,fullPage:true});
  // Observe the authoritative 303 independently without sending signed destinations as client JSON.
  const fields=await page.locator('form').evaluate(form=>Object.fromEntries(new FormData(form)));
  const responsePromise=new Promise(resolve=>{redirectResolve=resolve;});
  const popupPromise=context.waitForEvent('page');await page.getByRole('button',{name:'توليد رابط تحميل آمن ↓',exact:true}).click();const popup=await popupPromise;
  await responsePromise;
  await popup.waitForURL('https://fafda.to/d/file-xyz?v=QA_BROWSER_SECRET');checks++;
  const replay=await context.request.post(base+'/api/downloads/legacy/redeem',{form:fields,headers:{Origin:base,'Sec-Fetch-Site':'same-origin'},maxRedirects:0});assert.equal(replay.status(),410);checks++;
  assert.deepEqual(errors,[]);await context.close();
 }
 assert.equal(destinations,3);assert.equal(redirects,3);
 console.log(`SteamRIP browser checks passed: ${checks} (360, 768, 1440; real POST/303, provider fixture)`);
}finally{await send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true});socket.close();await browser.close();}
