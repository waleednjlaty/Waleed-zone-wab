import { NextResponse } from 'next/server';
import { allowAttempt,authDb,createSession,ensureAuthTables,normalizedEmail,readJson,sameOrigin,validEmail,verifyPassword } from '@/lib/auth';
export async function POST(request:Request) {
  if(!sameOrigin(request)) return NextResponse.json({error:'طلب غير مسموح'},{status:403});
  const data=await readJson(request); if(!data) return NextResponse.json({error:'بيانات غير صالحة'},{status:400});
  const email=normalizedEmail(data.email),password=data.password;
  if(!validEmail(email)||typeof password!=='string'||password.length>128) return NextResponse.json({error:'البريد أو كلمة المرور غير صحيحين'},{status:400});
  try { if(!await allowAttempt(request,'login',email,8,900)) return NextResponse.json({error:'محاولات كثيرة، حاول بعد 15 دقيقة'},{status:429,headers:{'Retry-After':'900'}});
    await ensureAuthTables();const sql=authDb();
    const [row]=await sql`SELECT id,password_hash FROM site_users WHERE email=${email} LIMIT 1`;
    // Always perform password work, including for unknown email addresses.
    const dummy='scrypt$16384$0123456789abcdef0123456789abcdef$'+ '0'.repeat(128);
    const valid=await verifyPassword(password,String(row?.password_hash||dummy));
    if(!row||!valid) return NextResponse.json({error:'البريد أو كلمة المرور غير صحيحين'},{status:401});
    await createSession(String(row.id));return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'تعذّر تسجيل الدخول الآن'},{status:503}); }
}
