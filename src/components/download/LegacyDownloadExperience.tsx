'use client';
import { useTranslateUI } from '@/components/LocaleProvider';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import CoverImage from '@/components/CoverImage';
import type { DownloadApp } from './types';
import styles from './download.module.css';
type Grant = { token: string; ready_at: string; expires_at: string; server_time: string; owner_test?: {verification: 'verified'|'owner_unverified';expires_at:string} };
export default function LegacyDownloadExperience({app,provider}:{app:DownloadApp;provider:'telegram'|'external'|'steamrip'}) {
  const t = useTranslateUI();

  const [grant,setGrant] = useState<Grant|null>(null), [remaining,setRemaining] = useState(0);
  const [browserState,setBrowserState]=useState('');
  const activeRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>activeRequest.current?.abort(),[]);
  const [busy,setBusy] = useState(false),[error,setError] = useState(''),[sent,setSent] = useState(false),[resolving,setResolving]=useState(false),[sourceUrl,setSourceUrl]=useState(''),[providerBlocked,setProviderBlocked]=useState(false);
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
    if(lock.current)return; lock.current=true;setBusy(true);setError('');setSent(false);setSourceUrl('');setProviderBlocked(false);submitted.current=false;
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
    submitted.current=true;setBrowserState('');setResolving(true);setError('');setSourceUrl('');setProviderBlocked(false);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);activeRequest.current=controller;
    let pollTimer:ReturnType<typeof setTimeout>|undefined;
    const poll=async()=>{
      try {
        const response=await fetch('/api/downloads/legacy/status',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
          headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({application_id:String(app.id),token:grant.token})});
        if(!response.ok)return;
        const data=await response.json();
        if(['USING_CACHED_LINK','BROWSER_STARTING','OPENING_SOURCE','FINDING_BZZHR','RESOLVING_DOWNLOAD','VERIFYING_FILE','PROVIDER_CHALLENGE','FAILED'].includes(data.state))setBrowserState(data.state);
        if(!controller.signal.aborted)pollTimer=setTimeout(()=>void poll(),2000);
      }catch{/* main redemption owns failure presentation */}
    };
    if(provider==='steamrip')pollTimer=setTimeout(()=>void poll(),1500);
    try {
      const response=await fetch(form.action,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({application_id:String(app.id),token:grant.token})});
      const data=await response.json();
      if(!response.ok){
        // A stable, public original source is available only after server-side eligibility.
        // Cloudflare verification must happen in the visitor's own browser, never on Railway.
        const barrier=['PROVIDER_CHALLENGE','PROVIDER_AUTH_REQUIRED','PROVIDER_FORBIDDEN'].includes(data.error?.code);
        if(data.error?.code==='PROVIDER_CHALLENGE')setBrowserState('PROVIDER_CHALLENGE');
        setProviderBlocked(barrier);
        if(barrier && typeof data.error?.source_url==='string')try {
          const url=new URL(data.error.source_url);
          const host=url.hostname;
          const stablePage=url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash
            && (['steamrip.com','www.steamrip.com'].includes(host)?/^\/[A-Za-z0-9-]+\/?$/.test(url.pathname)
            :['bzzhr.to','www.bzzhr.to','bzzhr.co','www.bzzhr.co','buzzheavier.com','www.buzzheavier.com'].includes(host)
              && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname));
          if(stablePage)setSourceUrl(url.href);
        } catch {/* never render untrusted provider URLs */}
        throw new Error(data.error?.message||'تعذر تنفيذ طلب التحميل.');
      }
      if(typeof data.destination!=='string'||data.destination.length>4096||new URL(data.destination).protocol!=='https:')throw new Error('استجابة غير صالحة.');
      setSent(true);
      // Attachment responses keep this UI; upstream HTML may navigate this same tab.
      // Browser transport/completion cannot be observed across origins.
      window.location.assign(data.destination);
    }catch(e){setError(e instanceof Error&&e.name!=='AbortError'?e.message:'انتهت مهلة الاتصال. أعد المحاولة.');submitted.current=false;}
    finally{clearTimeout(timer);clearTimeout(pollTimer);controller.abort();activeRequest.current=null;setResolving(false);}
  }
  const state=busy?'PREPARING':resolving?(browserState||'RESOLVING'):error?(browserState==='PROVIDER_CHALLENGE'?'PROVIDER_CHALLENGE':'FAILED'):sent?'DOWNLOADING':grant?remaining>0?'COUNTDOWN':'READY':'INITIAL';
  const progressLabel:Record<string,string>={USING_CACHED_LINK:'جارٍ استخدام رابط محفوظ صالح',BROWSER_STARTING:'جارٍ تشغيل متصفح المعالجة',OPENING_SOURCE:'جارٍ فتح مصدر اللعبة',FINDING_BZZHR:'جارٍ البحث عن مصدر BZZHR',RESOLVING_DOWNLOAD:'جارٍ استخراج رابط التنزيل',VERIFYING_FILE:'جارٍ التحقق من الملف',PROVIDER_CHALLENGE:'المصدر يتطلب تحققًا بشريًا'};
  return <div className={`shell ${styles.page}`} data-download-state={state}>
    <nav className="detail-breadcrumbs" aria-label={t("مسار التنقل")}><ol><li><Link href="/">{t("الرئيسية")}</Link></li><li><Link href={app.detailHref}>{app.name}</Link></li><li aria-current="page">{t("التحميل")}</li></ol></nav>
    <header className={styles.header}><p className="eyebrow">WALEED ZONE</p><h1>{t("تحميل")} <bdi>{app.name}</bdi></h1><p>{provider==='telegram'?t("بعد التجهيز، سيفتح ملف التطبيق في قناة Telegram."):t("نعالج المصدر هنا، ثم يبدأ المتصفح التنزيل في التبويب نفسه.")}</p></header>
    <div className={styles.layout}><aside className={styles.summary}><div className={styles.identity}><span className={styles.icon}><CoverImage src={app.imageUrl} alt={t("أيقونة {0}", app.name)} aspectClassName="aspect-square"/></span><h2 dir="auto">{app.name}</h2></div><dl><div><dt>{t("الإصدار")}</dt><dd dir="auto">{app.version||t("غير معروف")}</dd></div><div><dt>{t("الحجم")}</dt><dd dir="auto">{app.size||t("غير معروف")}</dd></div></dl><Link href={app.detailHref}>{t("تفاصيل التطبيق")}</Link></aside>
      <section className={styles.panel} aria-labelledby="legacy-status"><div className={styles.status}><h2 ref={heading} tabIndex={-1} id="legacy-status">{state==='COUNTDOWN'?t("رابطك قيد التجهيز"):state==='READY'?(provider==='steamrip'?t("جاهز لتجهيز الرابط"):t("رابط التحميل جاهز")):resolving?t(progressLabel[browserState]||"جارٍ معالجة مصدر التحميل"):state==='DOWNLOADING'?t("تم إرسال طلب التنزيل إلى المتصفح"):t("تجهيز رابط التحميل")}</h2>
      <p role="status" aria-live="polite">{t(error)|| (resolving?t("جارٍ استخراج رابط جديد والتحقق من المضيف النهائي."):sent?t("تحقق من قائمة التنزيلات في متصفحك. لا يمكن للموقع تأكيد اكتمال الملف."):busy?t("جارٍ التحقق من توفر التطبيق."):t("مهلة التجهيز 20 ثانية."))}</p>
      {grant&&remaining>0&&<><div className={styles.countdown} role="timer" aria-live="off"><strong>{remaining}</strong><span>{t("ثانية متبقية")}</span></div><progress className={styles.progress} max={20} value={20-remaining} aria-label={t("تقدم تجهيز الرابط")}/></>}</div>
      <div className={styles.actions}>{grant?.owner_test&&<p role="status" className={styles.fallbackNote}>{t(grant.owner_test.verification==='verified'?'اختبار مالك: رابط CDN متحقق خادميًا.':'اختبار مالك فقط: لم يُتحقق من رابط CDN خادميًا وقد ينتهي قبل 10 دقائق.')} <Link href={`/admin/download-test?application_id=${app.id}`}>{t("إدارة رابط الاختبار")}</Link></p>}{providerBlocked&&sourceUrl?<a className={`primary-action ${styles.fallbackLink}`} href={sourceUrl} rel="noreferrer" referrerPolicy="no-referrer">{t("فتح صفحة المصدر لإكمال التحميل")} ↗</a>:grant&&remaining===0&&!sent?<form action="/api/downloads/legacy/redeem" method="post" onSubmit={event=>{
        event.preventDefault();void redeem(event.currentTarget);
      }}><input type="hidden" name="application_id" value={app.id}/><input type="hidden" name="token" value={grant.token}/><button disabled={resolving} type="submit" className="primary-action">{resolving?t("جارٍ معالجة مصدر التحميل"):error?t("إعادة المحاولة"):provider==='telegram'?t("تحميل الملف عبر Telegram"):t("بدء التحميل")} ↓</button></form>:!grant||sent?<button type="button" className="primary-action" disabled={busy} onClick={()=>void prepare()}>{busy?t("جارٍ التحقق…"):sent?t("تجهيز طلب جديد"):t("تجهيز رابط التحميل")}</button>:<button type="button" disabled className="primary-action">{t("جارٍ التجهيز ·")} {remaining}  {t("ثانية")}</button>}
      {providerBlocked&&sourceUrl&&<p className={styles.fallbackNote}>{t("هذه صفحة خارجية قد تتطلب تحققًا بشريًا. اختر رابط التحميل هناك. التحقق في متصفحك لا يفتح جلسة الخادم.")}</p>}
      <p className={styles.note}>{t("يبقى الموقع ظاهرًا أثناء المعالجة. عند بدء التنزيل قد ينقلك المضيف في التبويب نفسه إذا لم يرسل الملف كمرفق.")}</p></div></section></div>
  </div>;
}
