'use strict';
/** Authorized exact 89-byte canary; no DB writes, no fixture route, no game bytes.
 * A BZZHR-only pass is NOT a SteamRIP end-to-end production release pass. */
const Module=require('node:module'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{createHash}=require('node:crypto');
const {transformSync}=require('next/dist/build/swc'),{chromium}=require('playwright');
require.extensions['.ts']=(module,file)=>module._compile(transformSync(readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code,file);
const load=Module._load;Module._load=function(n,...a){return n==='server-only'?{}:load.call(this,n,...a);};
const {browserDestination}=require('../src/lib/downloads/browser/engine.ts');
const {publicUrl,publicHttp,vettedAddresses,requireProviderSuccess}=require('../src/lib/downloads/providers/public-http.ts');
const {BZZHR_FILE_HOSTS}=require('../src/lib/downloads/providers/bzzhr.ts');Module._load=load;
const {CANARY,requireCanaryDestination,requireCanaryHeaders}=require('./lib/browser-canary.cjs');
(async()=>{
 const source=process.argv[2]||'https://buzzheavier.com/'+CANARY.id;let browser,session,failure;
 const launch=o=>chromium.launch({...o,...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
 try {
  const signal=AbortSignal.timeout(45000);
  assert.ok(Date.now()<CANARY.expires,'CANARY_EXPIRED');
  const result=await browserDestination({source,cached:[]},{signal,launch,progress:state=>console.log(JSON.stringify({area:'browser_live_canary',state}))});
  const header=await publicHttp(result.destination,BZZHR_FILE_HOSTS,signal,{},true,'HEAD');requireProviderSuccess(header);
  requireCanaryDestination(header.url);requireCanaryHeaders(header.status,header.headers);
  // Use the revalidated final HEAD hop, rather than repeating an older redirect.
  const final=publicUrl(header.url,BZZHR_FILE_HOSTS),pins=await vettedAddresses(final.hostname,signal),pin=pins.find(p=>p.family===4)||pins[0];
  browser=await launch({headless:true,timeout:8000,args:[`--host-resolver-rules=MAP ${final.hostname} ${pin.family===6?'['+pin.address+']':pin.address},MAP * ~NOTFOUND`,'--disable-quic','--disable-dev-shm-usage']});
  const abort=()=>{failure??=Error('CANARY_TIMEOUT');void browser?.close().catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
  const page=await context.newPage();context.on('page',p=>{if(p!==page)void p.close();});
  session=await context.newCDPSession(page);
  session.on('Fetch.requestPaused',event=>{void(async()=>{
   const block=()=>session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
   try {
    if(event.request.url!==final.href||event.request.method!=='GET')return await block();
    if(event.responseStatusCode!==undefined) {
     requireCanaryHeaders(event.responseStatusCode,Object.fromEntries((event.responseHeaders||[]).map(h=>[h.name.toLowerCase(),h.value])));
     await session.send('Fetch.continueResponse',{requestId:event.requestId});
    } else await session.send('Fetch.continueRequest',{requestId:event.requestId});
   }catch(error){failure=error;await block();void browser.close().catch(()=>{});}
  })().catch(error=>{failure=error;void browser.close().catch(()=>{});});});
  // Guard every native redirect and GET response BEFORE Chrome accepts its body.
  await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'},{urlPattern:'*',requestStage:'Response'}]});
  const downloadPromise=page.waitForEvent('download',{timeout:10000});
  const [download]=await Promise.all([downloadPromise,page.goto(final.href).catch(()=>{})]);
  assert.equal(await download.failure(),null);const bytes=readFileSync(await download.path());assert.equal(bytes.length,89);
  const sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,CANARY.sha256);
  console.log(JSON.stringify({area:'browser_live_canary',status:'PASS',scope:new URL(source).hostname.includes('steamrip')?'STEAMRIP_TO_BZZHR_TINY_FILE':'BZZHR_ONLY',bytes:bytes.length,sha256}));
 }catch(error){throw failure||error;}finally{await browser?.close();}
})().catch(e=>{console.error(JSON.stringify({area:'browser_live_canary',status:'FAIL',code:e.code||'CANARY_FAILED',dns_code:e.dnsCode,stage:e.stage,host:e.host,upstream_status:e.upstreamStatus}));process.exitCode=1;});
