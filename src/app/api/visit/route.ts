import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export async function POST(request: Request) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ ok: false }, { status: 503 });

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const agent = request.headers.get('user-agent') || 'unknown';
  const visitorKey = `${ip}:${agent}`.slice(0, 500);
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

  return NextResponse.json({ ok: true });
}
