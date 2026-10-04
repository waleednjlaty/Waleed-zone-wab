// Review hints only. No classification, state transitions or network access.
const phrases=/\b(?:crack(?:ed)?|keygen|premium[\s_-]+unlocked|paid[\s_-]+unlocked|mod[\s_-]+menu|hack|cheat|bypass|DRM[\s_-]+bypass|pirated|license[\s_-]+bypass|activation[\s_-]+bypass|serial[\s_-]+key|patched[\s_-]+premium)\b/iu;
const controls=/[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const rights=new Set(['official','freeware','open_source','publisher_permission','owner_created','other_documented']);
const empty=value=>typeof value!=='string'||!value.trim();
export function auditRecord(record,{developerFieldPresent=true,allowedHosts=['t.me','devuploads.com','shrinkme.io','shrinkme.site','play.google.com','github.com','f-droid.org']}={}) {
  const flags=new Set();
  const textFields=['name','description','version','platform','category','developer','publisher'];
  const text=textFields.map(key=>typeof record[key]==='string'?record[key].slice(0,20000):'').join(' ').normalize('NFKC');
  if(phrases.test(text))flags.add('POLICY_PHRASE');
  if(textFields.some(key=>typeof record[key]==='string'&&record[key].length>20000))flags.add('TEXT_TOO_LONG');
  if(textFields.some(key=>controls.test(String(record[key]??''))))flags.add('CONTROL_CHARACTERS');
  if(empty(record.name))flags.add('MISSING_NAME');
  if(empty(record.description)||record.description.trim().length<200)flags.add('SHORT_OR_MISSING_DESCRIPTION');
  for(const key of ['version','platform','category'])if(empty(record[key]))flags.add('MISSING_'+key.toUpperCase());
  if(developerFieldPresent&&empty(record.developer)&&empty(record.publisher))flags.add('MISSING_DEVELOPER');
  if(!rights.has(record.rights_basis))flags.add('MISSING_RIGHTS_BASIS');
  for(const key of ['shrankme_url','devupload_url']){
    const raw=record[key];if(raw===null||raw===undefined||raw==='')continue;
    if(typeof raw!=='string'||raw.length>2048){flags.add('SUSPICIOUS_EXTERNAL_URL');continue;}
    if(controls.test(raw)||/\s/.test(raw))flags.add('CONTROL_OR_WHITESPACE_IN_URL');
    let url;try{url=new URL(raw);}catch{flags.add('INVALID_URL');continue;}
    if(url.protocol!=='https:')flags.add('UNSUPPORTED_SCHEME');
    if(url.username||url.password||url.port||url.hash||!allowedHosts.includes(url.hostname))flags.add('SUSPICIOUS_EXTERNAL_URL');
  }
  return [...flags].sort();
}
export function summarizeAudit(records,options){
  const summary={total_published:0,eligible:0,blocked:0,unreviewed:0,flagged:0},items=[];
  for(const row of records){
    if(row.published!==true)continue;summary.total_published++;
    const status=row.status==='eligible'&&String(row.reviewed_catalog_revision)===String(row.revision)?'eligible':row.status==='blocked'?'blocked':'unreviewed';
    summary[status]++;const flags=auditRecord(row,options);if(flags.length){summary.flagged++;items.push({application_id:row.id,flags});}
  }
  return {mode:'MANUAL_REVIEW_ONLY',summary,items};
}
