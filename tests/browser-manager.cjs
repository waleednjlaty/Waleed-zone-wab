'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');require('./helpers/typescript.cjs');
const load=Module._load;Module._load=function(n,...a){return n==='server-only'?{}:load.call(this,n,...a);};
const {createBrowserManager,SIGNED_URL_MAX_AGE_MS}=require('../src/lib/downloads/browser/manager.ts'),{providerError}=require('../src/lib/downloads/providers/public-http.ts');Module._load=load;
const source='https://steamrip.com/qa/',destination='https://fafda.to/d/file?v=SECRET';
test('independent grants share only one verified result, with bounded ten-minute cache',async()=>{
 let time=0,calls=0,verified=0,release;const m=createBrowserManager(async(input,signal,progress)=>{calls++;progress('FINDING_BZZHR');await new Promise(r=>release=r);return {destination,discovered:['https://buzzheavier.com/file']};},()=>time,async url=>{verified++;return url;});
 const requests=Array.from({length:20},()=>m.resolve(1,'rev',source,[],'one-user-grant',new AbortController().signal));await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(m.status('one-user-grant'),'FINDING_BZZHR');
 const follower=m.resolve(1,'rev',source,[],'different-user-grant',new AbortController().signal);assert.equal(m.status('different-user-grant'),'FINDING_BZZHR');
 await assert.rejects(m.resolve(1,'new',source,[],'bad',new AbortController().signal),e=>e.code==='PROVIDER_BUSY');release();await Promise.all([...requests,follower]);
 const reused=await m.resolve(1,'rev',source,[],'fresh',new AbortController().signal);
 assert.equal(reused.destination,destination);assert.equal(calls,1);assert.equal(verified,1);
 assert.ok(!JSON.stringify(m.status('fresh')).includes('SECRET'));
 time+=SIGNED_URL_MAX_AGE_MS;
 const next=m.resolve(1,'rev',source,[],'after-ten-minutes',new AbortController().signal);
 await new Promise(r=>setImmediate(r));assert.equal(calls,2);release();await next;
 assert.equal(verified,1,'expired links never go back through the cached HEAD path');
});
test('cached signed link is rejected when HEAD fails, and a fresh browser job is required',async()=>{
 let calls=0,checks=0;
 const m=createBrowserManager(async()=>{calls++;return {destination,discovered:['https://buzzheavier.com/file']};},
   ()=>0,async()=>{checks++;throw providerError('SOURCE_REMOVED');});
 await m.resolve(7,'rev',source,[],'first',new AbortController().signal);
 await m.resolve(7,'rev',source,[],'second',new AbortController().signal);
 assert.equal(calls,2);assert.equal(checks,1);
});
test('a cache entry never crosses source revisions or files and does not leak signed tokens into progress',async()=>{
 let calls=0,checks=0;
 const m=createBrowserManager(async()=>{calls++;return {destination,discovered:[]};},()=>0,async url=>{checks++;return url;});
 await m.resolve(7,'revision1',source,[],'first',new AbortController().signal);
 await m.resolve(7,'revision2',source,[],'second',new AbortController().signal);
 await m.resolve(8,'revision1',source,[],'third',new AbortController().signal);
 assert.equal(calls,3);assert.equal(checks,0);
 assert.ok(!JSON.stringify(m.status('second')).includes('SECRET'));
});
test('one caller abort cannot kill another; final caller abort cancels worker',async()=>{
 let aborted=false,release;const m=createBrowserManager(async(input,signal)=>{signal.addEventListener('abort',()=>aborted=true);await new Promise(r=>release=r);return {destination,discovered:[]};});
 const a=new AbortController(),b=new AbortController();const first=m.resolve(1,'rev',source,[],'same-grant',a.signal),second=m.resolve(1,'rev',source,[],'same-grant',b.signal);await new Promise(r=>setImmediate(r));a.abort();await assert.rejects(first);assert.equal(aborted,false);b.abort();await assert.rejects(second);assert.equal(aborted,true);release();
});
test('403/429/challenge opens barrier backoff, not repeated extraction',async()=>{let time=0,calls=0;const m=createBrowserManager(async()=>{calls++;throw providerError('PROVIDER_FORBIDDEN');},()=>time);await assert.rejects(m.resolve(1,'rev',source,[],'a',new AbortController().signal));await assert.rejects(m.resolve(1,'rev',source,[],'b',new AbortController().signal),e=>e.code==='PROVIDER_BUSY');assert.equal(calls,1);time=60001;await assert.rejects(m.resolve(1,'rev',source,[],'c',new AbortController().signal));assert.equal(calls,2);});
