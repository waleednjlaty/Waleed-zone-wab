const {readFileSync}=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const ts=require('typescript');
// React.cache is supplied by Next's RSC runtime, not the ordinary React 18 entry.
const load=Module._load;
Module._load=function(request,...args){const value=load.call(this,request,...args);
  return request==='react' && !value.cache ? {...value,cache:fn=>fn} : value;};
for(const extension of ['.ts','.tsx'])require.extensions[extension]=(module,file)=>module._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){return resolve.call(this,request.startsWith('@/')?path.join(__dirname,'../../src',request.slice(2)):request,parent,...rest);};
