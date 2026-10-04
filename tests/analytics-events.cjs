'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
require('./helpers/typescript.cjs');
let callbacks=[],pageHeaders=new Headers();const original=Module._load;
Module._load=function(name,...args){
 if(name==='server-only')return {};
 if(name==='next/server')return {after:fn=>callbacks.push(fn)};
 if(name==='next/headers')return {headers:async()=>pageHeaders};
 return original.call(this,name,...args);
};
const metrics=require('../src/lib/analytics/metrics.ts');
const {schedulePageMetric,metricRequestAllowed}=require('../src/lib/analytics/schedule.ts');
const {createLegacyHandler}=require('../src/lib/delivery/http.ts');
Module._load=original;
test('server-side event hooks count only canonical renders and validated download successes',{timeout:60000},async t=>{
 const h=await require('./admin/runtime.cjs').createFixture(t,{monetization:true}),saved=metrics.recordMetric;
 const calls=[];metrics.recordMetric=async(metric,id)=>{calls.push({metric,id});return saved(metric,id,{sql:h.sql,date:'2026-10-04'});};
 t.after(()=>metrics.recordMetric=saved);
 const flush=async()=>{const queue=callbacks;callbacks=[];for(const fn of queue)await fn();};
 const origin=h.origin,env={NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:origin,FILES_CHANNEL_USERNAME:'files_channel',LEGACY_DOWNLOAD_SIGNING_KEY:'fixture-only-0123456789012345678901234567890123456789'};
 await h.db.exec("INSERT INTO site_delivery_sources(application_id,provider,telegram_channel_username,telegram_message_id) VALUES(201,'telegram','files_channel',123)");
 let now=Date.now();const request=(op,body,cookie='')=>createLegacyHandler(op,{sql:h.sql,env,now:()=>now})(new Request(origin+'/api/downloads/legacy/'+op,{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':op==='prepare'?'application/json':'application/x-www-form-urlencoded',cookie},body:op==='prepare'?JSON.stringify(body):new URLSearchParams(body)}));
 await t.test('canonical detail/download render events; previews and prefetch are skipped',async()=>{
  for(const [route,metric] of [['/apps/test-201','detail_view'],['/download/201','download_page_view']]){pageHeaders=new Headers({'x-wz-route':encodeURIComponent(route)});await schedulePageMetric(metric,201,route);}
  pageHeaders=new Headers({'x-wz-route':'/admin/preview'});await schedulePageMetric('detail_view',201,'/apps/test-201');
  pageHeaders=new Headers({'x-wz-route':'/apps/test-201','next-router-prefetch':'1'});await schedulePageMetric('detail_view',201,'/apps/test-201');
  assert.equal(metricRequestAllowed(new Headers({'sec-purpose':'prefetch'})),false);
  assert.equal(metricRequestAllowed(new Headers({'x-nextjs-draft-mode':'1'})),false);
  await flush();assert.deepEqual(calls.map(c=>c.metric),['detail_view','download_page_view']);
 });
 await t.test('failed/tampered/early requests do not count, success produces prepare/redeem/validated 303',async()=>{
  assert.equal((await request('prepare',{application_id:999})).status,404);assert.equal(callbacks.length,0);
  const prepared=await request('prepare',{application_id:201});assert.equal(prepared.status,200);
  const grant=await prepared.json(),cookie=prepared.headers.get('set-cookie').split(';')[0];await flush();assert.equal(calls.at(-1).metric,'download_prepare');
  assert.equal((await request('redeem',{application_id:201,token:'tampered'},cookie)).status,400);
  now=Date.parse(grant.ready_at)-1;assert.equal((await request('redeem',{application_id:201,token:grant.token},cookie)).status,425);assert.equal(callbacks.length,0);
  now++;const redeemed=await request('redeem',{application_id:201,token:grant.token},cookie);assert.equal(redeemed.status,303);assert.equal(redeemed.headers.get('location'),'https://t.me/files_channel/123');
  await flush();assert.deepEqual(calls.slice(-2),[{metric:'download_redeem',id:201},{metric:'telegram_redirect',id:201}]);
  const rows=(await h.db.query('SELECT metric,value FROM site_daily_metrics ORDER BY metric')).rows;
  assert.equal(rows.length,5);assert.ok(rows.every(r=>Number(r.value)===1));assert.ok(!JSON.stringify(rows).includes('files_channel'));
 });
 await t.test('metrics outage never prevents a valid prepare or exact Telegram 303',async()=>{
  await h.db.exec('ALTER TABLE site_daily_metrics RENAME TO qa_metrics_offline');
  const prepared=await request('prepare',{application_id:201});assert.equal(prepared.status,200);const grant=await prepared.json(),cookie=prepared.headers.get('set-cookie').split(';')[0];await flush();
  now=Date.parse(grant.ready_at);const result=await request('redeem',{application_id:201,token:grant.token},cookie);assert.equal(result.status,303);assert.equal(result.headers.get('location'),'https://t.me/files_channel/123');await flush();
 });
});
