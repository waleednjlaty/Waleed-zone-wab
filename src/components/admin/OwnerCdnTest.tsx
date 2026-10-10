'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useLocale } from '@/components/LocaleProvider';
import styles from './admin.module.css';
type Info = { verification: 'verified' | 'owner_unverified'; expires_at: string };
type Source = { application_id: number; source_revision: string; source_url: string; owner_test: Info | null };

export default function OwnerCdnTest({ initialId }: { initialId: string }) {
  const locale = useLocale(), text = (ar: string, en: string) => locale === 'en' ? en : ar;
  const [id, setId] = useState(initialId), [source, setSource] = useState<Source | null>(null);
  const [page, setPage] = useState(''), [signed, setSigned] = useState(''), [allow, setAllow] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function json(path: string, options: RequestInit = {}) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', ...options,
      signal: AbortSignal.timeout(15000) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.code || 'REQUEST_FAILED');
    return value;
  }
  async function load() {
    setBusy(true); setMessage(''); setSource(null); setSigned(''); setConfirmed(false);
    try {
      const value = await json('/api/admin/downloads/cdn-test?application_id=' + encodeURIComponent(id)) as Source;
      setSource(value); setPage(value.source_url.includes('steamrip.com') ? '' : value.source_url);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'REQUEST_FAILED'); }
    finally { setBusy(false); }
  }
  async function save(clear = false) {
    if (!source) return;
    setBusy(true); setMessage('');
    try {
      const csrf = await json('/api/admin/session');
      const body = clear ? { action: 'clear', application_id: source.application_id, expected_revision: source.source_revision }
        : { application_id: source.application_id, expected_revision: source.source_revision, bzzhr_page: page, signed_url: signed,
          allow_unverified: allow, confirm_source: confirmed };
      const value = await json('/api/admin/downloads/cdn-test', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.csrf_token }, body: JSON.stringify(body) });
      setSigned(''); setSource({ ...source, owner_test: value.owner_test || null });
      setMessage(clear ? text('حُذف رابط الاختبار.', 'Test link cleared.') : text('حُفظ رابط الاختبار. افتح صفحة التحميل أدناه من هذه الجلسة.', 'Test link saved. Open the download page below in this session.'));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'REQUEST_FAILED'); }
    finally { setBusy(false); }
  }
  const labels: Record<string, string> = {
    OWNER_TEST_DISABLED: text('وضع الاختبار معطّل في هذا النشر.', 'Test mode is disabled in this deployment.'),
    FILE_ID_MISMATCH: text('معرّف الملف لا يطابق مصدر BZZHR.', 'The file ID does not match the BZZHR source.'),
    SOURCE_CHANGED: text('تغيّر المصدر. أعد تحميل بيانات اللعبة.', 'Source changed. Load the game again.'),
    PROVIDER_TEST_UNAVAILABLE: text('مصدر هذه اللعبة يستخدم مسارًا آخر مثل Telegram.', 'This item uses another delivery method, such as Telegram.'),
    PROVIDER_FORBIDDEN: text('رفض CDN التحقق الخادمي. يمكن تفعيل الاستثناء الصريح للمالك أدناه.', 'CDN refused server verification. You may explicitly enable the owner exception below.'),
    PROVIDER_CHALLENGE: text('حُظر التحقق الخادمي. يمكن تفعيل الاستثناء الصريح للمالك أدناه.', 'Server verification was blocked. You may explicitly enable the owner exception below.'),
  };
  return <div className={`shell ${styles.dashboard}`}>
    <header className={styles.header}><div><p className={styles.eyebrow}>WALEED ZONE · OWNER QA</p>
      <h1>{text('اختبار رابط CDN', 'CDN link test')}</h1><p>{text('متاح للمالك في جلسة تسجيل الدخول الحالية فقط. العداد 20 ثانية والطلب لمرة واحدة.', 'Available only to the owner in this signed-in session. The 20-second countdown and single-use grant apply.')}</p></div>
      <Link href="/admin">{text('لوحة المالك', 'Owner dashboard')}</Link></header>
    <section className={styles.panel} style={{ marginBlockStart: 24 }}>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void load(); }}>
        <label>{text('معرّف اللعبة / التطبيق', 'Game / app ID')}<input type="number" disabled={busy} min="1" max="2147483647" required value={id} onChange={event => { setId(event.target.value); setSource(null); setSigned(''); }} /></label>
        <button className="primary-action" disabled={busy} type="submit">{text('تحميل بيانات المصدر', 'Load source')}</button>
      </form>
      {source && <form className={styles.form} style={{ marginBlockStart: 24 }} onSubmit={event => { event.preventDefault(); void save(); }}>
        <p className={styles.muted} style={{ overflowWrap: 'anywhere' }}>{text('المصدر الحالي:', 'Current source:')} <bdi>{source.source_url}</bdi></p>
        <label>{text('صفحة ملف BZZHR المطابقة للعبة', 'BZZHR file page matching this game')}<input type="url" dir="ltr" autoComplete="off" required value={page} onChange={event => setPage(event.target.value)} placeholder="https://buzzheavier.com/FILE_ID" /></label>
        <label>{text('الرابط الموقّع من Copy download link', 'Signed URL from Copy download link')}<textarea dir="ltr" autoComplete="off" spellCheck={false} required maxLength={4096} value={signed} onChange={event => setSigned(event.target.value)} placeholder="https://ts.bzzhr.to/d/FILE_ID?v=…" /></label>
        <label><input style={{width:18,minHeight:18}} type="checkbox" checked={confirmed} required onChange={event => setConfirmed(event.target.checked)} /> {text('أؤكد أن الملف يخص اللعبة المحددة وإصدارها الحالي.', 'I confirm this file belongs to the selected game and its current version.')}</label>
        <label><input style={{width:18,minHeight:18}} type="checkbox" checked={allow} onChange={event => setAllow(event.target.checked)} /> {text('أسمح باختبار المالك إذا تعذّر HEAD. لا يُتاح هذا الاستثناء للزوار.', 'Allow an owner test when HEAD is blocked. This exception is unavailable to visitors.')}</label>
        <p className={styles.muted}>{text('الرابط يبقى في الذاكرة حتى 10 دقائق كحد أقصى وقد ينتهي قبل ذلك. لا يُحمّل الملف عبر Railway. نجاح الاختبار اليدوي لا يثبت نجاح الاستخراج الآلي.', 'The link stays in memory for at most 10 minutes and may expire earlier. Railway never downloads the file. A manual test does not prove automated extraction works.')}</p>
        <button className="primary-action" disabled={busy || !confirmed} type="submit">{busy ? text('جارٍ التحقق…', 'Checking…') : text('حفظ رابط الاختبار', 'Save test link')}</button>
      </form>}
      {source?.owner_test && <div role="status" className={styles.panel} style={{ marginBlockStart: 20 }}>
        <strong>{source.owner_test.verification === 'verified' ? text('تم التحقق خادميًا · اختبار مالك', 'Server verified · owner test') : text('غير متحقق خادميًا · اختبار مالك فقط', 'Not server verified · owner test only')}</strong>
        <p>{text('ينتهي التخزين المؤقت عند:', 'Cache expires at:')} <time>{new Date(source.owner_test.expires_at).toLocaleTimeString(locale)}</time></p>
        <Link className="primary-action" href={'/download/' + source.application_id}>{text('فتح صفحة التحميل الطبيعية', 'Open normal download page')} ↓</Link>
        <button type="button" disabled={busy} onClick={() => void save(true)}>{text('حذف رابط الاختبار', 'Clear test link')}</button>
      </div>}
      {message && <p role="status" style={{ marginBlockStart: 20, overflowWrap: 'anywhere' }}>{labels[message] || message}</p>}
    </section>
  </div>;
}
