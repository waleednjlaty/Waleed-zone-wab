'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
require('./helpers/typescript.cjs');
let entry;
const getSql=()=>async()=>entry?[entry]:[];
const prior=Module._load;
Module._load=function(request,...args){
  if(request==='server-only')return {};
  if(request==='@/lib/db')return {getSql};
  return prior.call(this,request,...args);
};
const {isSteamRipBotDownload}=require('../src/components/download/presentation.ts');
Module._load=prior;

test('SteamRIP and BZZHR published catalog downloads are redirected to bot',async()=>{
  for(const source of ['https://steamrip.com/example/','https://www.steamrip.com/qa/',
    'https://bzzhr.to/file_123','https://buzzheavier.com/file_123']) {
    entry={devupload_url:source,shrankme_url:null};
    assert.equal(await isSteamRipBotDownload(54),true,source);
  }
});
test('Telegram/manual and malformed lookalikes never become SteamRIP bot links',async()=>{
  for(const source of ['https://shrinkme.io/asset','https://devuploads.com/app',
    'https://steamrip.com.evil.example/game','http://steamrip.com/game',
    'https://buzzheavier.com.evil.example/abc']) {
    entry={devupload_url:source,shrankme_url:null};
    assert.equal(await isSteamRipBotDownload(54),false,source);
  }
  entry={devupload_url:null,shrankme_url:null};
  assert.equal(await isSteamRipBotDownload(54),false);
  entry=null;
  assert.equal(await isSteamRipBotDownload(54),false);
});
test('source routing uses original source even if SteamRIP item later receives a manual override',async()=>{
  entry={devupload_url:'https://steamrip.com/game/',shrankme_url:'https://shrinkme.io/manual'};
  assert.equal(await isSteamRipBotDownload(54),true);
});
