'use client';

import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { AppDetail, ConfigInput, FileInput, SystemStatus, VersionInput, VersionAction } from './types';
import { directBlockers, modeLabels } from './presentation';
import styles from './admin.module.css';

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string, hintId: string) => ReactNode }) {
  const id = useId();
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{children(id, `${id}-hint`)}
    {hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
function useValidation() {
  const [error, setError] = useState('');
  const ref = useRef<HTMLParagraphElement>(null);
  return { error, ref, fail: (text: string) => { setError(text); requestAnimationFrame(() => ref.current?.focus()); }, clear: () => setError('') };
}
type Validation = ReturnType<typeof useValidation>;
function FormError({ validation }: { validation: Validation }) {
  return <p ref={validation.ref} className={styles.formError} role={validation.error ? 'alert' : undefined} tabIndex={-1}>{validation.error}</p>;
}
function Actions({ busy, label }: { busy: boolean; label: string }) {
  return <div className={styles.formActions}><button className={styles.primary} disabled={busy} type="submit">{busy ? 'جارٍ الحفظ والتحقق…' : label}</button>
    <small>الحفظ لا يفعّل التحميل المباشر تلقائيًا.</small></div>;
}
type Common = { busy: boolean; locked: boolean };

export function VersionForm({ detail, busy, locked, onSave }: Common & { detail: AppDetail; onSave: (input: VersionInput, id?: string) => void }) {
  const [selected, setSelected] = useState('');
  const version = detail.versions.find(v => v.id === selected);
  const [label, setLabel] = useState('');
  const [release, setRelease] = useState('');
  const [action, setAction] = useState<'rename' | VersionAction>('rename');
  const validation = useValidation();
  const activeFiles = version ? detail.files.filter(f => f.versionId === version.id && f.active) : [];
  const eligible = activeFiles.length > 0 && activeFiles.every(f => f.scanStatus === 'verified' && !f.retired);
  function select(id: string) {
    const found = detail.versions.find(v => v.id === id);
    setSelected(id); setLabel(found?.label || ''); setRelease(found?.releaseKey || '');
    setAction(found?.immutable || found?.active || found?.published ? 'withdraw' : 'rename'); validation.clear();
  }
  function submit(event: FormEvent) {
    event.preventDefault(); validation.clear();
    if (!version || action === 'rename') {
      if (!label.trim() || label.trim().length > 100) return validation.fail('أدخل اسم إصدار حتى 100 حرف.');
      if (version) {
        if (version.immutable || version.active || version.published) return validation.fail('تعديل الاسم متاح للإصدار draft فقط.');
        onSave({ expected_revision: version.revision, version_label: label.trim() }, version.id);
      } else {
        if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(release.trim())) return validation.fail('مفتاح الإصدار: حروف إنجليزية صغيرة وأرقام و . _ - فقط.');
        onSave({ application_id: detail.app.id, version_label: label.trim(), release_key: release.trim() });
      }
    } else {
      if (action !== 'withdraw' && !eligible) return validation.fail('التفعيل والنشر يحتاجان كل الملفات active بحالة verified وغير متقاعدة.');
      if (action === 'publish' && (!version.active || !detail.app.active || !detail.app.published)) return validation.fail('النشر يحتاج إصدارًا active وتطبيقًا منشورًا وفعالًا.');
      onSave({ expected_revision: version.revision, action }, version.id);
    }
  }
  return <form onSubmit={submit} className={styles.form} aria-label="بيانات الإصدار" aria-busy={busy}>
    <fieldset disabled={busy || locked}>
      <Field label="الإصدار المراد تحريره">{id => <select id={id} value={selected} onChange={e => select(e.target.value)}><option value="">إنشاء إصدار pending</option>{detail.versions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select>}</Field>
      {version && <Field label="إجراء الإصدار">{id => <select id={id} value={action} onChange={e => setAction(e.target.value as typeof action)}>
        <option value="rename" disabled={version.immutable || version.active || version.published}>تعديل اسم draft</option>
        <option value="activate" disabled={!eligible || version.active}>activate · تفعيل الإصدار</option>
        <option value="publish" disabled={!eligible || !version.active || version.published || !detail.app.active || !detail.app.published}>publish · نشر الإصدار</option>
        <option value="withdraw">withdraw · سحب الإصدار</option>
      </select>}</Field>}
      {(!version || action === 'rename') && <div className={styles.fieldGrid}>
        <Field label="اسم الإصدار">{id => <input id={id} required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} dir="auto" />}</Field>
        <Field label="مفتاح الإصدار (release_key)" hint="معرّف ثابت بحروف صغيرة مثل 1.0.0-r1.">{(id, hint) => <input id={id} aria-describedby={hint} required disabled={!!version} maxLength={100} value={release} onChange={e => setRelease(e.target.value)} dir="ltr" spellCheck={false} />}</Field>
      </div>}
      <p className={styles.muted}>إنشاء pending، ثم تفعيل، ثم نشر بإجراءات مستقلة. التحقق من الملفات إجراء منفصل؛ الخادم يعيد فحص الشروط والrevision.</p>
      <FormError validation={validation} /><Actions busy={busy} label={version ? 'تنفيذ إجراء الإصدار' : 'إنشاء إصدار pending'} />
    </fieldset>
  </form>;
}

export function FileForm({ detail, busy, locked, onSave }: Common & { detail: AppDetail; onSave: (input: FileInput) => void }) {
  const validation = useValidation();
  const [fileId, setFileId] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); validation.clear();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    const size = Number(value('size_bytes'));
    if (!detail.versions.some(v => v.id === value('version_id'))) return validation.fail('اختر إصدارًا تابعًا لهذا التطبيق.');
    if (!Number.isSafeInteger(size) || size < 1 || size > 2147483648) return validation.fail('حجم الملف يجب أن يكون عدد بايتات صحيحًا بين 1 و2147483648.');
    if (!/^[a-f0-9]{64}$/.test(value('sha256'))) return validation.fail('SHA-256 يجب أن يتألف من 64 حرفًا سداسيًا صغيرًا.');
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(value('variant_key'))) return validation.fail('أدخل variant_key صالحًا من حروف إنجليزية وأرقام و . _ - فقط.');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/.test(value('download_filename')) || value('download_filename').length > 180)
      return validation.fail('اسم التنزيل يجب أن ينتهي بـ .apk ويحتوي حروفًا إنجليزية وأرقامًا و . _ - فقط.');
    const key = value('storage_key');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(fileId)) return validation.fail('أدخل UUID الملف المطابق للmanifest أو ولّد UUID قبل إعداد الكائن.');
    if (key !== `artifacts/${fileId}/${value('sha256')}.apk`) return validation.fail('مفتاح الكائن يجب أن يطابق UUID الملف وSHA-256 تمامًا.');
    if (value('storage_backend') === 'railway-s3' && value('storage_object_version')) return validation.fail('Railway يحتاج إصدار كائن فارغًا.');
    if (!key || key.length > 512 || /[\x00-\x1f\x7f]/.test(key) || key.includes('://') || key.includes('?') || key.includes('#'))
      return validation.fail('أدخل مفتاح كائن داخلي صالحًا، وليس رابط تنزيل أو رابطًا موقّعًا.');
    onSave({ id: fileId, version_id: value('version_id'), metadata: { variant_key: value('variant_key'), artifact_type: 'apk', size_bytes: size,
      sha256: value('sha256'), mime_type: 'application/vnd.android.package-archive', download_filename: value('download_filename'),
      storage_backend: value('storage_backend') as 'railway-s3' | 's3', storage_key: key, storage_object_version: value('storage_object_version') || null } });
  }
  return <form onSubmit={submit} className={styles.form} aria-label="بيانات ملف جديد" aria-busy={busy} onInvalidCapture={event => {
    const target = event.target as HTMLInputElement;
    const disclosure = target.closest('details');
    if (disclosure) disclosure.open = true;
  }}>
    <fieldset disabled={busy || locked || detail.versions.length === 0}>
      <Field label="UUID الملف" hint="هوية الملف في manifest؛ المفتاح يجب أن يطابقها.">{(id, hint) => <input id={id} aria-describedby={hint} required maxLength={36} value={fileId} onChange={e => setFileId(e.target.value.toLowerCase())} dir="ltr" autoComplete="off" />}</Field>
      <button className={styles.secondary} type="button" onClick={() => setFileId(crypto.randomUUID())}>توليد UUID جديد</button>
      <Field label="الإصدار">{id => <select id={id} name="version_id" required defaultValue=""><option value="" disabled>اختر إصدارًا</option>{detail.versions.map(v => <option key={v.id} value={v.id} disabled={v.active || v.published}>{v.label}</option>)}</select>}</Field>
      <div className={styles.fieldGrid}>
        <Field label="نوع النسخة (variant_key)">{id => <input id={id} name="variant_key" required maxLength={100} defaultValue="universal" dir="ltr" spellCheck={false} />}</Field>
        <Field label="اسم ملف التنزيل">{id => <input id={id} name="download_filename" required maxLength={180} placeholder="app-1.0.0.apk" dir="ltr" spellCheck={false} />}</Field>
        <Field label="الحجم بالبايت" hint="الحجم الدقيق، حتى 2 GiB.">{(id, hint) => <input id={id} name="size_bytes" aria-describedby={hint} required type="number" min={1} max={2147483648} step={1} inputMode="numeric" dir="ltr" />}</Field>
        <Field label="نوع الملف">{id => <input id={id} readOnly value="APK · application/vnd.android.package-archive" dir="ltr" />}</Field>
      </div>
      <Field label="SHA-256" hint="بصمة من المصدر المعتمد. إدخالها لا يثبت سلامة الملف.">{(id, hint) => <input id={id} name="sha256" aria-describedby={hint} required minLength={64} maxLength={64} dir="ltr" spellCheck={false} autoComplete="off" />}</Field>
      <details className={styles.disclosure}><summary>مرجع التخزين الخاص · metadata فقط</summary>
        <p className={styles.muted}>أدخل مرجع الكائن فقط. لا تدخل بيانات اعتماد أو رابطًا موقّعًا. لن يظهر المفتاح في قائمة الملفات.</p>
        <Field label="مزود التخزين (storage_backend)">{id => <select id={id} name="storage_backend" defaultValue="railway-s3"><option value="railway-s3">Railway</option><option value="s3">S3-compatible</option></select>}</Field>
        <Field label="مفتاح الكائن (storage_key)" hint="مثال: artifacts/<file-uuid>/<sha256>.apk؛ يلزم تطابق دقيق في الخادم.">{(id, hint) => <input id={id} name="storage_key" aria-describedby={hint} required maxLength={512} dir="ltr" autoComplete="off" spellCheck={false} />}</Field>
        <Field label="إصدار الكائن (اختياري)" hint="اتركه فارغًا لدى Railway؛ مزود يدعم versioning يحتاج إصدارًا حقيقيًا.">{(id, hint) => <input id={id} name="storage_object_version" aria-describedby={hint} maxLength={200} dir="ltr" autoComplete="off" spellCheck={false} />}</Field>
      </details>
      <p className={styles.muted}>السجل الجديد pending وغير active. التحقق من السلامة إجراء منفصل؛ هذه الاستمارة تحفظ metadata فقط.</p>
      <FormError validation={validation} /><Actions busy={busy} label="إنشاء metadata بحالة pending" />
    </fieldset>
    {detail.versions.length === 0 && <p className={styles.warning}>أنشئ إصدارًا أولًا لإضافة ملف.</p>}
  </form>;
}

