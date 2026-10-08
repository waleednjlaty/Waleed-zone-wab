import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import postgres from 'postgres';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required for explicit operator migration.');
const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,connection:{lock_timeout:2000,statement_timeout:30000}});
try {
  await sql.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock(748031006)`;
    await tx`CREATE TABLE IF NOT EXISTS site_schema_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())`;
    const name='006_download_processing.sql',body=readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'),sha256=createHash('sha256').update(body).digest('hex');
    const [applied]=await tx`SELECT sha256 FROM site_schema_migrations WHERE name=${name}`;
    if(applied){if(applied.sha256!==sha256)throw new Error('Download processing migration checksum mismatch.');return;}
    // The transaction belongs to this runner; preserve SET LOCAL and all schema statements.
    await tx.unsafe(body.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
    await tx`INSERT INTO site_schema_migrations(name,sha256) VALUES(${name},${sha256})`;
  });
  console.log('Download processing migration verified/applied.');
}finally{await sql.end();}
