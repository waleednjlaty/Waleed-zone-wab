'use strict';
// One job per isolated child. Inherits only non-secret runtime settings from parent.
const Module=require('node:module'),{readFileSync}=require('node:fs'),{transformSync}=require('next/dist/build/swc');
require.extensions['.ts']=(module,file)=>module._compile(transformSync(readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code,file);
const load=Module._load;Module._load=function(name,...args){return name==='server-only'?{}:load.call(this,name,...args);};
const {browserDestination}=require('../src/lib/downloads/browser/engine.ts');
Module._load=load;
const controller=new AbortController();let started=false;
process.on('message',async message=>{
 if(message?.type==='cancel'){controller.abort();return;}
 if(started||message?.type!=='resolve')return;started=true;
 const timer=setTimeout(()=>controller.abort(),40000);
 try {const result=await browserDestination(message.input,{signal:controller.signal,progress:state=>process.send?.({type:'progress',state})});process.send?.({type:'result',result});}
 catch(error){process.send?.({type:'failure',code:error.code,stage:error.stage,host:error.host,upstreamStatus:error.upstreamStatus});}
 finally{clearTimeout(timer);process.disconnect?.();}
});
process.on('disconnect',()=>controller.abort());
