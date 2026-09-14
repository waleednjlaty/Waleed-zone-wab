import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export async function GET(request: Request) {
  const token = process.env.WEBSITE_STATS_TOKEN;
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = getSql();
  if (!sql) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  await sql`CREATE TABLE IF NOT EXISTS site_visits (
    id SERIAL PRIMARY KEY,
    visitor_key TEXT NOT NULL,
    visit_day DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(visitor_key, visit_day)
  )`;
  const [visitors] = await sql`SELECT COUNT(*)::int AS count FROM site_visits`;
  const [apps] = await sql`SELECT COUNT(*)::int AS count FROM applications WHERE active = true`;
  const [published] = await sql`SELECT COUNT(*)::int AS count FROM applications WHERE published = true`;
  const [totals] = await sql`SELECT COALESCE(SUM(downloads), 0)::int AS downloads, COALESCE(SUM(views), 0)::int AS views FROM applications`;

  return NextResponse.json({
    visitors: visitors?.count ?? 0,
    applications: apps?.count ?? 0,
    published: published?.count ?? 0,
    downloads: totals?.downloads ?? 0,
    views: totals?.views ?? 0,
  });
}
