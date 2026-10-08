'use strict';
/** Operator-only authorized tiny-file canary. No DB writes, fixture transport or URL logs. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),Module=require('node:module');
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
assert.ok(!process.env.NODE_OPTIONS&&!process.env.WZ_FINAL_PROVIDER_FIXTURES,'Live canary cannot use fixture transport.');
const {readFileSync}=require('node:fs'),{transformSync}=require('next/dist/build/swc');
require.extensions['.ts']=(module,file)=>module._compile(transformSync(readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}}).code,file);
const load=Module._load;Module._load=function(name,...args){return name==='server-only'?{}:load.call(this,name,...args);};
const {resolveBzzhr,BZZHR_HOSTS,BZZHR_FILE_HOSTS}=require('../src/lib/downloads/providers/bzzhr.ts');
const {publicHttp,publicUrl,requireProviderSuccess}=require('../src/lib/downloads/providers/public-http.ts');
Module._load=load;
(async()=>{
 const source=process.argv[2];const url=publicUrl(source,BZZHR_HOSTS);
 const expected=url.pathname==='/8hcdyeypd460'?{bytes:67,sha256:'6c2b4eccbe5ad9d248f33983d466fefd5e619046320f429f78dd486c578496bc'}:{bytes:expected.bytes,sha256:'9ed9a2a5581029dd242caf417d58af6c4e1abff4795a55708bb63b9dc5a422c2'};
 assert.ok(['/8hcdyeypd460','/724hyjkckpyu'].includes(url.pathname)&&!url.search,'Only authorized operator canaries may be downloaded.');
 const signal=AbortSignal.timeout(25000),destination=await resolveBzzhr(source,signal);
 const header=await publicHttp(destination,BZZHR_FILE_HOSTS,signal,{},true,'HEAD');requireProviderSuccess(header);
 // This canary is ONLY for our tiny owner-created UTF-8 QA files, never games/large files.
 assert.equal(Number(header.headers['content-length']),expected.bytes);
 const file=await publicHttp(destination,BZZHR_FILE_HOSTS,signal);requireProviderSuccess(file);
 const bytes=Buffer.from(file.body,'utf8');assert.equal(bytes.length,expected.bytes);
 const sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,expected.sha256);
 console.log(JSON.stringify({area:'provider_live_canary',status:'PASS',source_host:new URL(source).hostname,final_host:new URL(destination).hostname,bytes:expected.bytes,sha256}));
})().catch(error=>{console.error(JSON.stringify({area:'provider_live_canary',status:'FAIL',category:/^[A-Z_]+$/.test(error.code||'')?error.code:'CANARY_FAILED',stage:error.stage,host:error.host,upstream_status:error.upstreamStatus}));process.exitCode=1;});
