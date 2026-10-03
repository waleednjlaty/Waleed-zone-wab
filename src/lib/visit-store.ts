import { getSql } from '@/lib/db';
export function ensureVisitsTable() {
  const sql = getSql();
  if (!sql) throw new Error('Database unavailable');
  return sql`SELECT visitor_key,visit_day FROM site_visits LIMIT 0`;
}
