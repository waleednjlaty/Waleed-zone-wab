import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { ensureVisitsTable } from '@/lib/visit-store';
import { SITE_URL } from '@/lib/site';
import { consumeWindow, requestNetwork } from '@/lib/security/limits';

export async function POST(request: Request) {
  const origin=request.headers.get('origin');
  // Railway may expose an internal request URL behind its public HTTPS proxy.
  const allowedOrigin = process.env.NODE_ENV === 'development'
    ? new URL(request.url).origin
    : new URL(SITE_URL).origin;
  if (origin && origin !== allowedOrigin) return NextResponse.json({error:'Forbidden'},{status:403});
  const fetchSite=request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin','none'].includes(fetchSite)) return NextResponse.json({error:'Forbidden'},{status:403});
  // The existing private database credential is a stable fallback on deployments
  // that have not configured an independent analytics key yet.
  const salt=process.env.VISIT_KEY_SALT || process.env.WEBSITE_STATS_TOKEN || process.env.DATABASE_URL;
  const sql=getSql();
  if (!salt || !sql) return NextResponse.json({ok:false},{status:503});
  // IP headers are supplied by the deployment proxy; never store their raw values.
  let ip: string;
  try { ip=requestNetwork(request,process.env); } catch { return NextResponse.json({ok:false},{status:503}); }
  const agent=(request.headers.get('user-agent') || 'unknown').slice(0,300);
  const day=new Date().toISOString().slice(0,10);
  const key=createHmac('sha256',salt).update(`${day}:${ip}:${agent}`).digest('hex');
  try {
    if(!await consumeWindow(sql,'visit:network:'+ip,600,60)) return NextResponse.json({ok:false},{status:429,headers:{'Retry-After':'60'}});
    await ensureVisitsTable();
    await sql`INSERT INTO site_visits (visitor_key,visit_day) VALUES (${key},${day}) ON CONFLICT (visitor_key,visit_day) DO NOTHING`;
    return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({ok:false},{status:503}); }
}
