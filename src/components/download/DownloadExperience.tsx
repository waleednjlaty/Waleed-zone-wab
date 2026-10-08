'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import CoverImage from '@/components/CoverImage';
import { useDownload } from './useDownload';
import type { DownloadApp, DownloadFile, DownloadState } from './types';
import styles from './download.module.css';
import { useLocale } from '@/components/LocaleProvider';

const titles: Record<'ar' | 'en', Record<DownloadState, string>> = {
  ar: {
    INITIAL: 'جهّز رابط التحميل', LOADING: 'جارٍ التحقق من طلبك', COUNTDOWN: 'رابطك قيد التجهيز',
    READY: 'رابط التحميل جاهز', DOWNLOADING: 'جارٍ إرسال التحميل إلى المتصفح',
    RATE_LIMITED: 'انتظر قليلًا قبل المحاولة', EXPIRED: 'انتهت صلاحية الرابط',
    FAILED: 'تعذر بدء التحميل', SUCCESS: 'تم تسليم طلب التحميل',
  },
  en: {
    INITIAL: 'Prepare download link', LOADING: 'Checking your request', COUNTDOWN: 'Your link is being prepared',
    READY: 'Download link is ready', DOWNLOADING: 'Sending the download to your browser',
    RATE_LIMITED: 'Please wait before trying again', EXPIRED: 'The link has expired',
    FAILED: 'Unable to start download', SUCCESS: 'Download request delivered',
  },
};

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes, unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

