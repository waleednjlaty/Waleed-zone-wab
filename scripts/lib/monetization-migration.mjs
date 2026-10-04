import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const migrationName='005_monetization.sql';
export async function applyMonetizationMigration(sql) {
  const content=readFileSync(new URL('../../migrations/'+migrationName,import.meta.url),'utf8');
  const checksum=createHash('sha256').update(content).digest('hex');
  // The runner owns one atomic transaction, including its checksum ledger.
  const body=content.replace(/\nBEGIN;(?=\nSET LOCAL)/,'\n').replace(/\nCOMMIT;\s*$/,'\n');
  if(body===content||/\nCOMMIT;\s*$/.test(body))throw Error('INVALID_MIGRATION_ENVELOPE');
  return sql.begin(async tx=>{
    await tx`SET LOCAL statement_timeout='30s'`;
    await tx`SELECT pg_advisory_xact_lock(748031005)`;
    await tx`CREATE TABLE IF NOT EXISTS site_schema_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())`;
    const [existing]=await tx`SELECT sha256 FROM site_schema_migrations WHERE name=${migrationName}`;
    if(existing){if(existing.sha256!==checksum)throw Error('CHECKSUM_MISMATCH');return 'already_applied';}
    await tx.unsafe(body);
    await tx`INSERT INTO site_schema_migrations(name,sha256) VALUES(${migrationName},${checksum})`;
    return 'applied';
  });
}
