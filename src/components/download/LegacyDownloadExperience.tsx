'use client';
import { useTranslateUI } from '@/components/LocaleProvider';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import CoverImage from '@/components/CoverImage';
import type { DownloadApp } from './types';
import styles from './download.module.css';
type Grant = { token: string; ready_at: string; expires_at: string; server_time: string };
export default function LegacyDownloadExperience({app,provider}:{app:DownloadApp;provider:'telegram'|'external'|'steamrip'}) {
  const t = useTranslateUI();

  const [grant,setGrant] = useState<Grant|null>(null), [remaining,setRemaining] = useState(0);
  const [busy,setBusy] = useState(false),[error,setError] = useState(''),[sent,setSent] = useState(false),[resolving,setResolving]=useState(false),[sourceUrl,setSourceUrl]=useState('');
  const deadline = useRef({ready:0,expires:0}), lock = useRef(false),heading = useRef<HTMLHeadingElement>(null),submitted=useRef(false);
  useEffect(()=>{
    if (!grant) return;
    const tick=()=>{
      const now=performance.now();
      if(!submitted.current && now>=deadline.current.expires){setGrant(null);setError('انتهت صلاحية الطلب. أعد تجهيز الرابط.');return;}
      setRemaining(Math.max(0,Math.ceil((deadline.current.ready-now)/1000)));
    };
    tick(); const timer=setInterval(tick,250); return ()=>clearInterval(timer);
  },[grant]);
  useEffect(()=>{if(grant&&remaining===0)heading.current?.focus({preventScroll:true});},[grant,remaining]);
  async function prepare(){
    if(lock.current)return; lock.current=true;setBusy(true);setError('');setSent(false);setSourceUrl('');submitted.current=false;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const start=performance.now();
      const response=await fetch('/api/downloads/legacy/prepare',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/json'},body:JSON.stringify({application_id:app.id})});
      if(!response.ok)throw new Error(response.status===429?'طلبات كثيرة. انتظر دقيقة ثم أعد المحاولة.':'تعذر تجهيز الطلب. تحقق من توفر التطبيق ثم أعد المحاولة.');
      const data=await response.json() as Grant,server=Date.parse(data.server_time),ready=Date.parse(data.ready_at),expires=Date.parse(data.expires_at);
      if(typeof data.token!=='string'||data.token.length>1000||!Number.isFinite(server)||ready-server!==20000||expires-ready!==180000)throw new Error('استجابة غير صالحة.');
      // Conservative local display. Server independently rechecks the exact deadline.
      deadline.current={ready:Math.max(start,performance.now())+ready-server,expires:performance.now()+expires-server};
      setRemaining(20);setGrant(data);
    }catch(e){setError(e instanceof Error&&e.name!=='AbortError'?e.message:'انتهت مهلة الاتصال. أعد المحاولة.');}
    finally{clearTimeout(timer);setBusy(false);lock.current=false;}
  }
  async function redeem(form: HTMLFormElement){
    if(submitted.current||!grant||remaining>0)return;
    submitted.current=true;setResolving(true);setError('');setSourceUrl('');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
    try {
      const response=await fetch(form.action,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({application_id:String(app.id),token:grant.token})});
      const data=await response.json();
      if(!response.ok){
        // Stable public source supplied only after server eligibility. No signatures in failures.
        if(typeof data.error?.source_url==='string')setSourceUrl(data.error.source_url);
        throw new Error(data.error?.message||'تعذر تنفيذ طلب التحميل.');
      }
      if(typeof data.destination!=='string'||data.destination.length>4096||new URL(data.destination).protocol!=='https:')throw new Error('استجابة غير صالحة.');
      setSent(true);
      // Attachment responses keep this UI; upstream HTML may navigate this same tab.
      // Browser transport/completion cannot be observed across origins.
      window.location.assign(data.destination);
    }catch(e){setError(e instanceof Error&&e.name!=='AbortError'?e.message:'انتهت مهلة الاتصال. أعد المحاولة.');submitted.current=false;}
    finally{clearTimeout(timer);setResolving(false);}
  }
  const state=busy?'PREPARING':resolving?'RESOLVING':error?'FAILED':sent?'DOWNLOADING':grant?remaining>0?'COUNTDOWN':'READY':'INITIAL';
  return <div className={`shell ${styles.page}`} data-download-state={state}>
    <nav className="detail-breadcrumbs" aria-label={t("مسار التنقل")}><ol><li><Link href="/">{t("الرئيسية")}</Link></li><li><Link href={app.detailHref}>{app.name}</Link></li><li aria-current="page">{t("التحميل")}</li></ol></nav>
    <header className={styles.header}><p className="eyebrow">WALEED ZONE</p><h1>{t("تحميل")} <bdi>{app.name}</bdi></h1><p>{provider==='telegram'?t("بعد التجهيز، سيفتح ملف التطبيق في قناة Telegram."):t("نعالج المصدر هنا، ثم يبدأ المتصفح التنزيل في التبويب نفسه.")}</p></header>
    <div className={styles.layout}><aside className={styles.summary}><div className={styles.identity}><span className={styles.icon}><CoverImage src={app.imageUrl} alt={t("أيقونة {0}", app.name)} aspectClassName="aspect-square"/></span><h2 dir="auto">{app.name}</h2></div><dl><div><dt>{t("الإصدار")}</dt><dd dir="auto">{app.version||t("غير معروف")}</dd></div><div><dt>{t("الحجم")}</dt><dd dir="auto">{app.size||t("غير معروف")}</dd></div></dl><Link href={app.detailHref}>{t("تفاصيل التطبيق")}</Link></aside>
      <section className={styles.panel} aria-labelledby="legacy-status"><div className={styles.status}><h2 ref={heading} tabIndex={-1} id="legacy-status">{state==='COUNTDOWN'?t("رابطك قيد التجهيز"):state==='READY'?(provider==='steamrip'?t("جاهز لتجهيز الرابط"):t("رابط التحميل جاهز")):state==='RESOLVING'?t("جارٍ معالجة مصدر التحميل"):state==='DOWNLOADING'?t("تم إرسال طلب التنزيل إلى المتصفح"):t("تجهيز رابط التحميل")}</h2>
      <p role="status" aria-live="polite">{t(error)|| (resolving?t("جارٍ استخراج رابط جديد والتحقق من المضيف النهائي."):sent?t("تحقق من قائمة التنزيلات في متصفحك. لا يمكن للموقع تأكيد اكتمال الملف."):busy?t("جارٍ التحقق من توفر التطبيق."):t("مهلة التجهيز 20 ثانية."))}</p>
      {sourceUrl&&<p><a href={sourceUrl} rel="noreferrer">{t("فتح المصدر يدويًا في التبويب نفسه")}</a> — {t("التحقق البشري في متصفحك لا يفتح جلسة الخادم. اختر مصدرًا آخر إذا استمر الحظر.")}</p>}
      {grant&&remaining>0&&<><div className={styles.countdown} role="timer" aria-live="off"><strong>{remaining}</strong><span>{t("ثانية متبقية")}</span></div><progress className={styles.progress} max={20} value={20-remaining} aria-label={t("تقدم تجهيز الرابط")}/></>}</div>
      <div className={styles.actions}>{grant&&remaining===0&&!sent?<form action="/api/downloads/legacy/redeem" method="post" onSubmit={event=>{
        event.preventDefault();void redeem(event.currentTarget);
      }}><input type="hidden" name="application_id" value={app.id}/><input type="hidden" name="token" value={grant.token}/><button disabled={resolving} type="submit" className="primary-action">{resolving?t("جارٍ معالجة مصدر التحميل"):error?t("إعادة المحاولة"):provider==='telegram'?t("تحميل الملف عبر Telegram"):t("بدء التحميل")} ↓</button></form>:!grant||sent?<button type="button" className="primary-action" disabled={busy} onClick={()=>void prepare()}>{busy?t("جارٍ التحقق…"):sent?t("تجهيز طلب جديد"):t("تجهيز رابط التحميل")}</button>:<button type="button" disabled className="primary-action">{t("جارٍ التجهيز ·")} {remaining}  {t("ثانية")}</button>}
      <p className={styles.note}>{t("يبقى الموقع ظاهرًا أثناء المعالجة. عند بدء التنزيل قد ينقلك المضيف في التبويب نفسه إذا لم يرسل الملف كمرفق.")}</p></div></section></div>
  </div>;
}