export default function DownloadExperience({ app, file }: { app: DownloadApp; file: DownloadFile | null }) {
  const locale=useLocale(),english=locale==='en';
  const flow = useDownload(file);
  const heading = useRef<HTMLHeadingElement>(null);
  const { state, remaining } = flow;
  const unavailable = !file;
  const title = unavailable ? (english ? 'Direct download is currently unavailable' : 'التحميل المباشر غير متاح حاليًا') : titles[locale][state];
  const step = ['READY'].includes(state) ? 2 : ['DOWNLOADING', 'SUCCESS'].includes(state) ? 3 : state === 'COUNTDOWN' ? 1 : 0;
  const retryDisabled = remaining > 0 && ['RATE_LIMITED', 'FAILED'].includes(state);
  const milestone = state === 'COUNTDOWN' ? (english ? (remaining > 10 ? 'Preparing the link.' : remaining > 5 ? 'Ten seconds or less remaining.' : remaining > 0 ? 'Five seconds or less remaining.' : 'Checking link readiness.') : (remaining > 10 ? 'جارٍ تجهيز الرابط.' : remaining > 5 ? 'تبقى عشر ثوانٍ أو أقل.' : remaining > 0 ? 'تبقى خمس ثوانٍ أو أقل.' : 'جارٍ التحقق من جاهزية الرابط.')) : '';

  useEffect(() => {
    if (['READY', 'RATE_LIMITED', 'EXPIRED', 'FAILED', 'SUCCESS'].includes(state)) heading.current?.focus({ preventScroll: true });
  }, [state]);

  return <div className={`shell ${styles.page}`} data-download-state={state}>
    <nav className="detail-breadcrumbs" aria-label={english ? 'Breadcrumb' : 'مسار التنقل'}><ol>
      <li><Link href="/">{english ? 'Home' : 'الرئيسية'}</Link></li><li><Link href={app.detailHref} dir="auto">{app.name}</Link></li>
      <li><span aria-current="page">{english ? 'Download' : 'التحميل'}</span></li>
    </ol></nav>
    <header className={styles.header}><p className="eyebrow">{english ? 'WALEED ZONE · DIRECT DOWNLOAD' : 'WALEED ZONE · تحميل مباشر'}</p><h1>{english ? 'Download' : 'تحميل'} <bdi>{app.name}</bdi></h1><p>{english ? (unavailable ? 'Direct download is currently unavailable.' : 'Prepare the link, then start the download in your browser.') : (unavailable ? 'التحميل المباشر غير متاح حاليًا.' : 'جهّز الرابط، ثم ابدأ التحميل من متصفحك.')}</p></header>
    <div className={styles.layout}>
      <aside className={styles.summary} aria-label={english ? 'File information' : 'معلومات الملف'}>
        <div className={styles.identity}><span className={styles.icon}><CoverImage src={app.imageUrl} alt={english ? `Icon for ${app.name}` : `أيقونة ${app.name}`} aspectClassName="aspect-square" /></span><div><h2 dir="auto">{app.name}</h2><span>{english ? 'Download file' : 'ملف التحميل'}</span></div></div>
        <dl>
          <div><dt>{english ? 'Version' : 'الإصدار'}</dt><dd dir="auto">{file?.version || app.version || (english ? 'Unknown' : 'غير معروف')}</dd></div>
          <div><dt>{english ? 'File size' : 'حجم الملف'}</dt><dd dir="auto">{file ? formatFileSize(file.size_bytes) : app.size || (english ? 'Unknown' : 'غير معروف')}</dd></div>
          {file?.file_type && <div><dt>{english ? 'File type' : 'نوع الملف'}</dt><dd lang="en">{file.file_type.toUpperCase()}</dd></div>}
        </dl>
        <Link className={styles.back} href={app.detailHref}>{english ? 'Back to app details' : 'العودة إلى تفاصيل التطبيق'} <span aria-hidden="true">{english ? '→' : '←'}</span></Link>
      </aside>
      <section className={styles.panel} aria-labelledby="download-status-title">
        {!unavailable && <ol className={styles.steps} aria-label={english ? 'Download steps' : 'مراحل التحميل'}>{(english ? ['Request','Prepare','Ready','Download'] : ['الطلب', 'التجهيز', 'جاهز', 'التحميل']).map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={index < step}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>}
        <div className={styles.status}>
          <p className={styles.statusLabel}>{english ? (unavailable ? 'Unavailable' : state === 'SUCCESS' ? 'Request sent' : state === 'READY' ? 'Ready to download' : 'Download status') : (unavailable ? 'غير متاح' : state === 'SUCCESS' ? 'تم إرسال الطلب' : state === 'READY' ? 'جاهز للتحميل' : 'حالة التحميل')}</p>
          <h2 id="download-status-title" ref={heading} tabIndex={-1}>{title}</h2>
          {/* Announce state changes and countdown milestones, never every tick. */}
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{title} {milestone}{state === 'RATE_LIMITED' && !retryDisabled ? (english ? 'You can try again now.' : 'يمكنك إعادة المحاولة الآن.') : ''}</p>
          {unavailable && <p>{english ? 'No direct-download file is available for this app right now. Review the download options on the details page.' : 'لا يوجد ملف متاح للتحميل المباشر لهذا التطبيق حاليًا. راجع خيارات التحميل في صفحة التفاصيل.'}</p>}
          {!unavailable && state === 'INITIAL' && <p>{english ? 'Press to prepare the link. Preparation takes about 20 seconds.' : 'اضغط لتجهيز الرابط. يستغرق التجهيز نحو 20 ثانية.'}</p>}
          {state === 'LOADING' && <p>{english ? 'We are checking file availability and your request. Please wait a moment.' : 'نتحقق من توفر الملف وصلاحية طلبك. يرجى الانتظار لحظة.'}</p>}
          {state === 'COUNTDOWN' && <>
            <div className={styles.countdown} role="timer" aria-live="off" aria-label={english ? `Time remaining: ${remaining} seconds` : `الوقت المتبقي: ${remaining} ثانية`}><strong dir="ltr">{remaining}</strong><span>{english ? 'seconds remaining' : 'ثانية متبقية'}</span></div>
            <progress className={styles.progress} max={20} value={Math.max(0, 20 - remaining)} aria-label={english ? 'Link preparation progress' : 'تقدم تجهيز الرابط'} />
            <p>{english ? 'You can keep this page open. The download button will appear when the link is ready.' : 'يمكنك إبقاء هذه الصفحة مفتوحة. سيظهر زر التحميل عندما يصبح الرابط جاهزًا.'}</p>
          </>}
          {state === 'READY' && <><p>{english ? 'Start the download before the link expires.' : 'ابدأ التحميل قبل انتهاء صلاحية الرابط.'}</p><p className={styles.expiry}>{english ? 'The link is valid for' : 'الرابط صالح لمدة'} <bdi>{remaining}</bdi> {english ? 'seconds.' : 'ثانية.'}</p></>}
          {state === 'DOWNLOADING' && <p>{english ? 'The browser received the download request. Check your browser downloads; you may be asked to confirm saving the file.' : 'تلقى المتصفح طلب التنزيل. راجع قائمة التنزيلات؛ قد يطلب منك تأكيد حفظ الملف.'}</p>}
          {state === 'SUCCESS' && <p>{english ? 'The server accepted the download request. Track progress in your browser downloads; this page cannot confirm that the file finished saving.' : 'وافق السيرفر على طلب التحميل. تابع التقدم في تنزيلات المتصفح؛ هذه الصفحة لا تستطيع تأكيد اكتمال حفظ الملف.'}</p>}
          {state === 'EXPIRED' && <p>{flow.message || (english ? 'The temporary link expired. Prepare it again to continue.' : 'انتهت صلاحية الرابط المؤقت. يمكنك إعادة تجهيزه لمتابعة التحميل.')}</p>}
          {['FAILED', 'RATE_LIMITED'].includes(state) && <p className={styles.error}>{flow.message}</p>}
          {retryDisabled && <div className={styles.retryTime} role="timer" aria-live="off" aria-label={english ? `Try again in ${remaining} seconds` : `إعادة المحاولة بعد ${remaining} ثانية`}><strong dir="ltr">{remaining}</strong><span>{english ? 'seconds until retry' : 'ثانية حتى إعادة المحاولة'}</span></div>}
        </div>
        <div className={styles.actions}>
          {/* Native form: no fetch/Blob, no secret in URLs or browser storage. */}
          {!unavailable && state === 'READY' && flow.token && <form action="/api/downloads/redeem" method="post" onSubmit={event => { event.preventDefault(); flow.submit(event.currentTarget); }}>
            <input type="hidden" name="request_id" value={flow.requestId} />
            <input type="hidden" name="token" value={flow.token?.token || ''} />
            <input type="hidden" name="csrf_token" value={flow.csrf} />
            {state === 'READY' && <button className="primary-action" type="submit" aria-describedby="native-download-note">{english ? 'Download file' : 'تحميل الملف'} <span aria-hidden="true">↓</span></button>}
          </form>}
          {!unavailable && ['INITIAL', 'RATE_LIMITED', 'FAILED', 'EXPIRED', 'SUCCESS'].includes(state) && <button className={state === 'SUCCESS' ? 'secondary-action' : 'primary-action'} type="button" disabled={retryDisabled} onClick={() => void flow.prepare()}>{english ? (state === 'INITIAL' ? 'Prepare download link' : state === 'EXPIRED' ? 'Prepare link again' : state === 'SUCCESS' ? 'Prepare a new request' : retryDisabled ? `Try again in ${remaining} seconds` : 'Try again') : (state === 'INITIAL' ? 'تجهيز رابط التحميل' : state === 'EXPIRED' ? 'إعادة تجهيز الرابط' : state === 'SUCCESS' ? 'تجهيز طلب جديد' : retryDisabled ? `أعد المحاولة بعد ${remaining} ثانية` : 'إعادة المحاولة')}</button>}
          {['LOADING', 'COUNTDOWN'].includes(state) && <button className="primary-action" disabled type="button">{english ? (state === 'COUNTDOWN' ? `Preparing · ${remaining}s` : 'Checking…') : (state === 'COUNTDOWN' ? `جارٍ التجهيز · ${remaining} ثانية` : 'جارٍ التحقق…')}</button>}
          {state === 'DOWNLOADING' && <button type="button" className="secondary-action" onClick={() => void flow.check()}>{english ? 'Check request status' : 'التحقق من حالة الطلب'}</button>}
          {unavailable && <Link className="secondary-action" href={app.detailHref}>{english ? 'View download options' : 'عرض خيارات التحميل'}</Link>}
          {!unavailable && <p id="native-download-note" className={styles.note}>{english ? 'The download starts in this tab. Check the browser message and downloads, then try again if needed.' : 'يبدأ التحميل في التبويب نفسه. راجع رسالة المتصفح والتنزيلات ثم أعد المحاولة إذا لزم.'}</p>}
        </div>
        <noscript><p>{english ? 'JavaScript is required to prepare the download link and show the remaining time.' : 'يلزم تفعيل JavaScript لتجهيز رابط التحميل وعرض الوقت المتبقي.'}</p></noscript>
      </section>
    </div>
  </div>;
}
