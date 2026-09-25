import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const dynamic = 'force-dynamic';

function sameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const sql = getSql();
  if (!sql) return NextResponse.json({ ok: false }, { status: 503 });

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const agent = (request.headers.get('user-agent') || 'unknown').slice(0, 300);
  const visitorKey = createHash('sha256')
    .update(ip)
    .update('\0')
    .update(agent)
    .digest('hex');
  const day = new Date().toISOString().slice(0, 10);

  await sql`CREATE TABLE IF NOT EXISTS site_visits (
    id SERIAL PRIMARY KEY,
    visitor_key TEXT NOT NULL,
    visit_day DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(visitor_key, visit_day)
  )`;

  await sql`INSERT INTO site_visits (visitor_key, visit_day)
    VALUES (${visitorKey}, ${day})
    ON CONFLICT (visitor_key, visit_day) DO NOTHING`;

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
