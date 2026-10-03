import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

// Explicit operator/pre-deploy command only. Never called from build/start/request paths.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the explicit runtime-security migration command.');

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const lock = 748031003;
try {
  await sql`SELECT pg_advisory_lock(${lock})`;
  await sql`CREATE TABLE IF NOT EXISTS site_schema_migrations (
    name TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  )`;

  const name = '003_runtime_security.sql';
  const content = readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  const [existing] = await sql`SELECT sha256 FROM site_schema_migrations WHERE name=${name}`;

  if (existing) {
    if (existing.sha256 !== hash) throw new Error('Applied runtime-security migration checksum mismatch.');
    console.log('Runtime security migration already applied.');
  } else {
    await sql.unsafe(content);
    await sql`INSERT INTO site_schema_migrations(name,sha256) VALUES(${name},${hash})`;
    console.log('Runtime security migration applied.');
  }
} finally {
  try { await sql`SELECT pg_advisory_unlock(${lock})`; } catch {}
  await sql.end();
}
