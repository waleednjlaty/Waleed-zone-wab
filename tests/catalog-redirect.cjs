'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {validateHeaderValue}=require('node:http');
require('./helpers/typescript.cjs');
const app={id:8,name:'جتا وادي الذئاب',category:'ألعاب'};
let routePath='';
const load=Module._load;
Module._load=function(name,...args){
 if(name==='server-only')return {};
 if(name==='@/lib/queries')return {getAppById:async id=>id===8?app:undefined,getAllAppsSitemap:async()=>[app],getCategories:async()=>[]};
 if(name==='next/headers')return {headers:async()=>new Headers({'x-wz-route':encodeURIComponent(routePath)})};
 if(name==='@/lib/auth')return {getCurrentUser:async()=>null};
 if(name==='next/navigation')return {
  notFound(){throw new Error('NOT_FOUND');},
  redirect(location){throw Object.assign(new Error('REDIRECT'),{location});},
  permanentRedirect(location){validateHeaderValue('location',location);throw Object.assign(new Error('REDIRECT'),{location});}
 };
 return load.call(this,name,...args);
};
const {resolveDetail}=require('../src/lib/catalog/resolve.ts');
const {appHref}=require('../src/lib/catalog/routes.ts');
const {enforceRouteAccess}=require('../src/lib/route-access.ts');
const sitemap=require('../src/app/sitemap.ts').default;
Module._load=load;
test('old raw Arabic canonical cannot be sent as an HTTP Location',()=>{
 assert.throws(()=>validateHeaderValue('location',appHref(app)),{code:'ERR_INVALID_CHAR'});
});
for(const slug of ['جتا-وادي-الذئاب-8',encodeURIComponent('جتا-وادي-الذئاب-8')])test('canonical Arabic route does not redirect '+slug,async()=>{
 assert.equal(await resolveDetail(slug,'games'),app);
});
test('stale Arabic slug redirects once to an encoded internal canonical',async()=>{
 await assert.rejects(resolveDetail('old-8','games'),error=>error.location===encodeURI(appHref(app)));
});
test('wrong catalog kind redirects to the encoded game route',async()=>{
 await assert.rejects(resolveDetail('جتا-وادي-الذئاب-8','apps'),error=>error.location===encodeURI(appHref(app)));
});
test('malformed encoding and missing application remain not found',async()=>{
 for(const slug of ['bad%zz-8','missing-99'])await assert.rejects(resolveDetail(slug,'games'),/NOT_FOUND/);
});
test('root pre-stream guard sends an encoded Arabic Location',async()=>{
 routePath='/games/old-8';
 await assert.rejects(enforceRouteAccess(),error=>error.location===encodeURI(appHref(app)));
 routePath=appHref(app);
 await enforceRouteAccess();
});
test('root pre-stream guard still denies anonymous account access',async()=>{
 routePath='/account';
 await assert.rejects(enforceRouteAccess(),error=>error.location==='/login');
});
test('Arabic sitemap destination uses the same serialized URL as canonical metadata',async()=>{
 const rows=await sitemap();
 const found=rows.find(row=>row.url.endsWith('-8'));
 assert.ok(found);assert.equal(found.url,new URL(appHref(app),found.url).href);
 assert.match(found.url,/%D8/);
});
