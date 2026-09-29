import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { ensureVisitsTable } from '@/lib/visit-store';

export async function POST(request: Request) {
  const origin=request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({error:'Forbidden'},{status:403});
  const fetchSite=request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin','none'].includes(fetchSite)) return NextResponse.json({error:'Forbidden'},{status:403});
  const salt=process.env.VISIT_KEY_SALT;
  const sql=getSql();
  if (!salt || !sql) return NextResponse.json({ok:false},{status:503});
  // IP headers are supplied by the deployment proxy; never store their raw values.
  const ip=(request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0,64);
  const agent=(request.headers.get('user-agent') || 'unknown').slice(0,300);
  const day=new Date().toISOString().slice(0,10);
  const key=createHmac('sha256',salt).update(`${day}:${ip}:${agent}`).digest('hex');
  try {
    await ensureVisitsTable();
    await sql`INSERT INTO site_visits (visitor_key,visit_day) VALUES (${key},${day}) ON CONFLICT (visitor_key,visit_day) DO NOTHING`;
    return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({ok:false},{status:503}); }
}
