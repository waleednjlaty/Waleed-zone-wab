/** Native loopback fixture benchmark; refuses production/unknown databases. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import postgres from 'postgres';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('../tests/helpers/typescript.cjs');
const Module=require('node:module'),load=Module._load;Module._load=function(n,...a){return n==='server-only'?{}:load.call(this,n,...a);};
const {isGame,GAME_CATEGORY_PATTERN}=require('../src/components/catalog/presentation.ts');
const {rankDocuments}=require('../src/lib/search/rank.ts');Module._load=load;
const url=new URL(process.env.WZ_PERF_TEST_DATABASE_URL||'');
assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/wz_phase8_perf(?:_[a-z0-9]+)?$/);
const sql=postgres(url.href,{max:1,prepare:false,onnotice(){}});
try{
 const [r]=await sql`SELECT to_regclass('applications') AS present`;assert.ok(!r.present,'Empty disposable database required.');
 await sql.unsafe(`CREATE TABLE applications(id SERIAL PRIMARY KEY,name TEXT,category TEXT,active BOOLEAN,published BOOLEAN);
 INSERT INTO applications(name,category,active,published)
 SELECT 'Fixture '||s,CASE WHEN s%1000=0 THEN 'ألعاب' ELSE 'أدوات' END,s%100=0,s%100=0 FROM generate_series(1,100000) s;
 ANALYZE applications;`);
 const query='SELECT id,name,category FROM applications WHERE active=true AND published=true ORDER BY id DESC LIMIT 24';
 const explain=async q=>(await sql.unsafe('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q))[0]['QUERY PLAN'][0];
 const before=await explain(query);
 const categoryQuery="SELECT id FROM applications WHERE active=true AND published=true AND category='ألعاب' ORDER BY id DESC LIMIT 24";
 const categoryBefore=await explain(categoryQuery);
 for(const statement of readFileSync('migrations/004_phase8_indexes.sql','utf8').replace(/--[^\n]*/g,'').split(';').map(x=>x.trim()).filter(Boolean))await sql.unsafe(statement);
 await sql.unsafe('ANALYZE applications');const after=await explain(query);
 assert.ok(JSON.stringify(after).includes('applications_public_id_idx'));
 const category=await explain(categoryQuery);
 assert.ok(JSON.stringify(category).includes('applications_public_category_id_idx'));
 // Use the SAME pattern for SQL paging and JSX classification; Unicode/category parity.
 for(const name of ['ألعاب','العاب','أدوات','Music','GAMES','role-playing','action','gaming','لعبة','رياضة',null]){
  const [row]=await sql`SELECT coalesce(${name},'') ~* ${GAME_CATEGORY_PATTERN} AS game`;
  assert.equal(row.game,isGame({category:name}));
 }
 const total=(await sql`SELECT COUNT(*) AS n FROM applications WHERE active=true AND published=true`)[0].n;
 const rows=await sql.unsafe(query);assert.equal(rows.length,24);
 const search=[];
 for(const count of [100,1000,2000]){
  const docs=Array.from({length:count},(_,i)=>({id:i+1,name:i===0?'WhatsApp':'Fixture app '+i,category:'أدوات',downloads:0}));
  for(const q of ['واتساب','whatsap','WhatsApp']){
   const start=performance.now(),ranked=rankDocuments(docs,q);search.push({records:count,query:q,ms:Number((performance.now()-start).toFixed(2))});assert.equal(ranked[0]?.id,1);
  }
 }
 const result={fixture:'native PostgreSQL 16; 100000 total rows, 1% public; synthetic local timing only',
  catalog:{beforeRowsTransferred:Number(total),afterRowsTransferred:rows.length},
  publicQuery:{beforeExecutionMs:before['Execution Time'],afterExecutionMs:after['Execution Time'],beforePlan:before.Plan,afterPlan:after.Plan},
  categoryQuery:{beforeMs:categoryBefore['Execution Time'],afterMs:category['Execution Time'],beforePlan:categoryBefore.Plan,afterPlan:category.Plan},search};
 writeFileSync('docs/phase8-performance-results.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({beforeMs:before['Execution Time'],afterMs:after['Execution Time'],catalogBefore:Number(total),catalogAfter:rows.length,searchMaxMs:Math.max(...search.map(x=>x.ms))}));
}finally{await sql.end();}
