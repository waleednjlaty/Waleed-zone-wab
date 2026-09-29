import { NextResponse } from 'next/server';
import { allowAttempt,authDb,ensureAuthTables,getCurrentUser,readJson,sameOrigin } from '@/lib/auth';
import { getAppById } from '@/lib/queries';
async function change(request:Request,add:boolean) {
 if(!sameOrigin(request)) return NextResponse.json({error:'Forbidden'},{status:403});
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const data=await readJson(request),id=data?.appId;
 if(!Number.isInteger(id)||Number(id)<1||Number(id)>2147483647)return NextResponse.json({error:'Invalid application'},{status:400});
 try {if(!await allowAttempt(request,'favorite',user.id,60,3600))return NextResponse.json({error:'Too many requests'},{status:429});
  await ensureAuthTables();const sql=authDb();
  if(add){if(!await getAppById(Number(id)))return NextResponse.json({error:'Not found'},{status:404});await sql`INSERT INTO site_favorites(user_id,application_id) VALUES(${user.id},${Number(id)}) ON CONFLICT DO NOTHING`;}
  else await sql`DELETE FROM site_favorites WHERE user_id=${user.id} AND application_id=${Number(id)}`;
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Unavailable'},{status:503});}
}
export async function POST(request:Request){return change(request,true);}
export async function DELETE(request:Request){return change(request,false);}
