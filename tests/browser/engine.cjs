'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
require('../helpers/typescript.cjs');
const load=Module._load;Module._load=function(n,...a){return n==='server-only'?{}:load.call(this,n,...a);};
const {browserDestination}=require('../../src/lib/downloads/browser/engine.ts');
Module._load=load;
const {chromium}=require('playwright');
function nativeRoute(request){return {request:()=>({url:()=>request.url,headers:()=>request.headers}),fulfill:async data=>({status:data.status||200,headers:{'content-type':data.contentType||'text/html',...data.headers},body:data.body}),fallback:async()=>undefined};}
const source='https://steamrip.com/qa-game/',provider='https://buzzheavier.com/file-xyz',destination='https://ts.buzzheavier.com/d/file-xyz?v=fixture-only';
async function run(change={}) {
 const states=[],calls=[],pages=[],head=[];
 const result=await browserDestination({source:change.direct?provider:source,cached:change.cached?[provider]:[]},{
  signal:AbortSignal.timeout(15000),progress:s=>states.push(s),lookup:async host=>{
   if(change.providerDnsFailure&&host==='buzzheavier.com')throw {code:'ENOTFOUND',message:'sensitive resolver information'};
   return [{address:'8.8.8.8',family:4}];
  },
  launch:async options=>{if(change.launchFailure)throw Error('sensitive launch error');return chromium.launch({...options,...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});},
  http:async(url,hosts,signal,headers,follow,method)=>{head.push({url,method});assert.equal(method,'HEAD');if(change.ad||change.rogueProvider)assert.equal(pages.filter(p=>!p.isClosed()).length,1,'advertising popup closed before verification');return {url,status:200,headers:{'content-type':change.invalidFile?'text/html':'application/octet-stream'},body:''};},
  fixture:async context=>{context.on('page',page=>pages.push(page));},
  nativeFixture:async request=>{const route=nativeRoute(request);
    const url=route.request().url();calls.push(url);
    if(url===source)return route.fulfill({status:change.sourceStatus||200,contentType:'text/html',body:(change.cloudflareScript?'<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>':'')+(change.challenge?'<title>Just a moment...</title><form id="challenge-form"></form>':`<aside><a href="https://buzzheavier.com/unrelated-file">BuzzHeavier unrelated game</a></aside>${change.noSection?'':'<h2>Download Links</h2>'}<a href="${provider}" ${change.popup?'target="_blank"':''} ${change.ad||change.rogueProvider?'onclick="event.preventDefault();window.open(\''+(change.rogueProvider?'https://buzzheavier.com/unrelated-file':(change.adURL||'https://ad.invalid/trap'))+'\')"':''}>BuzzHeavier</a>${change.injectedDestination?'<script>fetch("https://ts.buzzheavier.com/d/unrelated?v=fixture-only").catch(()=>{})</script>':''}${change.iframeURL?'<iframe src="'+change.iframeURL+'"></iframe>':''}${change.workerURL?'<script>new Worker(URL.createObjectURL(new Blob(['+JSON.stringify('fetch('+JSON.stringify(change.workerURL)+')')+'],{type:"text/javascript"})))</script>':''}${change.mirrors?'<a href="https://buzzheavier.com/alternate-file">BZZHR mirror</a>':''}`)});
    if(url.startsWith(source+'cdn-cgi/'))return route.fulfill({body:''});
    if(url==='https://buzzheavier.com/alternate-file')return route.fulfill({contentType:'text/html',body:`<button hx-get="/alternate-file/download">Download</button>`});
    if(url==='https://buzzheavier.com/alternate-file/download')return route.fulfill({status:204,headers:{'HX-Redirect':destination}});
    if(url===provider)return route.fulfill({status:change.providerStatus||200,headers:change.forgedDocumentHeader?{'HX-Redirect':'https://ts.buzzheavier.com/d/unrelated?v=fixture-only'}:{},contentType:'text/html',body:change.copyLink
      ? '<a href="#" onclick=\'event.preventDefault();navigator.clipboard.writeText(' + JSON.stringify(change.badCopy?'https://evil.test/d/trap?v=bad':change.wrongFileCopy?'https://ts.buzzheavier.com/d/other-file?v=fixture-only':destination) + ')\'>Copy download link</a>'
      : change.directFile?`<a href="${destination}" ${change.directPopup?'target="_blank"':''}>Download file</a>`:`<button ${change.dataHx?'data-hx-get':'hx-get'}="/file-xyz/download?declared=true" onclick="window.clicked=(window.clicked||0)+1; fetch(this.getAttribute('hx-get')||this.getAttribute('data-hx-get'),{headers:{'HX-Request':'true'}})">Download</button>`});
    if(url===provider+'/endpoint-final')return route.fulfill({status:change.redirectStatus||204,headers:{'HX-Redirect':destination}});
    if(url===provider+'/download?declared=true') {
      if(change.endpointRedirect)return route.fulfill({status:302,headers:{Location:typeof change.endpointRedirect==='string'?change.endpointRedirect:'/file-xyz/endpoint-final'}});
      assert.equal(route.request().headers()['hx-request'],'true');
      if(change.endpointChallenge)return route.fulfill({status:200,contentType:'text/html',body:'<title>Just a moment</title><form id="challenge-form"></form>'});
      return route.fulfill({status:change.endpointStatus||204,headers:change.missingFinal?{}:{[change.location?'Location':'HX-Redirect']:change.invalidHost?'https://evil.test/d/file-xyz?v=bad':destination}});
    }
    return route.fallback(); // Production policy must block ads and all file GETs.
  },
 });
 assert.ok(pages.every(p=>p.isClosed()),'all pages closed in finally');
 assert.equal(head.length,1);assert.equal(calls.filter(u=>u===provider+'/download?declared=true').length,change.directFile||change.mirrors||change.copyLink?0:1);assert.ok(calls.filter(u=>u.includes('/d/')).length<=1);
 return {result,states,calls};
}
test('actual Chromium navigation, provider link click, hx-get click, HX-Redirect and HEAD',async()=>{const r=await run();assert.equal(r.result.destination,destination);assert.deepEqual(r.result.discovered,[provider]);assert.deepEqual(r.states,['BROWSER_STARTING','OPENING_SOURCE','FINDING_BZZHR','RESOLVING_DOWNLOAD','VERIFYING_FILE','READY']);});
test('secondary provider DNS failure stays precise before native page I/O',async()=>assert.rejects(run({providerDnsFailure:true}),e=>e.code==='PROVIDER_DNS_FAILED'&&e.dnsCode==='ENOTFOUND'&&e.stage==='bzzhr_page'&&e.host==='buzzheavier.com'));
test('initial DNS failure never launches Chromium or alters SSRF validation',async()=>{
 let launched=false;
 await assert.rejects(browserDestination({source:provider,cached:[]},{signal:AbortSignal.timeout(3000),progress:()=>{},
  lookup:async()=>{throw {code:'EAI_AGAIN'};},launch:async()=>{launched=true;throw Error('must not launch');}}),e=>e.code==='PROVIDER_DNS_FAILED'&&e.dnsCode==='EAI_AGAIN');
 assert.equal(launched,false);
});
test('legitimate target=_blank is closed before network and followed in original worker page',async()=>assert.equal((await run({popup:true})).result.destination,destination));
test('advertising popup blocked and closed; original context follows declared source',async()=>assert.equal((await run({ad:true})).result.destination,destination));
test('data-hx-get and normal Location supported in browser session',async()=>assert.equal((await run({dataHx:true,location:true})).result.destination,destination));
test('cached stable provider skips SteamRIP without caching signed destination',async()=>{const r=await run({cached:true});assert.ok(!r.calls.includes(source));assert.equal(r.result.destination,destination);});
test('provider-declared static final link is clicked without fetching game bytes',async()=>assert.equal((await run({directFile:true})).result.destination,destination));
test('direct approved provider source opens actual page',async()=>assert.equal((await run({direct:true})).result.destination,destination));
test('BZZHR Copy download link uses isolated Chromium clipboard; only approved signed URL is returned',async()=>{
 const r=await run({direct:true,copyLink:true});
 assert.equal(r.result.destination,destination);
 assert.deepEqual(r.result.discovered,[provider]);
 assert.deepEqual(r.states,['BROWSER_STARTING','RESOLVING_DOWNLOAD','VERIFYING_FILE','READY']);
 assert.ok(!r.calls.some(u=>u.includes('download?declared=true')));
});
test('BZZHR copied foreign URL is rejected; it never becomes a user download',async()=>
 assert.rejects(run({direct:true,copyLink:true,badCopy:true}),e=>e.code==='INVALID_SOURCE'));
