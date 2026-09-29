import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { ensureVisitsTable } from '@/lib/visit-store';

export async function GET(request: Request) {
  const token=process.env.WEBSITE_STATS_TOKEN;
  const supplied=request.headers.get('authorization') || '';
  const expected=token ? `Bearer ${token}` : '';
  const a=Buffer.from(supplied), b=Buffer.from(expected);
  if (!token || a.length!==b.length || !timingSafeEqual(a,b)) return NextResponse.json({error:'Unauthorized'},{status:401});
  const sql=getSql(); if(!sql) return NextResponse.json({error:'Database unavailable'},{status:503});
  try {
    await ensureVisitsTable();
    const [visitors]=await sql`SELECT COUNT(*)::int AS count FROM site_visits`;
    const [apps]=await sql`SELECT COUNT(*)::int AS count FROM applications WHERE active = true`;
    const [published]=await sql`SELECT COUNT(*)::int AS count FROM applications WHERE active = true AND published = true`;
    const [totals]=await sql`SELECT COALESCE(SUM(downloads),0)::bigint AS downloads,COALESCE(SUM(views),0)::bigint AS views FROM applications`;
    return NextResponse.json({visitors:visitors?.count??0,applications:apps?.count??0,published:published?.count??0,downloads:Number(totals?.downloads??0),views:Number(totals?.views??0)},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Database unavailable'},{status:503}); }
}
