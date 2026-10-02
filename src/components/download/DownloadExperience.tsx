'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import CoverImage from '@/components/CoverImage';
import { useDownload } from './useDownload';
import type { DownloadApp, DownloadFile, DownloadState } from './types';
import styles from './download.module.css';

const titles: Record<DownloadState, string> = {
  INITIAL: 'جهّز رابط التحميل', LOADING: 'جارٍ التحقق من طلبك', COUNTDOWN: 'رابطك قيد التجهيز',
  READY: 'رابط التحميل جاهز', DOWNLOADING: 'جارٍ إرسال التحميل إلى المتصفح',
  RATE_LIMITED: 'انتظر قليلًا قبل المحاولة', EXPIRED: 'انتهت صلاحية الرابط',
  FAILED: 'تعذر بدء التحميل', SUCCESS: 'تم تسليم طلب التحميل',
};

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes, unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

export default function DownloadExperience({ app, file }: { app: DownloadApp; file: DownloadFile | null }) {
  const flow = useDownload(file);
  const heading = useRef<HTMLHeadingElement>(null);
  const { state, remaining } = flow;
  const unavailable = !file;
  const title = unavailable ? 'التحميل المباشر غير متاح حاليًا' : titles[state];
  const step = ['READY'].includes(state) ? 2 : ['DOWNLOADING', 'SUCCESS'].includes(state) ? 3 : state === 'COUNTDOWN' ? 1 : 0;
  const retryDisabled = remaining > 0 && ['RATE_LIMITED', 'FAILED'].includes(state);
  const milestone = state === 'COUNTDOWN' ? remaining > 10 ? 'جارٍ تجهيز الرابط.' : remaining > 5 ? 'تبقى عشر ثوانٍ أو أقل.' : remaining > 0 ? 'تبقى خمس ثوانٍ أو أقل.' : 'جارٍ التحقق من جاهزية الرابط.' : '';

  useEffect(() => {
    if (['READY', 'RATE_LIMITED', 'EXPIRED', 'FAILED', 'SUCCESS'].includes(state)) heading.current?.focus({ preventScroll: true });
  }, [state]);

  return <div className={`shell ${styles.page}`} data-download-state={state}>
    <nav className="detail-breadcrumbs" aria-label="مسار التنقل"><ol>
      <li><Link href="/">الرئيسية</Link></li><li><Link href={app.detailHref} dir="auto">{app.name}</Link></li>
      <li><span aria-current="page">التحميل</span></li>
    </ol></nav>
    <header className={styles.header}><p className="eyebrow">WALEED ZONE · تحميل مباشر</p><h1>تحميل <bdi>{app.name}</bdi></h1><p>{unavailable ? 'التحميل المباشر غير متاح حاليًا.' : 'جهّز الرابط، ثم ابدأ التحميل من متصفحك.'}</p></header>
    <div className={styles.layout}>
      <aside className={styles.summary} aria-label="معلومات الملف">
        <div className={styles.identity}><span className={styles.icon}><CoverImage src={app.imageUrl} alt={`أيقونة ${app.name}`} aspectClassName="aspect-square" /></span><div><h2 dir="auto">{app.name}</h2><span>ملف التحميل</span></div></div>
        <dl>
          <div><dt>الإصدار</dt><dd dir="auto">{file?.version || app.version || 'غير معروف'}</dd></div>
          <div><dt>حجم الملف</dt><dd dir="auto">{file ? formatFileSize(file.size_bytes) : app.size || 'غير معروف'}</dd></div>
          {file?.file_type && <div><dt>نوع الملف</dt><dd lang="en">{file.file_type.toUpperCase()}</dd></div>}
        </dl>
        <Link className={styles.back} href={app.detailHref}>العودة إلى تفاصيل التطبيق <span aria-hidden="true">←</span></Link>
      </aside>
      <section className={styles.panel} aria-labelledby="download-status-title">
        {!unavailable && <ol className={styles.steps} aria-label="مراحل التحميل">{['الطلب', 'التجهيز', 'جاهز', 'التحميل'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={index < step}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>}
        <div className={styles.status}>
          <p className={styles.statusLabel}>{unavailable ? 'غير متاح' : state === 'SUCCESS' ? 'تم إرسال الطلب' : state === 'READY' ? 'جاهز للتحميل' : 'حالة التحميل'}</p>
          <h2 id="download-status-title" ref={heading} tabIndex={-1}>{title}</h2>
          {/* Announce state changes and countdown milestones, never every tick. */}
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{title} {milestone}{state === 'RATE_LIMITED' && !retryDisabled ? 'يمكنك إعادة المحاولة الآن.' : ''}</p>
          {unavailable && <p>لا يوجد ملف متاح للتحميل المباشر لهذا التطبيق حاليًا. راجع خيارات التحميل في صفحة التفاصيل.</p>}
          {!unavailable && state === 'INITIAL' && <p>اضغط لتجهيز الرابط. يستغرق التجهيز نحو 20 ثانية.</p>}
          {state === 'LOADING' && <p>نتحقق من توفر الملف وصلاحية طلبك. يرجى الانتظار لحظة.</p>}
          {state === 'COUNTDOWN' && <>
            <div className={styles.countdown} role="timer" aria-live="off" aria-label={`الوقت المتبقي: ${remaining} ثانية`}><strong dir="ltr">{remaining}</strong><span>ثانية متبقية</span></div>
            <progress className={styles.progress} max={20} value={Math.max(0, 20 - remaining)} aria-label="تقدم تجهيز الرابط" />
            <p>يمكنك إبقاء هذه الصفحة مفتوحة. سيظهر زر التحميل عندما يصبح الرابط جاهزًا.</p>
          </>}
          {state === 'READY' && <><p>ابدأ التحميل قبل انتهاء صلاحية الرابط.</p><p className={styles.expiry}>الرابط صالح لمدة <bdi>{remaining}</bdi> ثانية.</p></>}
          {state === 'DOWNLOADING' && <p>فُتح تبويب التحميل. راجع قائمة التنزيلات في متصفحك؛ قد يطلب منك تأكيد حفظ الملف.</p>}
          {state === 'SUCCESS' && <p>وافق السيرفر على طلب التحميل. تابع التقدم في تنزيلات المتصفح؛ هذه الصفحة لا تستطيع تأكيد اكتمال حفظ الملف.</p>}
          {state === 'EXPIRED' && <p>{flow.message || 'انتهت صلاحية الرابط المؤقت. يمكنك إعادة تجهيزه لمتابعة التحميل.'}</p>}
          {['FAILED', 'RATE_LIMITED'].includes(state) && <p className={styles.error}>{flow.message}</p>}
          {retryDisabled && <div className={styles.retryTime} role="timer" aria-live="off" aria-label={`إعادة المحاولة بعد ${remaining} ثانية`}><strong dir="ltr">{remaining}</strong><span>ثانية حتى إعادة المحاولة</span></div>}
        </div>
        <div className={styles.actions}>
          {/* Native form: no fetch/Blob, no secret in URLs or browser storage. */}
          {!unavailable && state === 'READY' && flow.token && <form action="/api/downloads/redeem" method="post" target="_blank" rel="noopener noreferrer" onSubmit={event => { event.preventDefault(); flow.submit(event.currentTarget); }}>
            <input type="hidden" name="request_id" value={flow.requestId} />
            <input type="hidden" name="token" value={flow.token?.token || ''} />
            <input type="hidden" name="csrf_token" value={flow.csrf} />
            {state === 'READY' && <button className="primary-action" type="submit" aria-describedby="native-download-note">تحميل الملف <span aria-hidden="true">↓</span></button>}
          </form>}
          {!unavailable && ['INITIAL', 'RATE_LIMITED', 'FAILED', 'EXPIRED', 'SUCCESS'].includes(state) && <button className={state === 'SUCCESS' ? 'secondary-action' : 'primary-action'} type="button" disabled={retryDisabled} onClick={() => void flow.prepare()}>{state === 'INITIAL' ? 'تجهيز رابط التحميل' : state === 'EXPIRED' ? 'إعادة تجهيز الرابط' : state === 'SUCCESS' ? 'تجهيز طلب جديد' : retryDisabled ? `أعد المحاولة بعد ${remaining} ثانية` : 'إعادة المحاولة'}</button>}
          {['LOADING', 'COUNTDOWN'].includes(state) && <button className="primary-action" disabled type="button">{state === 'COUNTDOWN' ? `جارٍ التجهيز · ${remaining} ثانية` : 'جارٍ التحقق…'}</button>}
          {state === 'DOWNLOADING' && <button type="button" className="secondary-action" onClick={() => void flow.check()}>التحقق من حالة الطلب</button>}
          {unavailable && <Link className="secondary-action" href={app.detailHref}>عرض خيارات التحميل</Link>}
          {!unavailable && <p id="native-download-note" className={styles.note}>يفتح التحميل في تبويب جديد. إذا لم يبدأ، راجع ذلك التبويب ورسالة المتصفح ثم أعد المحاولة.</p>}
        </div>
        <noscript><p>يلزم تفعيل JavaScript لتجهيز رابط التحميل وعرض الوقت المتبقي.</p></noscript>
      </section>
    </div>
  </div>;
}
