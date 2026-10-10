'use strict';
// Explicit test preload only. Not imported by app runtime, no environment bypass flag.
// Mock only the finite provider fixture URLs; all other non-loopback connections fail.
const dns=require('node:dns/promises'),https=require('node:https'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const actualLookup=dns.lookup,actualRequest=https.request;
const hosts=new Set(['steamrip.com','bzzhr.to','fafda.to','ts.bzzhr.to']);
dns.lookup=async(host,options)=>hosts.has(host)?[{address:'8.8.8.8',family:4}]:actualLookup(host,options);
https.request=(url,options,callback)=>{
 const u=url instanceof URL?url:new URL(url);
 if(!hosts.has(u.hostname))return actualRequest(url,options,callback);
 const req=new EventEmitter();req.destroy=error=>{req.emit('error',error);req.emit('close');};
 req.end=()=>queueMicrotask(()=>{
  const socket=new EventEmitter();req.emit('socket',socket);socket.emit('secureConnect');
  const res=new PassThrough();res.statusCode=200;res.headers={};res.setTimeout=()=>{};
  let body='';
  if(u.href==='https://steamrip.com/qa-game/')body='<a href="https://bzzhr.to/file-xyz">BZZHR</a>';
  else if(u.href==='https://bzzhr.to/file-xyz')body='<a hx-get="/file-xyz/download?t=fixture">Download</a>';
  else if(u.href==='https://bzzhr.to/file-xyz/download?t=fixture')res.headers['hx-redirect']='https://fafda.to/d/file-xyz?v=QA_BROWSER_SECRET';
  else if(u.href==='https://fafda.to/d/file-xyz?v=QA_BROWSER_SECRET' && options.method==='HEAD')res.headers['content-type']='application/octet-stream';
  else if(u.href==='https://ts.bzzhr.to/d/file-xyz?v=QA_OWNER_BROWSER_SECRET' && options.method==='HEAD')res.headers['content-type']='application/octet-stream';
  else if(u.href==='https://ts.bzzhr.to/d/file-xyz?v=QA_OWNER_HEAD_BLOCKED' && options.method==='HEAD'){res.statusCode=403;}
  else{res.statusCode=404;}
  callback(res);res.end(body);req.emit('close');
 });return req;
};
require('../admin/network-guard.cjs');

// PGlite's protocol wrapper has one backend; isolate the optional metrics pool as
// an explicit outage fixture so it cannot interleave unnamed prepared statements.
// Analytics success and event semantics are covered by the real SQL unit suite.
const net=require('node:net'),write=net.Socket.prototype.write;
if(process.env.WZ_PGLITE_SOCKET_MODULE)net.Socket.prototype.write=function(data,...args){
 if(Buffer.isBuffer(data) && data.length>8 && data.readInt32BE(4)===196608 && data.includes(Buffer.from('statement_timeout')) && data.includes(Buffer.from('250'))){
  queueMicrotask(()=>this.destroy(new Error('Local fixture metrics outage')));return false;
 }
 return write.call(this,data,...args);
};
