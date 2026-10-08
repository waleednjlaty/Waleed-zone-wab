'use strict';
/** Operator-only authorized tiny-file canary. No DB writes, fixture transport or URL logs. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),Module=require('node:module');
const {readFileSync}=require('node:fs'),{transformSync}=require('next/dist/build/swc');
require.extensions['.ts']=(module,file)=>module._compile(transformSync(readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,file);
const load=Module._load;Module._load=function(name,...args){return name==='server-only'?{}:load.call(this,name,...args);};
const {resolveBzzhr,BZZHR_HOSTS,BZZHR_FILE_HOSTS}=require('../src/lib/downloads/providers/bzzhr.ts');
const {publicHttp,publicUrl,requireProviderSuccess}=require('../src/lib/downloads/providers/public-http.ts');
Module._load=load;
(async()=>{
 const source=process.argv[2];publicUrl(source,BZZHR_HOSTS);
 const signal=AbortSignal.timeout(25000),destination=await resolveBzzhr(source,signal);
 const header=await publicHttp(destination,BZZHR_FILE_HOSTS,signal,{},true,'HEAD');requireProviderSuccess(header);
 // This canary is ONLY for our 89-byte public-domain QA file, never games/large files.
 assert.equal(header.headers['content-length'],'89');
 const file=await publicHttp(destination,BZZHR_FILE_HOSTS,signal);requireProviderSuccess(file);
 const bytes=Buffer.from(file.body,'utf8');assert.equal(bytes.length,89);
 const sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,'9ed9a2a5581029dd242caf417d58af6c4e1abff4795a55708bb63b9dc5a422c2');
 console.log(JSON.stringify({area:'provider_live_canary',status:'PASS',source_host:new URL(source).hostname,final_host:new URL(destination).hostname,bytes:89,sha256}));
})().catch(error=>{console.error(JSON.stringify({area:'provider_live_canary',status:'FAIL',category:/^[A-Z_]+$/.test(error.code||'')?error.code:'CANARY_FAILED',stage:error.stage,host:error.host,upstream_status:error.upstreamStatus}));process.exitCode=1;});
