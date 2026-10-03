import { authorizeOwnerRequest } from '@/lib/authorization';
import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { ensureVisitsTable } from '@/lib/visit-store';
import { consumeWindow } from '@/lib/security/limits';

export async function GET(request: Request) {
  const denied=await authorizeOwnerRequest(request,true);
  if(denied) return NextResponse.json({error:denied===401?'Unauthorized':'Forbidden'},{status:denied});
  const sql=getSql(); if(!sql) return NextResponse.json({error:'Database unavailable'},{status:503});
  try {
    if(!await consumeWindow(sql,'stats:shared',120,60)) return NextResponse.json({error:'RATE_LIMITED'},{status:429,headers:{'Retry-After':'60'}});
    await ensureVisitsTable();
    const [visitors]=await sql`SELECT COUNT(*)::int AS count FROM site_visits`;
    const [totals]=await sql`SELECT COUNT(*) FILTER(WHERE active=true)::int AS applications,
      COUNT(*) FILTER(WHERE active=true AND published=true)::int AS published,
      COALESCE(SUM(downloads),0)::bigint AS downloads,COALESCE(SUM(views),0)::bigint AS views FROM applications`;
    return NextResponse.json({visitors:visitors?.count??0,applications:totals?.applications??0,published:totals?.published??0,downloads:Number(totals?.downloads??0),views:Number(totals?.views??0)},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Database unavailable'},{status:503}); }
}
