'use client';
import { useState } from 'react';
import Link from 'next/link';
export default function FavoriteButton({appId,initialSaved,signedIn}:{appId:number;initialSaved:boolean;signedIn:boolean}) {
 const [saved,setSaved]=useState(initialSaved),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!signedIn) return <Link className="secondary-action w-full" href="/login">سجّل دخولك لحفظ التطبيق ♡</Link>;
 return <div><button type="button" disabled={busy} aria-pressed={saved} onClick={async()=>{setBusy(true);setError('');try{const res=await fetch('/api/favorites',{method:saved?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId})});if(res.ok)setSaved(!saved);else setError('تعذّر حفظ التغيير.');}catch{setError('تعذّر الاتصال.');}finally{setBusy(false);}}} className="secondary-action w-full disabled:opacity-50">{saved?'♥ محفوظ في مكتبتي':'♡ أضف إلى مكتبتي'}</button>{error&&<p role="alert" className="mt-2 text-xs text-[#ffbea8]">{error}</p>}</div>;
}
