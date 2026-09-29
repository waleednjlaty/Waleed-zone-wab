import { getSql } from '@/lib/db';
// Initialize once per process. PostgreSQL's IF NOT EXISTS keeps concurrent starts safe.
let ready: Promise<void> | undefined;
export function ensureVisitsTable() {
  const sql = getSql();
  if (!sql) throw new Error('Database unavailable');
  ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS site_visits (
      id SERIAL PRIMARY KEY,
      visitor_key TEXT NOT NULL,
      visit_day DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(visitor_key, visit_day)
    )`;
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