test('BZZHR copied signed link for a different file ID is refused',async()=>
 assert.rejects(run({direct:true,copyLink:true,wrongFileCopy:true}),e=>e.code==='INVALID_PROVIDER_RESPONSE'));

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
 nativeFixture:async request=>{const route=nativeRoute(request);const url=route.request().url();if(url===provider)return route.fulfill({contentType:'text/html',body:'<button hx-get="/file-xyz/download">Download</button>'});if(url===provider+'/download'){clicks++;return route.fulfill({status:204,headers:{'HX-Redirect':destination}});}return route.fallback();},
 });assert.equal(result.destination,destination);assert.equal(clicks,1);
});
for(const status of [403,429])test('HTMX '+status+' stops without repeated clicks/requests',async()=>assert.rejects(run({endpointStatus:status}),e=>e.code===(status===403?'PROVIDER_FORBIDDEN':'PROVIDER_RATE_LIMITED')));

test('removed first declared mirror falls back to the second declaration, no guessed URLs',async()=>assert.equal((await run({mirrors:true,providerStatus:404})).result.destination,destination));

test('HTMX 200 human challenge is accurately classified and extraction stops',async()=>assert.rejects(run({endpointChallenge:true}),e=>e.code==='PROVIDER_CHALLENGE'&&e.stage==='bzzhr_htmx'));

