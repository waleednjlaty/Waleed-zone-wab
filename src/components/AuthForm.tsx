'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { translateUI } from '@/lib/ui-translations';
import { useLocale } from '@/components/LocaleProvider';
export default function AuthForm({mode}:{mode:'login'|'register'}) {
  const locale=useLocale(),english=locale==='en';
  const router=useRouter(),register=mode==='register';
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError('');
    const form=new FormData(e.currentTarget);
    const payload={email:String(form.get('email')||''),password:String(form.get('password')||''),...(register?{name:String(form.get('name')||'')}:{})};
    try { const res=await fetch(`/api/auth/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
      const data=await res.json(); if(!res.ok) {setError(typeof data.error==='string' ? data.error : 'تعذّر إكمال الطلب');return;}
      router.push('/account');router.refresh();
    } catch { setError('تعذّر الاتصال. حاول مرة ثانية.'); } finally {setBusy(false);}
  }
  const [googleMessage,setGoogleMessage]=useState('');
  useEffect(()=>{
    const googleStatus=new URLSearchParams(window.location.search).get('google');
    const message=googleStatus==='cancelled' ? (english?'Google sign-in was cancelled.':'تم إلغاء تسجيل الدخول باستخدام Google.') :
      googleStatus==='not_configured' ? (english?'Google sign-in is not configured yet.':'تسجيل الدخول عبر Google لم يُفعّل بعد.') :
      googleStatus==='invalid_state' ? (english?'Security check failed. Please try again.':'فشل التحقق الأمني. حاول مرة أخرى.') :
      googleStatus==='unverified' ? (english?'Google could not verify this email.':'تعذّر التحقق من البريد الإلكتروني عبر Google.') :
      googleStatus==='rate_limited' ? (english?'Too many attempts. Please wait and try again.':'محاولات كثيرة، انتظر قليلًا ثم حاول مجددًا.') :
      googleStatus==='failed' ? (english?'Google sign-in failed. Please try again.':'فشل تسجيل الدخول باستخدام Google. حاول مجددًا.') : '';
    setGoogleMessage(message);
  },[english]);
  return <form onSubmit={submit} className="mt-8 space-y-5">
    {googleMessage&&<p role="alert" className="rounded-xl border border-[#e69078]/40 bg-[#e69078]/10 p-3 text-sm text-[#ffbea8]">{googleMessage}</p>}
    {register&&<label className="block text-sm font-bold">{english ? 'Display name' : 'اسم العرض'}<input className="field mt-2" name="name" type="text" minLength={2} maxLength={60} required autoComplete="name" placeholder={english ? 'The name you want to display' : 'الاسم الذي تحب ظهوره'}/></label>}
    <label className="block text-sm font-bold">{english ? 'Email' : 'البريد الإلكتروني'}<input className="field mt-2" name="email" type="email" maxLength={254} required autoComplete="email" dir="ltr" placeholder="name@example.com"/></label>
    <label className="block text-sm font-bold">{english ? 'Password' : 'كلمة المرور'}<input className="field mt-2" name="password" type="password" minLength={register?12:1} maxLength={128} required autoComplete={register?'new-password':'current-password'} dir="ltr" placeholder={register?(english?'At least 12 characters':'12 حرفًا على الأقل'):(english?'Password':'كلمة المرور')}/></label>
    {register&&<p className="text-xs leading-6 text-[#a6b5b8]">{english ? 'Your account saves favorites. Your email is never shown to visitors.' : 'حسابك يحفظ المفضلة. بريدك لا يظهر للزوار.'}</p>}
    {error&&<p role="alert" className="rounded-xl border border-[#e69078]/40 bg-[#e69078]/10 p-3 text-sm text-[#ffbea8]">{translateUI(locale,error)}</p>}
    <div className="relative my-5 flex items-center gap-3 text-xs text-[#a6b5b8] before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10"><span>{english ? 'OR' : 'أو'}</span></div>
    <a href="/api/auth/google" className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm font-bold text-[#f5f7fa] transition hover:border-white/30 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22c7e8]">
      <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 3.07 13.22l7.98 6.19C12.94 13.72 18.01 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.95 46.98 31.7 46.98 24.55Z"/><path fill="#FBBC05" d="M10.05 28.59A14.4 14.4 0 0 1 9.3 24c0-1.59.27-3.13.75-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.57 10.78l7.48-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.45-4.89 2.3-8.18 2.3-5.99 0-11.06-4.22-12.95-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
      <span>{english ? 'Continue with Google' : 'المتابعة باستخدام Google'}</span>
    </a>
    <button disabled={busy} className="primary-action w-full disabled:cursor-wait disabled:opacity-60" type="submit">{english ? (busy?'Please wait…':register?'Create account':'Sign in') : (busy?'لحظة...':register?'إنشاء حساب':'دخول إلى حسابي')} {english ? '→' : '←'}</button>
    <p className="text-center text-sm text-[#a6b5b8]">{english ? (register?'Already have an account?':'New here?') : (register?'عندك حساب؟':'جديد هون؟')} <Link className="font-bold text-[#d9f578] hover:underline" href={register?'/login':'/register'}>{english ? (register?'Sign in':'Create an account') : (register?'سجّل الدخول':'أنشئ حسابًا')}</Link></p>
  </form>;
}