export function ConfigForm({ detail, system, busy, locked, onSave }: Common & { detail: AppDetail; system: SystemStatus | null; onSave: (input: ConfigInput) => void }) {
  const [mode, setMode] = useState(detail.app.mode);
  const [versionId, setVersionId] = useState(detail.app.currentVersionId || '');
  const validation = useValidation();
  const blockers = directBlockers(detail, system, versionId || null);
  function submit(event: FormEvent) {
    event.preventDefault(); validation.clear();
    if (mode === 'direct' && blockers.length) return validation.fail('لا يمكن حفظ direct: شروط التفعيل الموضحة أدناه غير مكتملة.');
    if (versionId && !detail.versions.some(v => v.id === versionId)) return validation.fail('الإصدار المختار غير متاح لهذا التطبيق.');
    onSave({ expected_revision: detail.app.configRevision, mode, current_version_id: mode === 'direct' ? versionId || null : null });
  }
  return <form onSubmit={submit} className={styles.form} aria-label="إعداد التحميل" aria-busy={busy}>
    <fieldset disabled={busy || locked}>
      <Field label="وضع التحميل" hint="legacy يحتفظ بالمسار السابق. disabled يمنع التحميل لهذا التطبيق.">{(id, hint) => <select id={id} value={mode} aria-describedby={`${hint} direct-blockers`} onChange={e => setMode(e.target.value as typeof mode)}>
        <option value="legacy">{modeLabels.legacy}</option><option value="disabled">{modeLabels.disabled}</option>
        <option value="direct" disabled={blockers.length > 0 && detail.app.mode !== 'direct'}>{modeLabels.direct}{blockers.length ? ' · محظور' : ''}</option>
      </select>}</Field>
      <Field label="الإصدار الحالي">{id => <select id={id} value={versionId} disabled={mode !== 'direct'} onChange={e => setVersionId(e.target.value)}><option value="">لم يُحدّد</option>{detail.versions.map(v => <option key={v.id} value={v.id}>{v.label} · {v.published ? 'published' : 'pending'}</option>)}</select>}</Field>
      <FormError validation={validation} /><Actions busy={busy} label="حفظ إعداد التطبيق" />
    </fieldset>
    <div id="direct-blockers" className={styles.blockers}><h3>{blockers.length ? 'عوائق تفعيل direct' : 'اجتازت البيانات شروط العرض'}</h3>
      {blockers.length ? <ul>{blockers.map(text => <li key={text}>{text}</li>)}</ul> : <p>الخادم يعيد التحقق لحظة الحفظ. حفظ الإعداد وحده لا يثبت جاهزية التسليم الفعلي.</p>}
    </div>
  </form>;
}

export function KillSwitchForm({ system, busy, locked, onDisable }: Common & { system: SystemStatus | null; onDisable: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return <form className={styles.form} aria-label="إيقاف التحميل العام" aria-busy={busy} onSubmit={e => { e.preventDefault(); if (confirmed && !busy && !locked && system?.enabled) onDisable(); }}>
    <fieldset disabled={busy || locked || !system?.enabled}>
      <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />أؤكد إيقاف التحميل المباشر لجميع التطبيقات.</label>
      <button className={styles.danger} disabled={!confirmed || busy} type="submit">{busy ? 'جارٍ تنفيذ الإيقاف…' : 'إيقاف التحميل المباشر'}</button>
    </fieldset>
    <p className={styles.muted}>لن تؤكد اللوحة نجاح الإيقاف قبل قراءة الحالة الجديدة من الخادم. إعادة التفعيل تحتاج إجراء إطلاق معتمد.</p>
  </form>;
}
