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
(async()=>{
 const source=process.argv[2]||'https://buzzheavier.com/724hyjkckpyu';let browser;
 const launch=o=>chromium.launch({...o,...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
 try {
  const signal=AbortSignal.timeout(45000);
  const result=await browserDestination({source,cached:[]},{signal,launch,progress:state=>console.log(JSON.stringify({area:'browser_live_canary',state}))});
  const header=await publicHttp(result.destination,BZZHR_FILE_HOSTS,signal,{},true,'HEAD');requireProviderSuccess(header);
  assert.equal(header.headers['content-length'],'89','only the owner-created 89-byte QA file may be downloaded');
  const final=publicUrl(result.destination,BZZHR_FILE_HOSTS),pins=await vettedAddresses(final.hostname,signal),pin=pins.find(p=>p.family===4)||pins[0];
  browser=await launch({headless:true,args:[`--host-resolver-rules=MAP ${final.hostname} ${pin.address},MAP * ~NOTFOUND`,'--disable-quic']});
  const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',async route=>{if(route.request().url()===result.destination)await route.continue();else await route.abort();});
  const page=await context.newPage(),downloadPromise=page.waitForEvent('download',{timeout:10000});
  await page.goto(result.destination).catch(()=>{});const download=await downloadPromise;
  assert.equal(await download.failure(),null);const bytes=readFileSync(await download.path());assert.equal(bytes.length,89);
  const sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,'9ed9a2a5581029dd242caf417d58af6c4e1abff4795a55708bb63b9dc5a422c2');
  console.log(JSON.stringify({area:'browser_live_canary',status:'PASS',scope:new URL(source).hostname.includes('steamrip')?'STEAMRIP_TO_BZZHR_TINY_FILE':'BZZHR_ONLY',bytes:bytes.length,sha256}));
 }finally{await browser?.close();}
})().catch(e=>{console.error(JSON.stringify({area:'browser_live_canary',status:'FAIL',code:e.code||'CANARY_FAILED',stage:e.stage,host:e.host,upstream_status:e.upstreamStatus}));process.exitCode=1;});
