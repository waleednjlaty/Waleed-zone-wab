'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');require('./helpers/typescript.cjs');
const load=Module._load;Module._load=function(n,...a){return n==='server-only'?{}:load.call(this,n,...a);};
const {createBrowserManager}=require('../src/lib/downloads/browser/manager.ts'),{providerError}=require('../src/lib/downloads/providers/public-http.ts');Module._load=load;
const source='https://steamrip.com/qa/',destination='https://fafda.to/d/file?v=SECRET';
test('20 clients deduplicate into one browser; source/revision concurrency blocked; no final cache',async()=>{
 let calls=0,release;const m=createBrowserManager(async(input,signal,progress)=>{calls++;progress('FINDING_BZZHR');await new Promise(r=>release=r);return {destination,discovered:['https://buzzheavier.com/file']};});
 const requests=Array.from({length:20},(_,i)=>m.resolve(1,'rev',source,[],String(i),new AbortController().signal));await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(m.status('0'),'FINDING_BZZHR');
 await assert.rejects(m.resolve(1,'new',source,[],'bad',new AbortController().signal),e=>e.code==='PROVIDER_BUSY');release();await Promise.all(requests);
 const next=m.resolve(1,'rev',source,[],'fresh',new AbortController().signal);await new Promise(r=>setImmediate(r));assert.equal(calls,2);release();await next;assert.ok(!JSON.stringify(m.status('fresh')).includes('SECRET'));
});
test('one caller abort cannot kill another; final caller abort cancels worker',async()=>{
 let aborted=false,release;const m=createBrowserManager(async(input,signal)=>{signal.addEventListener('abort',()=>aborted=true);await new Promise(r=>release=r);return {destination,discovered:[]};});
 const a=new AbortController(),b=new AbortController();const first=m.resolve(1,'rev',source,[],'same-grant',a.signal),second=m.resolve(1,'rev',source,[],'same-grant',b.signal);await new Promise(r=>setImmediate(r));a.abort();await assert.rejects(first);assert.equal(aborted,false);b.abort();await assert.rejects(second);assert.equal(aborted,true);release();
});
test('403/429/challenge opens barrier backoff, not repeated extraction',async()=>{let time=0,calls=0;const m=createBrowserManager(async()=>{calls++;throw providerError('PROVIDER_FORBIDDEN');},()=>time);await assert.rejects(m.resolve(1,'rev',source,[],'a',new AbortController().signal));await assert.rejects(m.resolve(1,'rev',source,[],'b',new AbortController().signal),e=>e.code==='PROVIDER_BUSY');assert.equal(calls,1);time=60001;await assert.rejects(m.resolve(1,'rev',source,[],'c',new AbortController().signal));assert.equal(calls,2);});
