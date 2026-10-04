'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const normal={id:201,name:'Official utility',description:'Useful legitimate functionality and documented requirements. '.repeat(8),version:'1.0',platform:'Android',category:'Utilities',developer:'Known publisher',rights_basis:'open_source',published:true,status:'unreviewed',revision:1};
test('catalog audit phrases are manual review hints, never block or grant eligibility',async()=>{
 const {auditRecord,summarizeAudit}=await import('../scripts/lib/monetization-audit.mjs');
 for(const phrase of ['crack','Cracked','premium unlocked','paid unlocked','mod menu','keygen','DRM bypass','hack','cheat','pirated','license bypass','activation bypass','serial key','patched premium']){
  const row={...normal,description:normal.description+phrase};const before=JSON.stringify(row);
  assert.ok(auditRecord(row).includes('POLICY_PHRASE'),phrase);const value=summarizeAudit([row]);assert.equal(value.mode,'MANUAL_REVIEW_ONLY');assert.equal(value.summary.flagged,1);assert.equal(value.summary.blocked,0);assert.equal(value.summary.eligible,0);assert.equal(JSON.stringify(row),before);
 }
 assert.deepEqual(auditRecord(normal),[]);assert.equal(summarizeAudit([normal]).summary.unreviewed,1);
 for(const [field,value,flag] of [['description','short','SHORT_OR_MISSING_DESCRIPTION'],['version','','MISSING_VERSION'],['platform',null,'MISSING_PLATFORM'],['category',null,'MISSING_CATEGORY'],['developer',null,'MISSING_DEVELOPER'],['rights_basis','unknown','MISSING_RIGHTS_BASIS'],['name','Control\u0001','CONTROL_CHARACTERS'],['devupload_url','javascript:alert(1)','UNSUPPORTED_SCHEME'],['shrankme_url','https://evil.example/path?secret=not-printed','SUSPICIOUS_EXTERNAL_URL']])assert.ok(auditRecord({...normal,[field]:value}).includes(flag));
 assert.ok(!auditRecord({...normal,developer:null},{developerFieldPresent:false}).includes('MISSING_DEVELOPER'));
 const summary=summarizeAudit([{...normal,status:'eligible',reviewed_catalog_revision:1},{...normal,id:202,status:'blocked'},{...normal,id:203,status:'eligible',reviewed_catalog_revision:0},{...normal,id:204,published:false}]);
 assert.deepEqual(summary.summary,{total_published:3,eligible:1,blocked:1,unreviewed:1,flagged:0});
 const serialized=JSON.stringify(summarizeAudit([{...normal,devupload_url:'https://unknown.test/path?secret=sentinel'}]));assert.ok(!serialized.includes('sentinel')&&!serialized.includes('unknown.test'));
});
