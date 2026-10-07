'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('download-processing migration is additive, repeatable, bounded and preserves catalog',async t=>{
 const db=await PGlite.create();t.after(()=>db.close());
 await db.exec(`CREATE TABLE applications(id INTEGER PRIMARY KEY,name TEXT,revision BIGINT,active BOOLEAN,published BOOLEAN,shrankme_url TEXT,devupload_url TEXT); INSERT INTO applications VALUES(1,'Legacy',5,true,true,'https://shrinkme.io/old','https://steamrip.com/qa/');`);
 await db.exec('CREATE TABLE site_visits(visit_day DATE)');
 await db.exec(readFileSync('migrations/005_monetization.sql','utf8'));
 const before=(await db.query('SELECT * FROM applications')).rows,body=readFileSync('migrations/006_download_processing.sql','utf8');
 await db.exec(body);await db.exec(body);assert.deepEqual((await db.query('SELECT * FROM applications')).rows,before);
 await db.exec("INSERT INTO site_daily_metrics(metric_date,metric,application_id,value) VALUES('2026-10-07','external_download_redirect',1,1),('2026-10-07','telegram_redirect',1,1)");
 await assert.rejects(db.exec("INSERT INTO site_daily_metrics(metric_date,metric,application_id,value) VALUES('2026-10-07','arbitrary_metric',1,1)"));
 assert.match(body,/SET LOCAL lock_timeout='2s'/);assert.match(body,/SET LOCAL statement_timeout='30s'/);
 const runner=readFileSync('scripts/migrate-download-processing.mjs','utf8');assert.match(runner,/sha256/);assert.match(runner,/checksum mismatch/);assert.match(runner,/pg_advisory_xact_lock/);
});
