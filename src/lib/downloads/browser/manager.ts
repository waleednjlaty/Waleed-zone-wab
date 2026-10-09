import 'server-only';
import { fork, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { providerError, ProviderFailure } from '../providers/public-http';
import type { BrowserInput, BrowserResult, BrowserState } from './engine';
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
  let child:ChildProcess|undefined,settled=false;
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
      const m=message as {type:string;state:BrowserState;result:BrowserResult;code?:string;stage?:string;host?:string;upstreamStatus?:number};
      if(m.type==='progress'&&['BROWSER_STARTING','OPENING_SOURCE','FINDING_BZZHR','RESOLVING_DOWNLOAD','VERIFYING_FILE','READY','PROVIDER_CHALLENGE','FAILED'].includes(m.state))progress(m.state);
      if(m.type==='result')done(undefined,m.result);
      if(m.type==='failure')done(new ProviderFailure(providerError(/^[A-Z_]+$/.test(m.code||'')?m.code:'BROWSER_FAILED'),m.stage as never,m.host||new URL(input.source).hostname,m.upstreamStatus));
    });
    child.once('error',()=>done(providerError('BROWSER_START_FAILED')));
    child.once('exit',()=>{if(!settled)done(providerError('BROWSER_START_FAILED'));});
    child.send({type:'resolve',input});
  }catch{done(providerError('BROWSER_START_FAILED'));}
});
type Job={controller:AbortController;promise:Promise<BrowserResult>;waiters:Map<string,string>;state:BrowserState};
export function createBrowserManager(run:Runner=childRunner,now=Date.now) {
  const jobs=new Map<string,Job>(),states=new Map<string,{state:BrowserState;expires:number}>();let blockedUntil=0;
  const key=(id:number,revision:string,source:string)=>createHash('sha256').update(JSON.stringify([id,revision,source])).digest('hex');
  function setState(tokenHash:string,state:BrowserState) {
    for(const [k,value] of states)if(value.expires<=now())states.delete(k);
    if(states.size>=1000&&!states.has(tokenHash))states.delete(states.keys().next().value!);
    states.set(tokenHash,{state,expires:now()+60000});
  }
  return {
    status(tokenHash:string):BrowserState|null {const value=states.get(tokenHash);return value&&value.expires>now()?value.state:null;},
    async resolve(id:number,revision:string,source:string,cached:string[],tokenHash:string,signal:AbortSignal) {
      if(signal.aborted)throw providerError('PROVIDER_TIMEOUT');
      const k=key(id,revision,source);let job=jobs.get(k);
      if(!job) {
        if(jobs.size>=1||now()<blockedUntil)throw providerError('PROVIDER_BUSY');
        const controller=new AbortController(),waiters=new Map<string,string>();
        job={controller,waiters,state:'BROWSER_STARTING',promise:undefined as never};jobs.set(k,job);
        const owned=job;
        // Set job before scheduling run: synchronous launch errors cannot race map insertion.
        job.promise=Promise.resolve().then(()=>run({source,cached},controller.signal,state=>{owned.state=state;for(const token of waiters.values())setState(token,state);})).catch(error=>{
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
