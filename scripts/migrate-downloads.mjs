import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

// Explicit operator command; no deployment or request-time migration hook.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the explicit migration command.');
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(748031001)`;
    await tx`CREATE TABLE IF NOT EXISTS site_schema_migrations (
      name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())`;
    const name = '001_downloads.sql';
    const content = readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    const [existing] = await tx`SELECT sha256 FROM site_schema_migrations WHERE name=${name}`;
    if (existing) {
      if (existing.sha256 !== hash) throw new Error('Applied migration checksum mismatch.');
      console.log('Download migration already applied.');
      return;
    }
    await tx.unsafe(content);
    await tx`INSERT INTO site_schema_migrations(name,sha256) VALUES(${name},${hash})`;
    console.log('Download migration applied; direct delivery remains disabled.');
  });
} finally { await sql.end(); }
