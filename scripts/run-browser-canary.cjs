'use strict';
// One-shot runner for a credential-free container, never production web service.
const {spawn}=require('node:child_process'),{readFileSync}=require('node:fs');
if(['DATABASE_URL','LEGACY_DOWNLOAD_SIGNING_KEY','WEBSITE_STATS_TOKEN'].some(key=>process.env[key])) {
 console.error(JSON.stringify({area:'isolated_canary',status:'FAIL',code:'CANARY_REQUIRES_NO_PRODUCTION_SECRETS'}));process.exit(1);
}
function sample() {
 try {
  return {memory:Number(readFileSync('/sys/fs/cgroup/memory.current','utf8')),cpu:Number(readFileSync('/sys/fs/cgroup/cpu.stat','utf8').match(/^usage_usec (\d+)$/m)[1])};
 }catch{return null;}
}
const before=sample();let peak=before?.memory||0;
const meter=setInterval(()=>{const now=sample();if(now)peak=Math.max(peak,now.memory);},50);
function run(script) {
 return new Promise(resolve=>{
  const child=spawn(process.execPath,[script],{stdio:'inherit',detached:true});
  const timeout=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},55000);
  child.once('error',()=>{clearTimeout(timeout);resolve(1);});
  child.once('exit',code=>{clearTimeout(timeout);resolve(code===0?0:1);});
 });
}
(async()=>{
 try {
  await run('scripts/diagnose-provider-dns.cjs'); // Independent diagnostic, no DNS overrides.
  const smoke=await run('scripts/browser-smoke.cjs');
  process.exitCode=smoke||await run('scripts/test-browser-live.cjs');
 }finally {
  clearInterval(meter);const after=sample();
  console.log(JSON.stringify({area:'isolated_canary_resources',scope:'WHOLE_ISOLATED_CONTAINER',sample_interval_ms:50,
   peak_sampled_memory_bytes:before&&after?peak:null,cpu_usage_usec:before&&after?after.cpu-before.cpu:null}));
  if(process.argv.includes('--build-only')) {
   console.log(JSON.stringify({area:'isolated_canary',status:'NO_RUNTIME_DEPLOYMENT_BY_DESIGN',tests:process.exitCode?'FAIL':'PASS'}));
   // Railway builds are free; a deliberately failed final layer prevents image
   // deployment and all billable runtime, regardless of the test outcome.
   process.exitCode=1;
  }
 }
})().catch(()=>{clearInterval(meter);process.exitCode=1;});
