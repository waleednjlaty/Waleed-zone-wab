'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
require('../helpers/typescript.cjs');
const load=Module._load;Module._load=function(n,...a){return n==='server-only'?{}:load.call(this,n,...a);};
const {browserDestination}=require('../../src/lib/downloads/browser/engine.ts');
Module._load=load;
const {chromium}=require('playwright');
const source='https://steamrip.com/qa-game/',provider='https://buzzheavier.com/file-xyz',destination='https://ts.buzzheavier.com/d/file-xyz?v=fixture-only';
async function run(change={}) {
 const states=[],calls=[],pages=[],head=[];
 const result=await browserDestination({source:change.direct?provider:source,cached:change.cached?[provider]:[]},{
  signal:AbortSignal.timeout(15000),progress:s=>states.push(s),lookup:async()=>[{address:'8.8.8.8',family:4}],
  launch:async options=>{if(change.launchFailure)throw Error('sensitive launch error');return chromium.launch({...options,...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});},
  http:async(url,hosts,signal,headers,follow,method)=>{head.push({url,method});assert.equal(method,'HEAD');return {url,status:200,headers:{'content-type':change.invalidFile?'text/html':'application/octet-stream'},body:''};},
  fixture:async context=>{
   context.on('page',page=>pages.push(page));
   await context.route('**/*',async route=>{
    const url=route.request().url();calls.push(url);
    if(url===source)return route.fulfill({status:change.sourceStatus||200,contentType:'text/html',body:(change.cloudflareScript?'<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>':'')+(change.challenge?'<title>Just a moment...</title><form id="challenge-form"></form>':`<h2>Download Links</h2><a href="${provider}" ${change.popup?'target="_blank"':''} ${change.ad?'onclick="event.preventDefault();window.open(\'https://ad.invalid/trap\')"':''}>BuzzHeavier</a>${change.mirrors?'<a href="https://buzzheavier.com/alternate-file">BZZHR mirror</a>':''}`)});
    if(url.startsWith(source+'cdn-cgi/'))return route.fulfill({body:''});
    if(url==='https://buzzheavier.com/alternate-file')return route.fulfill({contentType:'text/html',body:`<button hx-get="/alternate-file/download">Download</button>`});
    if(url==='https://buzzheavier.com/alternate-file/download')return route.fulfill({status:204,headers:{'HX-Redirect':destination}});
    if(url===provider)return route.fulfill({status:change.providerStatus||200,contentType:'text/html',body:change.directFile?`<a href="${destination}">Download file</a>`:`<button ${change.dataHx?'data-hx-get':'hx-get'}="/file-xyz/download?declared=true" onclick="window.clicked=(window.clicked||0)+1; fetch(this.getAttribute('hx-get')||this.getAttribute('data-hx-get'),{headers:{'HX-Request':'true'}})">Download</button>`});
    if(url===provider+'/download?declared=true') {
      assert.equal(route.request().headers()['hx-request'],'true');
      return route.fulfill({status:change.endpointStatus||204,headers:{[change.location?'Location':'HX-Redirect']:change.invalidHost?'https://evil.test/d/file-xyz?v=bad':destination}});
    }
    return route.fallback(); // Production policy must block ads and all file GETs.
   });
  },
 });
 assert.ok(pages.every(p=>p.isClosed()),'all pages closed in finally');
 assert.equal(head.length,1);assert.equal(calls.filter(u=>u===provider+'/download?declared=true').length,change.directFile||change.mirrors?0:1);assert.ok(calls.filter(u=>u.includes('/d/')).length<=1);
 return {result,states,calls};
}
test('actual Chromium navigation, provider link click, hx-get click, HX-Redirect and HEAD',async()=>{const r=await run();assert.equal(r.result.destination,destination);assert.deepEqual(r.result.discovered,[provider]);assert.deepEqual(r.states,['BROWSER_STARTING','OPENING_SOURCE','FINDING_BZZHR','RESOLVING_DOWNLOAD','VERIFYING_FILE','READY']);});
test('legitimate target=_blank download popup remains inside worker context',async()=>assert.equal((await run({popup:true})).result.destination,destination));
test('advertising popup blocked and closed; original context follows declared source',async()=>assert.equal((await run({ad:true})).result.destination,destination));
test('data-hx-get and normal Location supported in browser session',async()=>assert.equal((await run({dataHx:true,location:true})).result.destination,destination));
test('cached stable provider skips SteamRIP without caching signed destination',async()=>{const r=await run({cached:true});assert.ok(!r.calls.includes(source));assert.equal(r.result.destination,destination);});
test('provider-declared static final link is clicked without fetching game bytes',async()=>assert.equal((await run({directFile:true})).result.destination,destination));
test('direct approved provider source opens actual page',async()=>assert.equal((await run({direct:true})).result.destination,destination));
test('ordinary Cloudflare passive script does not masquerade as challenge',async()=>assert.equal((await run({cloudflareScript:true})).result.destination,destination));
for(const [label,change,code] of [
 ['invalid file MIME',{invalidFile:true},'INVALID_FILE_RESPONSE'],['foreign final host',{invalidHost:true},'INVALID_SOURCE'],
 ['real challenge',{challenge:true},'PROVIDER_CHALLENGE'],['source forbidden',{sourceStatus:403},'PROVIDER_FORBIDDEN'],
 ['source rate limit',{sourceStatus:429},'PROVIDER_RATE_LIMITED'],['provider forbidden',{providerStatus:403},'PROVIDER_FORBIDDEN'],
 ['provider rate limit',{providerStatus:429},'PROVIDER_RATE_LIMITED'],['Chromium launch failure',{launchFailure:true},'BROWSER_START_FAILED'],
])test(label,async()=>assert.rejects(run(change),e=>e.code===code));
test('declarative hx-get without provider JS uses browser fetch after a real click',async()=>{
 const states=[];let clicks=0;
 const result=await browserDestination({source:provider,cached:[]},{signal:AbortSignal.timeout(10000),progress:s=>states.push(s),lookup:async()=>[{address:'8.8.8.8',family:4}],launch:o=>chromium.launch({...o,...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})}),
 http:async(url,hosts,sig,headers,follow,method)=>({url,status:200,headers:{'content-type':'application/octet-stream'},body:''}),
 fixture:async context=>context.route('**/*',async route=>{const url=route.request().url();if(url===provider)return route.fulfill({contentType:'text/html',body:'<button hx-get="/file-xyz/download">Download</button>'});if(url===provider+'/download'){clicks++;return route.fulfill({status:204,headers:{'HX-Redirect':destination}});}return route.fallback();}),
 });assert.equal(result.destination,destination);assert.equal(clicks,1);
});
for(const status of [403,429])test('HTMX '+status+' stops without repeated clicks/requests',async()=>assert.rejects(run({endpointStatus:status}),e=>e.code===(status===403?'PROVIDER_FORBIDDEN':'PROVIDER_RATE_LIMITED')));

test('removed first declared mirror falls back to the second declaration, no guessed URLs',async()=>assert.equal((await run({mirrors:true,providerStatus:404})).result.destination,destination));
