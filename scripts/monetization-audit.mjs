import postgres from 'postgres';
import {summarizeAudit} from './lib/monetization-audit.mjs';
// Explicit read-only operator command. No production execution is part of this task.
if(!process.env.DATABASE_URL){console.error('Monetization audit: DATABASE_URL_REQUIRED');process.exitCode=1;}
else {
  const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,connect_timeout:5});
  try{
    const result=await sql.begin('read only',async tx=>{
      await tx`SET LOCAL statement_timeout='5s'`;
      const columns=await tx`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='applications'`;
      const available=new Set(columns.map(row=>row.column_name));
      const [schema]=await tx`SELECT to_regclass('site_ad_eligibility') AS eligibility`;
      const optional=['name','description','version','platform','category','developer','publisher','shrankme_url','devupload_url'].map(key=>available.has(key)?`a.${key}`:`NULL::text AS ${key}`).join(',');
      const review=schema.eligibility?'e.status,e.rights_basis,e.reviewed_catalog_revision':'NULL::text AS status,NULL::text AS rights_basis,NULL::bigint AS reviewed_catalog_revision';
      const join=schema.eligibility?'LEFT JOIN site_ad_eligibility e ON e.application_id=a.id':'';
      const rows=[];
      for await(const batch of tx.unsafe(`SELECT a.id,a.published,a.revision,${optional},${review} FROM applications a ${join} WHERE a.published=true ORDER BY a.id`).cursor(100))rows.push(...batch);
      return summarizeAudit(rows,{developerFieldPresent:available.has('developer')||available.has('publisher')});
    });
    console.log(JSON.stringify(result,null,2));
  }catch{console.error('Monetization audit: UNAVAILABLE (no records changed)');process.exitCode=1;}
  finally{await sql.end();}
}