test('missing Download Links section cannot select an unrelated provider anchor',async()=>assert.rejects(run({noSection:true}),e=>e.code==='BZZHR_NOT_FOUND'));

test('unrelated BZZHR popup cannot replace the declared game source',async()=>assert.equal((await run({rogueProvider:true})).result.destination,destination));
test('unsolicited known-CDN file navigation cannot become a final destination',async()=>assert.rejects(run({injectedDestination:true,missingFinal:true}),e=>e.code==='MISSING_HX_REDIRECT'));
test('provider document header is not a response from the clicked download endpoint',async()=>assert.rejects(run({forgedDocumentHeader:true,missingFinal:true}),e=>e.code==='MISSING_HX_REDIRECT'));

test('real HTTP 302 to final CDN is captured without fetching game bytes',async()=>assert.equal((await run({location:true,endpointStatus:302})).result.destination,destination));
test('provider endpoint redirects remain within the clicked file and browser session',async()=>assert.equal((await run({endpointRedirect:true})).result.destination,destination));

test('static declared target=_blank file is verified without worker download',async()=>assert.equal((await run({directFile:true,directPopup:true})).result.destination,destination));
for(const status of [403,429])test('native redirect hop '+status+' stops without retries',async()=>assert.rejects(run({endpointRedirect:true,redirectStatus:status}),e=>e.code===(status===403?'PROVIDER_FORBIDDEN':'PROVIDER_RATE_LIMITED')));
for(const worker of [false,true])test(worker?'dedicated worker cannot make unguarded loopback requests':'native redirect cannot contact a literal loopback IP',async()=>{
 const server=require('node:net').createServer(socket=>{connections++;socket.destroy();});let connections=0;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const target='https://127.0.0.1:'+server.address().port+'/private';
  if(worker)assert.equal((await run({workerURL:target})).result.destination,destination);
  else await assert.rejects(run({endpointRedirect:target}),e=>['INVALID_SOURCE','INVALID_PROVIDER_RESPONSE'].includes(e.code));
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(connections,0,'no loopback connection was made');
 }finally{await new Promise(resolve=>server.close(resolve));}
});

for(const popup of [true,false])test(popup?'ad popup is paused and closed before loopback network':'iframe cannot make unguarded loopback requests',async()=>{
 const server=require('node:net').createServer(socket=>{connections++;socket.destroy();});let connections=0;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const target='https://127.0.0.1:'+server.address().port+'/private';
  assert.equal((await run(popup?{ad:true,adURL:target}:{iframeURL:target})).result.destination,destination);
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(connections,0,'no unguarded loopback connection was made');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
