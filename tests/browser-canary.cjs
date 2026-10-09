'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {CANARY,requireCanaryDestination,requireCanaryHeaders}=require('../scripts/lib/browser-canary.cjs');
const headers={'content-length':'89','content-type':'text/plain; charset=utf-8','content-disposition':'attachment; filename="qa.txt"'};
test('operator canary binds exact owner-created file and refuses expiry',()=>{
 requireCanaryDestination('https://ts.buzzheavier.com/d/'+CANARY.id+'?v=fixture',CANARY.expires-1);
 assert.throws(()=>requireCanaryDestination('https://ts.buzzheavier.com/d/other?v=fixture',CANARY.expires-1));
 assert.throws(()=>requireCanaryDestination('https://ts.buzzheavier.com/d/'+CANARY.id+'?v=fixture',CANARY.expires));
});
test('GET must agree with HEAD size/MIME/attachment and refuse redirects or encoded files',()=>{
 requireCanaryHeaders(200,headers);
 for(const status of [204,302,403,429])assert.throws(()=>requireCanaryHeaders(status,headers));
 for(const change of [{'content-length':'139000000000'},{'content-length':undefined},{'content-length':'90'},{'content-type':'text/html'},{'content-disposition':'inline'},{'content-encoding':'gzip'}])assert.throws(()=>requireCanaryHeaders(200,{...headers,...change}));
});
