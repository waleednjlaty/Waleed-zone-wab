import { NextResponse } from 'next/server';
import { getAppById } from '@/lib/queries';
import { SITE_URL } from '@/lib/site';
import { appHref } from '@/lib/catalog/routes';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const app=/^\d{1,10}$/.test(id)?await getAppById(Number(id)):undefined;
  if(!app)return new NextResponse('Not found',{status:404});
  return NextResponse.redirect(new URL(appHref(app),SITE_URL),308);
}
