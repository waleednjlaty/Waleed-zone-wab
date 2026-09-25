import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

const VISIT_KEY_SALT = process.env.VISIT_KEY_SALT || 'waleed-zone-analytics-v1';

export async function POST(request: Request) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ ok: false }, { status: 503 });

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const agent = (request.headers.get('user-agent') || 'unknown').slice(0, 300);
  const day = new Date().toISOString().slice(0, 10);

  // Store a one-way daily identifier instead of raw IP/user-agent data.
  const visitorKey = createHash('sha256')
    .update(VISIT_KEY_SALT + ':' + day + ':' + ip + ':' + agent)
    .digest('hex');

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
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}
