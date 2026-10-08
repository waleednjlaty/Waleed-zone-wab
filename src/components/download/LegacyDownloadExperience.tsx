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
  const [busy,setBusy] = useState(false),[error,setError] = useState(''),[sent,setSent] = useState(false);
  const deadline = useRef({ready:0,expires:0}), lock = useRef(false),heading = useRef<HTMLHeadingElement>(null),submitted=useRef(false);
  useEffect(()=>{
    if (!grant) return;
    const tick=()=>{
      const now=performance.now();
      if(now>=deadline.current.expires){setGrant(null);setError('انتهت صلاحية الطلب. أعد تجهيز الرابط.');return;}
      setRemaining(Math.max(0,Math.ceil((deadline.current.ready-now)/1000)));
    };
    tick(); const timer=setInterval(tick,250); return ()=>clearInterval(timer);
  },[grant]);
  useEffect(()=>{if(grant&&remaining===0)heading.current?.focus({preventScroll:true});},[grant,remaining]);
  async function prepare(){
    if(lock.current)return; lock.current=true;setBusy(true);setError('');setSent(false);submitted.current=false;
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
  const state=busy?'LOADING':error?'FAILED':sent?'PROCESSING':grant?remaining>0?'COUNTDOWN':'READY':'INITIAL';
  return <div className={`shell ${styles.page}`} data-download-state={state}>
    <nav className="detail-breadcrumbs" aria-label={t("مسار التنقل")}><ol><li><Link href="/">{t("الرئيسية")}</Link></li><li><Link href={app.detailHref}>{app.name}</Link></li><li aria-current="page">{t("التحميل")}</li></ol></nav>
    <header className={styles.header}><p className="eyebrow">WALEED ZONE</p><h1>{t("تحميل")} <bdi>{app.name}</bdi></h1><p>{provider==='telegram'?t("بعد التجهيز، سيفتح ملف التطبيق في قناة Telegram."):t("بعد التجهيز، سيفتح مصدر التحميل الحالي.")}</p></header>
    <div className={styles.layout}><aside className={styles.summary}><div className={styles.identity}><span className={styles.icon}><CoverImage src={app.imageUrl} alt={t("أيقونة {0}", app.name)} aspectClassName="aspect-square"/></span><h2 dir="auto">{app.name}</h2></div><dl><div><dt>{t("الإصدار")}</dt><dd dir="auto">{app.version||t("غير معروف")}</dd></div><div><dt>{t("الحجم")}</dt><dd dir="auto">{app.size||t("غير معروف")}</dd></div></dl><Link href={app.detailHref}>{t("تفاصيل التطبيق")}</Link></aside>
      <section className={styles.panel} aria-labelledby="legacy-status"><div className={styles.status}><h2 ref={heading} tabIndex={-1} id="legacy-status">{state==='COUNTDOWN'?t("رابطك قيد التجهيز"):state==='READY'?(provider==='steamrip'?t("جاهز لتجهيز الرابط"):t("رابط التحميل جاهز")):state==='PROCESSING'?t("جارٍ تجهيز المصدر والتحويل"):t("تجهيز رابط التحميل")}</h2>
      <p role="status" aria-live="polite">{t(error)|| (sent?(provider==='steamrip'?t("جارٍ العثور على BZZHR وتوليد رابط آمن على الخادم. نتيجة الطلب ستظهر في التبويب الجديد."):t("تابع نتيجة طلب التحميل في التبويب الجديد.")):busy?t("جارٍ التحقق من توفر التطبيق."):t("مهلة التجهيز 20 ثانية."))}</p>
      {grant&&remaining>0&&<><div className={styles.countdown} role="timer" aria-live="off"><strong>{remaining}</strong><span>{t("ثانية متبقية")}</span></div><progress className={styles.progress} max={20} value={20-remaining} aria-label={t("تقدم تجهيز الرابط")}/></>}</div>
      <div className={styles.actions}>{grant&&remaining===0&&!sent?<form action="/api/downloads/legacy/redeem" method="post" target="_blank" rel="noopener" onSubmit={event=>{
        event.preventDefault();
        if(submitted.current)return;submitted.current=true;
        // Launch the browser's native POST before React removes the form.
        event.currentTarget.submit();
        setTimeout(()=>setSent(true),0);
      }}><input type="hidden" name="application_id" value={app.id}/><input type="hidden" name="token" value={grant.token}/><button type="submit" className="primary-action">{provider==='telegram'?t("تحميل الملف عبر Telegram"):provider==='steamrip'?t("توليد رابط تحميل آمن"):t("فتح رابط التحميل")} ↓</button></form>:!grant||sent?<button type="button" className="primary-action" disabled={busy} onClick={()=>void prepare()}>{busy?t("جارٍ التحقق…"):sent?t("تجهيز طلب جديد"):t("تجهيز رابط التحميل")}</button>:<button type="button" disabled className="primary-action">{t("جارٍ التجهيز ·")} {remaining}  {t("ثانية")}</button>}
      <p className={styles.note}>{t("عند فشل المزود يمكنك إعادة الطلب من تبويب النتيجة. يفتح التحميل في تبويب جديد. إذا رفض الخادم الطلب، تظهر رسالة السبب في ذلك التبويب.")}</p></div></section></div>
  </div>;
}
