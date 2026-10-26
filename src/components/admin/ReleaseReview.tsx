'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslateUI } from '@/components/LocaleProvider';
import { adminApi, apiErrorMessage, request } from './api';
import styles from './admin.module.css';

type ReviewItem = {
  id: number;
  name: string;
  version: string | null;
  platform: string | null;
  version_suggestion: string | null;
  revision: string;
};
type ReviewGroup = {
  canonical_name: string;
  confidence: number;
  reason: string;
  items: ReviewItem[];
};
type ReviewResponse = { provider: 'openai' | 'heuristic'; scanned: number; groups: ReviewGroup[] };

function parseReview(value: Record<string, unknown>): ReviewResponse {
  if ((value.provider !== 'openai' && value.provider !== 'heuristic')
    || !Number.isSafeInteger(value.scanned) || !Array.isArray(value.groups)) throw new Error('INVALID_RESPONSE');
  const groups = value.groups.map((raw): ReviewGroup => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_RESPONSE');
    const group = raw as Record<string, unknown>;
    if (typeof group.canonical_name !== 'string' || typeof group.reason !== 'string'
      || typeof group.confidence !== 'number' || !Array.isArray(group.items)) throw new Error('INVALID_RESPONSE');
    const items = group.items.map((item): ReviewItem => {
      if (!item || typeof item !== 'object') throw new Error('INVALID_RESPONSE');
      const row = item as Record<string, unknown>;
      if (!Number.isSafeInteger(row.id) || typeof row.name !== 'string'
        || !(row.version === null || typeof row.version === 'string')
        || !(row.platform === null || typeof row.platform === 'string')
        || !(row.version_suggestion === null || typeof row.version_suggestion === 'string')
        || typeof row.revision !== 'string' || !/^[a-f0-9]{64}$/.test(row.revision)) throw new Error('INVALID_RESPONSE');
      return row as ReviewItem;
    });
    if (items.length < 2 || items.length > 20) throw new Error('INVALID_RESPONSE');
    return { canonical_name: group.canonical_name, reason: group.reason, confidence: group.confidence, items };
  });
  return { provider: value.provider, scanned: Number(value.scanned), groups };
}

