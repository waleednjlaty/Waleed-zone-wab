import 'server-only';
import { fork, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { providerError, ProviderFailure, ProviderDnsFailure, safeDnsCode } from '../providers/public-http';
import type { BrowserInput, BrowserResult, BrowserState } from './engine';
import { validateBzzhrDns } from '../providers/bzzhr';
export const SIGNED_URL_MAX_AGE_MS=10*60*1000;
export type SignedUrlVerifier=(url:string,signal:AbortSignal)=>Promise<string>;
export type Runner=(input:BrowserInput,signal:AbortSignal,progress:(state:BrowserState)=>void)=>Promise<BrowserResult>;
export function memoryAvailable() {
  try {
    const used=Number(readFileSync('/sys/fs/cgroup/memory.current','utf8'));
    const raw=readFileSync('/sys/fs/cgroup/memory.max','utf8').trim();
    const limit=raw==='max'?512*1024*1024:Number(raw);
    return Number.isFinite(used)&&Number.isFinite(limit)&&used<Math.min(limit*.8,768*1024*1024);
  } catch {return process.memoryUsage().rss<256*1024*1024;}
}
export const childRunner:Runner=(input,signal,progress)=>new Promise((resolve,reject)=>{
  if(signal.aborted){reject(providerError('PROVIDER_TIMEOUT'));return;}
  if(!memoryAvailable()){reject(providerError('BROWSER_RESOURCE_LIMIT'));return;}
  let child:ChildProcess|undefined,settled=false,step:BrowserState='BROWSER_STARTING';
  const startedAt=Date.now();
  const record=(outcome:'started'|'completed'|'failed',code?:string,dnsCode?:unknown)=>console.info(JSON.stringify({
    area:'background_browser_worker',step,outcome,elapsed_ms:Date.now()-startedAt,
    ...(code&&/^[A-Z_]+$/.test(code)?{code}:{}),
    ...(safeDnsCode(dnsCode)?{dns_code:safeDnsCode(dnsCode)}:{}),
  }));
  record('started');
  const terminate=()=>{
    if(!child)return;
    const descendants:number[]=[];
    function collect(pid:number) {
      try {for(const value of readFileSync(`/proc/${pid}/task/${pid}/children`,'utf8').trim().split(/\s+/)) {
        const next=Number(value);if(next>0&&!descendants.includes(next)){descendants.push(next);collect(next);}
      }}catch{/* exited child */}
    }
    if(child.pid)collect(child.pid);
    if(child.connected)child.send({type:'cancel'},()=>{});
    // Hard cleanup remains armed even if a stuck worker exits before Chromium.
    const timer=setTimeout(()=>{for(const pid of descendants.reverse())try{process.kill(pid,'SIGKILL');}catch{/* exited */}child?.kill('SIGKILL');},1500);timer.unref();
  };
  const done=(error?:unknown,result?:BrowserResult)=>{
    if(settled)return;settled=true;clearInterval(memory);clearTimeout(deadline);signal.removeEventListener('abort',abort);
    record(error?'failed':'completed',(error as {code?:string}|undefined)?.code,(error as {dnsCode?:unknown}|undefined)?.dnsCode);
    terminate();if(error)reject(error);else resolve(result!);
  };
  const abort=()=>done(providerError('PROVIDER_TIMEOUT'));
  const memory=setInterval(()=>{if(!memoryAvailable())done(providerError('BROWSER_RESOURCE_LIMIT'));},500);
  const deadline=setTimeout(abort,45000);signal.addEventListener('abort',abort,{once:true});
  try {
    // No DATABASE_URL, signing keys, owner identity, Node preload or proxy env in child.
    const env={NODE_ENV:'production' as const,...Object.fromEntries(['PATH','HOME','PLAYWRIGHT_BROWSERS_PATH','TMPDIR','LD_LIBRARY_PATH'].flatMap(key=>process.env[key]?[[key,process.env[key]!]]:[]))};
    child=fork(join(process.cwd(),'scripts/browser-worker.cjs'),[],{env,execArgv:['--max-old-space-size=128'],stdio:['ignore','ignore','ignore','ipc']});
    child.on('message',(message:unknown)=>{
      const m=message as {type:string;state:BrowserState;result:BrowserResult;code?:string;dnsCode?:unknown;stage?:string;host?:string;upstreamStatus?:number};
      if(m.type==='progress'&&['BROWSER_STARTING','OPENING_SOURCE','FINDING_BZZHR','RESOLVING_DOWNLOAD','VERIFYING_FILE','READY','PROVIDER_CHALLENGE','FAILED'].includes(m.state)) {
        if(m.state!==step&&!['FAILED','PROVIDER_CHALLENGE'].includes(m.state)){record('completed');step=m.state;record('started');}
        progress(m.state);
      }
      if(m.type==='result')done(undefined,m.result);
      if(m.type==='failure')done(new ProviderFailure(m.code==='PROVIDER_DNS_FAILED'?new ProviderDnsFailure({code:m.dnsCode})
        :providerError(/^[A-Z_]+$/.test(m.code||'')?m.code:'BROWSER_FAILED'),m.stage as never,m.host||new URL(input.source).hostname,m.upstreamStatus));
    });
    child.once('error',()=>done(providerError('BROWSER_START_FAILED')));
    child.once('exit',()=>{if(!settled)done(providerError('BROWSER_START_FAILED'));});
    child.send({type:'resolve',input});
  }catch{done(providerError('BROWSER_START_FAILED'));}
});
type ManagedResult=BrowserResult&{assertCurrent?:()=>void};
type Job={controller:AbortController;promise:Promise<ManagedResult>;waiters:Map<string,string>;state:BrowserState};
export function createBrowserManager(run:Runner=childRunner,now=Date.now,verify:SignedUrlVerifier=validateBzzhrDns) {
  const jobs=new Map<string,Job>(),states=new Map<string,{state:BrowserState;expires:number}>();let blockedUntil=0;
  // Reuse only final links that Chromium already extracted and verified.
  // Never persist signed URLs to PostgreSQL, expose them in status, or serve
  // them after ten minutes. A stale link is re-generated on the next request.
  const signed=new Map<string,{result:BrowserResult;expires:number}>();
  const cacheKey=(id:number,revision:string,source:string)=>createHash('sha256').update(JSON.stringify([id,revision,source])).digest('hex');
  function managedResult(k:string,entry:{result:BrowserResult;expires:number},destination=entry.result.destination):ManagedResult {
    return {destination,discovered:[...entry.result.discovered],assertCurrent:()=>{
      if(signed.get(k)!==entry||entry.expires<=now())throw providerError('SIGNED_LINK_EXPIRED');
    }};
  }
  function trimSigned() {
    for(const [k,v] of signed)if(v.expires<=now())signed.delete(k);
    while(signed.size>100)signed.delete(signed.keys().next().value!);
  }
  // One autonomous job per source; waiters share only the verified result.
  // No visitor cookies are imported into or exported from its fresh context.
  function setState(tokenHash:string,state:BrowserState) {
    for(const [k,value] of states)if(value.expires<=now())states.delete(k);
    if(states.size>=1000&&!states.has(tokenHash))states.delete(states.keys().next().value!);
    states.set(tokenHash,{state,expires:now()+60000});
  }
  return {
    status(tokenHash:string):BrowserState|null {const value=states.get(tokenHash);return value&&value.expires>now()?value.state:null;},
    async resolve(id:number,revision:string,source:string,cached:string[],tokenHash:string,signal:AbortSignal) {
      if(signal.aborted)throw providerError('PROVIDER_TIMEOUT');
      trimSigned();
      const sharedKey=cacheKey(id,revision,source),fresh=signed.get(sharedKey);
      if(fresh) {
        try {
          // HEAD checks the signed destination before *each* grant redemption.
          // No file body is fetched through Railway; one-use grant/source
          // revision checks still happen in the parent delivery transaction.
          const validated=await verify(fresh.result.destination,signal);
          if(signal.aborted)throw providerError('PROVIDER_TIMEOUT');
          if(new URL(validated).pathname.split('/')[2]!==new URL(fresh.result.destination).pathname.split('/')[2])
            throw providerError('INVALID_FILE_RESPONSE');
          if (fresh.expires <= now()) throw providerError('SIGNED_LINK_EXPIRED');
          setState(tokenHash, 'USING_CACHED_LINK');
          return managedResult(sharedKey,fresh,validated);
        } catch(error) {
          signed.delete(sharedKey);
          if(signal.aborted)throw error;
          // Expired/denied HEAD never returns a stale URL; try a fresh browser
          // only if provider backoff and one-worker resource limits permit it.
        }
      }
      const k=sharedKey;let job=jobs.get(k);
      if(!job) {
        if(jobs.size>=1||now()<blockedUntil)throw providerError('PROVIDER_BUSY');
        const controller=new AbortController(),waiters=new Map<string,string>();
        job={controller,waiters,state:'BROWSER_STARTING',promise:undefined as never};jobs.set(k,job);
        const owned=job;
        // Set job before scheduling run: synchronous launch errors cannot race map insertion.
        job.promise=Promise.resolve().then(()=>run({source,cached},controller.signal,state=>{owned.state=state;for(const token of waiters.values())setState(token,state);})).then(result=>{
          // Only successful, HEAD-verified resolutions enter the in-memory
          // ten-minute cache. This cache never extends an upstream expiry.
          if(controller.signal.aborted)throw providerError('PROVIDER_TIMEOUT');
          trimSigned();
          const entry={result:{destination:result.destination,discovered:[...result.discovered]},expires:now()+SIGNED_URL_MAX_AGE_MS};
          signed.set(sharedKey,entry);trimSigned();
          return managedResult(sharedKey,entry);
        }).catch(error=>{
          blockedUntil=now()+(['PROVIDER_CHALLENGE','PROVIDER_FORBIDDEN','PROVIDER_RATE_LIMITED'].includes(error?.code)?60000:10000);throw error;
        }).finally(()=>jobs.delete(k));
      }
      const current=job,waiter=tokenHash+':'+Math.random();current.waiters.set(waiter,tokenHash);setState(tokenHash,current.state);
      let abort:()=>void=()=>{};
      try {return await Promise.race([current.promise,new Promise<never>((_,reject)=>{
        abort=()=>reject(providerError('PROVIDER_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
      })]);}
      finally {
        signal.removeEventListener('abort',abort);current.waiters.delete(waiter);
        if(!current.waiters.size)current.controller.abort();
      }
    },
  };
}
const shared=globalThis as unknown as {wzBrowserManager?:ReturnType<typeof createBrowserManager>};
export const browserManager=shared.wzBrowserManager??=createBrowserManager();
