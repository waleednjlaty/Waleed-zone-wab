'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/components/LocaleProvider';
export default function FavoriteButton({appId,initialSaved,signedIn}:{appId:number;initialSaved:boolean;signedIn:boolean}) {
 const locale=useLocale(),english=locale==='en';
 const [saved,setSaved]=useState(initialSaved),[busy,setBusy]=useState(false),[error,setError]=useState<'save'|'network'|''>('');
 if(!signedIn) return <Link className="secondary-action w-full" href="/login">{english ? 'Sign in to save this app ♡' : 'سجّل دخولك لحفظ التطبيق ♡'}</Link>;
 return <div><button type="button" disabled={busy} aria-pressed={saved} onClick={async()=>{setBusy(true);setError('');try{const res=await fetch('/api/favorites',{method:saved?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId})});if(res.ok)setSaved(!saved);else setError('save');}catch{setError('network');}finally{setBusy(false);}}} className="secondary-action w-full disabled:opacity-50">{english ? (saved?'♥ Saved to my library':'♡ Add to my library') : (saved?'♥ محفوظ في مكتبتي':'♡ أضف إلى مكتبتي')}</button>{error&&<p role="alert" className="mt-2 text-xs text-[#ffbea8]">{english ? (error==='save'?'Could not save the change.':'Unable to connect.') : (error==='save'?'تعذّر حفظ التغيير.':'تعذّر الاتصال.')}</p>}</div>;
}
