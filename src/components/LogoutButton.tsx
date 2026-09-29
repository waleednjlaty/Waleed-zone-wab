'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export default function LogoutButton() { const router=useRouter(),[busy,setBusy]=useState(false);return <button disabled={busy} type="button" className="secondary-action" onClick={async()=>{setBusy(true);try { const r=await fetch('/api/auth/logout',{method:'POST'});if(r.ok){router.push('/');router.refresh();} }finally{setBusy(false);}}}>تسجيل الخروج</button>; }
