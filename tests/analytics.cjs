'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
require('./helpers/typescript.cjs');
const original=Module._load;Module._load=function(name,...args){if(name==='server-only')return {};return original.call(this,name,...args);};
const {recordMetric,METRICS,validMetric,metricFailureCategory}=require('../src/lib/analytics/metrics.ts');
const {OwnerAnalyticsService,analyticsWindow}=require('../src/lib/admin/analytics.ts');
const {publicContactEmail}=require('../src/lib/public-contact.ts');
Module._load=original;
test('metric diagnostics use finite categories and never copy driver data',()=>{
 for(const [code,category] of [['CONNECT_TIMEOUT','CONNECT_TIMEOUT'],['ETIMEDOUT','CONNECT_TIMEOUT'],['57014','STATEMENT_TIMEOUT'],['55P03','LOCK_TIMEOUT'],['42P01','SCHEMA_UNAVAILABLE'],['23514','CONSTRAINT_FAILURE'],['42501','PERMISSION_DENIED']])assert.equal(metricFailureCategory({code,message:'postgres://private:password@host/db?token=secret'}),category);
 for(const error of [null,new Error('postgres://secret'),{code:'DATABASE_URL=private'},{code:'__proto__'},{code:'constructor'}])assert.equal(metricFailureCategory(error),'UNKNOWN');
});
test('aggregate analytics: atomic increments, day/scope keys, validation and data minimization',{timeout:60000},async t=>{
 const h=await require('./admin/runtime.cjs').createFixture(t,{monetization:true});
 const options={sql:h.sql,date:'2026-10-04'};
 await t.test('atomic concurrent increments aggregate one application row',async()=>{
  assert.ok((await Promise.all(Array.from({length:20},()=>recordMetric('detail_view',201,options)))).every(Boolean));
  const rows=(await h.db.query("SELECT * FROM site_daily_metrics WHERE metric='detail_view'")).rows;assert.equal(rows.length,1);assert.equal(Number(rows[0].value),20);
 });
 await t.test('different dates and nullable site metric aggregate independently',async()=>{
  assert.equal(await recordMetric('detail_view',201,{...options,date:'2026-10-03'}),true);
  assert.equal(await recordMetric('detail_view',202,options),true);
  assert.equal(await recordMetric('catalog_view',null,options),true);assert.equal(await recordMetric('catalog_view',null,options),true);
  const rows=(await h.db.query('SELECT * FROM site_daily_metrics ORDER BY metric_date,metric,application_id')).rows;
  assert.equal(rows.length,4);assert.equal(Number(rows.find(row=>row.application_id===null).value),2);
 });
 await t.test('invalid metric/application/date never writes',async()=>{
  const before=JSON.stringify((await h.db.query('SELECT * FROM site_daily_metrics')).rows);
  for(const [metric,id] of [['ad_click',201],['detail_view',null],['catalog_view',201],['detail_view',0],['detail_view','201'],['detail_view',2147483648],['detail_view',999],['detail_view',22222],['anything',null]])assert.equal(await recordMetric(metric,id,options),false);
  assert.equal(validMetric('telegram_redirect',201),true);
  for(const date of ['2026-02-30','invalid','2026-1-1'])assert.equal(await recordMetric('detail_view',201,{...options,date}),false);
  assert.equal(JSON.stringify((await h.db.query('SELECT * FROM site_daily_metrics')).rows),before);
 });
 await t.test('table stores only aggregate fields; SQL failures are best effort',async()=>{
  assert.deepEqual((await h.db.query("SELECT column_name FROM information_schema.columns WHERE table_name='site_daily_metrics' ORDER BY ordinal_position")).rows.map(r=>r.column_name),['metric_date','metric','application_id','value']);
  assert.equal(METRICS.some(m=>/click|ip|agent|url|message|file/.test(m)),false);
  h.setFault('sql',true);assert.equal(await recordMetric('download_redeem',201,options),false);h.setFault('sql',false);
  await h.db.exec('ALTER TABLE site_daily_metrics RENAME TO qa_missing_metrics');assert.equal(await recordMetric('detail_view',201,options),false);await h.db.exec('ALTER TABLE qa_missing_metrics RENAME TO site_daily_metrics');
 });
 await t.test('bounded owner summary, event ratios, stable top ranking, UTC dates',async()=>{
  for(const [metric,id,times] of [['download_page_view',201,10],['download_redeem',201,4],['telegram_redirect',201,3],['detail_view',202,19],['download_redeem',202,4]])for(let i=0;i<times;i++)await recordMetric(metric,id,options);
  const service=new OwnerAnalyticsService(h.sql),value=await service.read(1,10,new Date('2026-10-04T23:59:00Z'));
  assert.equal(value.metrics.detail_view,40);assert.equal(value.metrics.download_page_view,10);assert.equal(value.metrics.download_redeem,8);assert.equal(value.metrics.telegram_redirect,3);
  assert.equal(value.conversions.detail_to_download,25);assert.equal(value.conversions.download_to_redeem,80);assert.equal(value.conversions.redeem_to_redirect,37.5);
  assert.deepEqual(value.top.map(r=>r.application_id),[201,202]);assert.equal((await service.read(7,1,new Date('2026-10-04'))).top.length,1);
  assert.equal((await service.read(7,10,new Date('2026-10-04'))).metrics.detail_view,41);
  for(const days of [0,91,1.5])await assert.rejects(service.read(days,10));
  for(const limit of [0,51,1.5])await assert.rejects(service.read(1,limit));
 });
 await t.test('actual admin API: owner-only, bounded parameters, no public write endpoint or leakage',async()=>{
  for(const actor of ['anonymous','visitor','expired'])assert.equal((await h.call('analytics',{actor})).status,actor==='visitor'?403:401);
  for(const query of ['?days=91','?days=0','?days=1&days=2','?limit=51','?metric=ad_click','?days=1%20OR%201=1'])assert.equal((await h.call('analytics',{query})).status,400);
  const response=await h.call('analytics',{query:'?days=90&limit=1'});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('x-robots-tag'),/noindex/);
  const data=await response.json();assert.equal(data.days,90);assert.equal(data.top.length<=1,true);assert.ok(!/postgres:|QA_PASSWORD|token_hash|telegram_message|raw_ip|destination_url/.test(JSON.stringify(data)));
  assert.equal((await h.call('analytics',{method:'POST',body:{metric:'detail_view',application_id:201}})).status,405);
  h.setFault('sql',true);const failed=await h.call('analytics');assert.ok(failed.status>=400);assert.ok(!(await failed.text()).includes('QA_DB_PASSWORD'));h.setFault('sql',false);
 });
});
test('public contact address uses explicit validated PUBLIC_CONTACT_EMAIL only',()=>{
 assert.equal(publicContactEmail({OWNER_EMAIL:'private@example.test'}),null);
 for(const value of ['','\r\nbcc:secret@example.test','bad','x@localhost','x@example.test?secret=1','a'.repeat(255)+'@example.test','foo..bar@example.test','foo.@example.test'])assert.equal(publicContactEmail({PUBLIC_CONTACT_EMAIL:value}),null);
 assert.equal(publicContactEmail({PUBLIC_CONTACT_EMAIL:'contact@example.test'}),'contact@example.test');
});
test('analytics query parser rejects duplicate or unknown fields',()=>{
 assert.deepEqual(analyticsWindow(new Request('https://test.example/api/admin/analytics')),{days:1,limit:10});
 assert.throws(()=>analyticsWindow(new Request('https://test.example/api/admin/analytics?days=1&limit=2&extra=1')));
});
