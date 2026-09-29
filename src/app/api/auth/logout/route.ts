import { NextResponse } from 'next/server';
import { destroySession,sameOrigin } from '@/lib/auth';
export async function POST(request:Request) {
  if(!sameOrigin(request)) return NextResponse.json({error:'Forbidden'},{status:403});
  try { await destroySession();return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}}); }
  catch { return NextResponse.json({error:'Try again'},{status:503}); }
}
