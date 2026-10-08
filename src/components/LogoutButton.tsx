'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale } from '@/components/LocaleProvider';
export default function LogoutButton() {
  const locale=useLocale(),english=locale==='en';
  const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  return <div><button disabled={busy} type="button" className="secondary-action" onClick={async()=>{
    setBusy(true);setError(false);
    try {
      const response=await fetch('/api/auth/logout',{method:'POST'});
      if(response.ok){router.push('/');router.refresh();}else setError(true);
    }catch{setError(true);}finally{setBusy(false);}
  }}>{english ? 'Sign out' : 'تسجيل الخروج'}</button>
  {error&&<p role="alert" className="mt-2 text-sm text-[#ffbea8]">{english ? 'Unable to sign out. Try again shortly.' : 'تعذّر تسجيل الخروج. حاول مجددًا بعد قليل.'}</p>}</div>;
}