export default function ReleaseReview({ onChange }: { onChange: () => void }) {
  const t = useTranslateUI();
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const [canonicalName, setCanonicalName] = useState('');
  
  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    setNotice('');
    setConfirmIndex(null);
    try {
      setData(parseReview(await request('/api/admin/release-review')));
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function approve(group: ReviewGroup) {
    if (busy || !canonicalName.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const csrf = await adminApi.csrf();
      await request('/api/admin/release-review', {
        method: 'POST',
        csrf,
        body: {
          action: 'approve',
          canonical_name: canonicalName.trim(),
          items: group.items.map(item => ({ id: item.id, revision: item.revision })),
        },
      });
      setNotice(t('تم اعتماد المجموعة وتحديث الاسم والإصدارات دون تغيير ملفات التنزيل.'));
      setData(current => current ? { ...current, groups: current.groups.filter(item => item !== group) } : current);
      setConfirmIndex(null);
      setCanonicalName('');
      onChange();
    } catch (cause) {
      setError(apiErrorMessage(cause));
      if (cause && typeof cause === 'object' && 'status' in cause && (cause as { status?: number }).status === 409) {
        setNotice(t('تغيّرت بيانات أحد السجلات. أعد فحص الاقتراح قبل الموافقة.'));
        setConfirmIndex(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function skip(group: ReviewGroup) {
    setData(current => current ? { ...current, groups: current.groups.filter(item => item !== group) } : current);
    setConfirmIndex(null);
    setNotice(t('تم تخطي هذا الاقتراح لهذه الجلسة فقط؛ لم تتغير قاعدة البيانات.'));
  }

  return <section className={styles.panel} aria-labelledby="release-review-heading">
    <div className={styles.panelHead}>
      <h3 id="release-review-heading">{t('مراجعة ذكية لتجميع الإصدارات')}</h3>
      <p>{t('يعثر النظام على أسماء قد تكون للتطبيق نفسه، ويقترح اسمًا موحدًا وترقيم إصدارات مرتبًا. لا يتم تعديل أي سجل قبل موافقتك.')}</p>
    </div>
    <div className={styles.formActions}>
      <span className={styles.badge}>{data?.provider === 'openai' ? 'OpenAI' : t('مقارنة الأسماء مع مراجعة المالك')}</span>
      {data && <span className={styles.muted}>{t('تم فحص {0} سجلًا', data.scanned)}</span>}
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => void refresh()}>{t('فحص الكتالوج مجددًا')}</button>
    </div>
    {data?.provider !== 'openai' && <p className={styles.warning}>{t('مفتاح الذكاء الاصطناعي غير مفعّل أو غير متاح؛ تعمل مطابقة الأسماء الاحتياطية. لتفعيل اقتراحات OpenAI أضف OPENAI_API_KEY إلى متغيرات Railway، ولا تضع المفتاح في الكود.')}</p>}
    {error && <p className={styles.errorBanner} role="alert">{t(error)}</p>}
    {notice && <p className={styles.successBanner} role="status">{notice}</p>}
    {busy && !data && <p className={styles.muted}>{t('جارٍ تحليل أسماء التطبيقات والإصدارات…')}</p>}
    {data && data.groups.length === 0 && <p className={styles.successBanner}>{t('لم تُعثر على مجموعات تحتاج مراجعة حاليًا.')}</p>}
    {data && data.groups.map((group, index) => <article key={group.items.map(item => item.id).join('-')} className={styles.panel} aria-label={t('اقتراح إصدار')}>
      <div className={styles.panelHead}>
        <h4>{t('اقتراح {0}', index + 1)} · {group.canonical_name}</h4>
        <p>{group.reason}</p>
      </div>
      <div className={styles.badges}>
        <span className={styles.badge}>{t('الثقة التقريبية')}: {Math.round(group.confidence * 100)}%</span>
        <span className={styles.badge}>{t('{0} سجلات', group.items.length)}</span>
      </div>
      <ul className={styles.recordList}>
        {group.items.map(item => <li key={item.id}>
          <div className={styles.recordHead}>
            <strong dir="auto">{item.name}</strong>
            <span dir="auto">{item.version || item.version_suggestion || t('إصدار غير محدد')}</span>
          </div>
          <small dir="auto">{t('النظام')}: {item.platform || t('نظام غير محدد')} · #{item.id}</small>
          {item.version_suggestion && !item.version && <p className={styles.muted}>{t('سيُنقل رقم الإصدار من الاسم إلى حقل الإصدار عند الموافقة.')}</p>}
        </li>)}
      </ul>
      <p className={styles.muted}>{t('سيصبح الاسم الموحد')}: <strong dir="auto">{group.canonical_name}</strong>. {t('تبقى روابط وملفات كل سجل مستقلة؛ سيُرتّب عرض الإصدارات رقميًا.')}</p>
      {confirmIndex === index ? <div className={styles.panel}>
        <label className={styles.field}>{t('أكد الاسم الصحيح للتطبيق')}
          <input value={canonicalName} maxLength={255} onChange={event => setCanonicalName(event.target.value)} disabled={busy} />
        </label>
        <div className={styles.formActions}>
          <button type="button" className={styles.primary} disabled={busy || !canonicalName.trim()} onClick={() => void approve(group)}>{t('تأكيد جمع هذه الإصدارات')}</button>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setConfirmIndex(null); setCanonicalName(''); }}>{t('رجوع')}</button>
        </div>
      </div> : <div className={styles.formActions}>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => { setConfirmIndex(index); setCanonicalName(group.canonical_name); }}>{t('مراجعة ثم الموافقة')}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => skip(group)}>{t('التطبيقات مختلفة — تخطي')}</button>
      </div>}
    </article>)}
    {data && data.groups.length > 0 && <p className={styles.muted}>{t('الموافقة تغيّر الاسم وتستخرج رقم الإصدار من الاسم فقط إذا كان حقل الإصدار فارغًا. لن تُنقل الملفات أو تُحذف السجلات أو تُنشر المسودات تلقائيًا.')}</p>}
  </section>;
}
