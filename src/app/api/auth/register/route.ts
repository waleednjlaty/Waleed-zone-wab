import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { allowAttempt,authDb,createSession,ensureAuthTables,hashPassword,normalizedEmail,readJson,sameOrigin,validEmail,validPassword } from '@/lib/auth';
export async function POST(request:Request) {
  if(!sameOrigin(request)) return NextResponse.json({error:'طلب غير مسموح'},{status:403});
  const data=await readJson(request); if(!data) return NextResponse.json({error:'بيانات غير صالحة'},{status:400});
  const name=typeof data.name==='string'?data.name.trim().replace(/[\u0000-\u001f]/g,'').slice(0,60):'';
  const email=normalizedEmail(data.email),password=data.password;
  if(name.length<2||!validEmail(email)||!validPassword(password)) return NextResponse.json({error:'أدخل اسمًا وبريدًا صحيحين وكلمة مرور من 12 حرفًا على الأقل'},{status:400});
  try { if(!await allowAttempt(request,'register',email,5,3600)) return NextResponse.json({error:'محاولات كثيرة، حاول لاحقًا'},{status:429,headers:{'Retry-After':'3600'}});
    await ensureAuthTables(); const sql=authDb();
    const hash=await hashPassword(password),id=randomUUID();
    const rows=await sql`INSERT INTO site_users (id,name,email,password_hash) VALUES (${id},${name},${email},${hash}) ON CONFLICT (email) DO NOTHING RETURNING id`;
    if(!rows.length) return NextResponse.json({error:'البريد مستخدم من قبل. جرّب تسجيل الدخول'},{status:409});
    await createSession(id);
    return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'تعذّر إنشاء الحساب الآن'},{status:503}); }
}
