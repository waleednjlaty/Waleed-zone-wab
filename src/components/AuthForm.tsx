'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
export default function AuthForm({mode}:{mode:'login'|'register'}) {
  const router=useRouter(),register=mode==='register';
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError('');
    const form=new FormData(e.currentTarget);
    const payload={email:String(form.get('email')||''),password:String(form.get('password')||''),...(register?{name:String(form.get('name')||'')}:{})};
    try { const res=await fetch(`/api/auth/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
      const data=await res.json(); if(!res.ok) {setError(data.error||'تعذّر إكمال الطلب');return;}
      router.push('/account');router.refresh();
    } catch { setError('تعذّر الاتصال. حاول مرة ثانية.'); } finally {setBusy(false);}
  }
  return <form onSubmit={submit} className="mt-8 space-y-5">
    {register&&<label className="block text-sm font-bold">اسم العرض<input className="field mt-2" name="name" type="text" minLength={2} maxLength={60} required autoComplete="name" placeholder="الاسم الذي تحب ظهوره"/></label>}
    <label className="block text-sm font-bold">البريد الإلكتروني<input className="field mt-2" name="email" type="email" maxLength={254} required autoComplete="email" dir="ltr" placeholder="name@example.com"/></label>
    <label className="block text-sm font-bold">كلمة المرور<input className="field mt-2" name="password" type="password" minLength={register?12:1} maxLength={128} required autoComplete={register?'new-password':'current-password'} dir="ltr" placeholder={register?'12 حرفًا على الأقل':'كلمة المرور'}/></label>
    {register&&<p className="text-xs leading-6 text-[#a6b5b8]">حسابك يحفظ المفضلة. بريدك لا يظهر للزوار.</p>}
    {error&&<p role="alert" className="rounded-xl border border-[#e69078]/40 bg-[#e69078]/10 p-3 text-sm text-[#ffbea8]">{error}</p>}
    <button disabled={busy} className="primary-action w-full disabled:cursor-wait disabled:opacity-60" type="submit">{busy?'لحظة...':register?'إنشاء حساب':'دخول إلى حسابي'} ←</button>
    <p className="text-center text-sm text-[#a6b5b8]">{register?'عندك حساب؟':'جديد هون؟'} <Link className="font-bold text-[#d9f578] hover:underline" href={register?'/login':'/register'}>{register?'سجّل الدخول':'أنشئ حسابًا'}</Link></p>
  </form>;
}
