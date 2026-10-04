'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import CatalogEditor from './CatalogEditor';
import Analytics from './Analytics';
import MonetizationReview from './MonetizationReview';
import CoverImage from '@/components/CoverImage';
import Icon, { type IconName } from '@/components/Icon';
import { adminApi, AdminApiError, apiErrorMessage } from './api';
import { ConfigForm, Field, FileForm, KillSwitchForm, VersionForm } from './AdminForms';
import { blockerLabel, budgetPercent, directBlockers, formatBytes, formatTime, modeLabels } from './presentation';
import type { AdminApp, AppDetail, Section, SystemStatus } from './types';
import styles from './admin.module.css';

const sections: { id: Section; label: string; english: string; icon: IconName }[] = [
  { id: 'overview', label: 'نظرة عامة', english: 'Overview', icon: 'grid' },
  { id: 'applications', label: 'التطبيقات', english: 'Applications', icon: 'apps' },
  { id: 'configuration', label: 'إعداد التحميل', english: 'Download configuration', icon: 'menu' },
  { id: 'versions', label: 'الإصدارات', english: 'Versions', icon: 'refresh' },
  { id: 'files', label: 'الملفات', english: 'Files', icon: 'arrow' },
  {id:'analytics',label:'التحليلات',english:'Analytics',icon:'trend'},
  { id: 'monetization', label: 'الربح والإعلانات', english: 'Monetization', icon: 'trend' },
  { id: 'system', label: 'حالة النظام', english: 'System status', icon: 'trend' },
  { id: 'kill-switch', label: 'الإيقاف العام', english: 'Kill switch', icon: 'close' },
];
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'cyan' | 'warning' | 'success' | 'danger' }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
function Panel({ title, children, description }: { title: string; description?: string; children: ReactNode }) {
  return <section className={styles.panel}><div className={styles.panelHead}><h3>{title}</h3>{description && <p>{description}</p>}</div>{children}</section>;
}
function State({ title, children, error = false }: { title: string; children?: ReactNode; error?: boolean }) {
  return <div className={styles.state} role={error ? 'alert' : 'status'}><Icon name={error ? 'close' : 'grid'} /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
function Loading({ label }: { label: string }) {
  return <div className={styles.loading} role="status" aria-live="polite" aria-busy="true"><span>{label}</span><div /><div /><div /></div>;
}
function VersionBadges({ active, published }: { active: boolean; published: boolean }) {
  return <div className={styles.badges}>
    <Badge tone={active ? 'cyan' : 'warning'}>{active ? 'active · فعّال' : 'pending · غير فعّال'}</Badge>
    <Badge tone={published ? 'success' : 'neutral'}>{published ? 'published · منشور' : 'غير منشور'}</Badge>
  </div>;
}
function ScanBadges({ status, active, retired }: { status: string; active: boolean; retired: boolean }) {
  const labels: Record<string, string> = { pending: 'pending · بانتظار التحقق', verified: 'verified · تم التحقق', quarantined: 'quarantined · معزول', failed: 'failed · فشل التحقق' };
  return <div className={styles.badges}><Badge tone={status === 'verified' ? 'success' : status === 'pending' ? 'warning' : 'danger'}>{labels[status]}</Badge>
    <Badge tone={active ? 'cyan' : 'neutral'}>{active ? 'active · فعّال' : 'غير فعّال'}</Badge>{retired && <Badge tone="danger">متقاعد</Badge>}</div>;
}
function AppIdentity({ app }: { app: AdminApp }) {
  return <div className={styles.identity}><span className={styles.appIcon}><CoverImage src={app.icon} alt="" aspectClassName="aspect-square" /></span><span><strong dir="auto">{app.name}</strong><small>تطبيق #{app.id}</small></span></div>;
}
function Gate({ label, ready }: { label: string; ready: boolean }) {
  return <div className={styles.gate}><span>{label}</span><Badge tone={ready ? 'success' : 'warning'}>{ready ? 'اجتاز الشرط' : 'محظور'}</Badge></div>;
}

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>('overview');
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  const page = cursors.length;
  const after = cursors[page - 1];
  const [revision, setRevision] = useState(0);
  const [catalog, setCatalog] = useState<{ items: AdminApp[]; nextAfter: number | null } | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [systemError, setSystemError] = useState('');
  const [csrf, setCsrf] = useState('');
  const [writeError, setWriteError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadedDetail, setLoadedDetail] = useState<AppDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const mutationLock = useRef(false);
  const detail = loadedDetail?.app.id === selectedId ? loadedDetail : null;
  const locked = !csrf || !system || !system.migrationReady || !!writeError;
  const activeSection = sections.find(s => s.id === section)!;
  const blockers = directBlockers(detail, system);

  useEffect(() => {
    mounted.current = true;
    const sync = () => { const id = window.location.hash.slice(1); if (sections.some(s => s.id === id)) setSection(id as Section); };
    sync(); window.addEventListener('hashchange', sync); window.addEventListener('popstate', sync);
    return () => { mounted.current = false; window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setCatalog(null); setSystem(null); setCsrf(''); setCatalogError(''); setSystemError(''); setWriteError('');
    adminApi.applications(after, abort.signal).then(value => { if (!abort.signal.aborted) setCatalog(value); })
      .catch(error => { if (!abort.signal.aborted) setCatalogError(apiErrorMessage(error)); });
    adminApi.status(abort.signal).then(value => { if (!abort.signal.aborted) setSystem(value); })
      .catch(error => { if (!abort.signal.aborted) setSystemError(apiErrorMessage(error)); });
    adminApi.csrf(abort.signal).then(value => { if (!abort.signal.aborted) setCsrf(value); })
      .catch(error => { if (!abort.signal.aborted) setWriteError(apiErrorMessage(error)); });
    return () => abort.abort();
  }, [after, revision]);
  useEffect(() => {
    const abort = new AbortController(); setLoadedDetail(null); setDetailError('');
    if (selectedId !== null) adminApi.detail(selectedId, abort.signal).then(value => { if (!abort.signal.aborted) setLoadedDetail(value); })
      .catch(error => { if (!abort.signal.aborted) setDetailError(apiErrorMessage(error)); });
    return () => abort.abort();
  }, [selectedId, revision]);

  function navigate(event: MouseEvent<HTMLAnchorElement>, id: Section) {
    event.preventDefault(); window.history.pushState(null, '', `#${id}`); setSection(id);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function selectApp(id: number) { if (busy) return; setSelectedId(id); setNotice(''); setSection('configuration'); window.history.pushState(null, '', '#configuration'); requestAnimationFrame(() => heading.current?.focus()); }
  async function mutate(action: (token: string) => Promise<void>, verify: (detail: AppDetail | null, system: SystemStatus) => boolean) {
    if (mutationLock.current || locked) return;
    mutationLock.current = true; setBusy(true); setNotice('');
    let accepted = false;
    try {
      await action(csrf); accepted = true;
      const [newDetail, newSystem, newCatalog] = await Promise.all([
        selectedId === null ? Promise.resolve(null) : adminApi.detail(selectedId), adminApi.status(), adminApi.applications(after),
      ]);
      if (!verify(newDetail, newSystem)) throw new Error('UNCONFIRMED_WRITE');
      if (!mounted.current) return;
      setLoadedDetail(newDetail); setSystem(newSystem); setCatalog(newCatalog);
      setNotice('تم الحفظ وتأكيد الحالة الجديدة من الخادم.');
    } catch (error) {
      if (!mounted.current) return;
      setCsrf(''); setLoadedDetail(null); setSystem(null);
      if (error instanceof AdminApiError && error.status === 409) {
        // Refetch authoritative revisions, preserving a visible conflict. Never retry the write.
        setRevision(v => v + 1);
        setNotice('تعارض في الحفظ. أُعيدت قراءة الحالة؛ راجع التغييرات قبل إرسال إجراء جديد.');
      } else setWriteError(accepted ? 'استلم الخادم الحفظ، لكن تعذر تأكيد الحالة الجديدة. حدّث الحالة قبل أي عملية إضافية؛ لا تكرر الحفظ مباشرة.' : apiErrorMessage(error));
    } finally {
      mutationLock.current = false;
      if (mounted.current) { setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
    }
  }
  function refresh() { if (busy) return; setNotice(''); setRevision(v => v + 1); }
  const editorState = !selectedId ? <State title="اختر تطبيقًا أولًا">افتح قسم التطبيقات لتحديد التطبيق المراد إدارته.</State>
    : detailError ? <State title="تعذر قراءة بيانات التطبيق" error>{detailError}</State>
    : !detail ? <Loading label="جارٍ قراءة الإصدارات والملفات…" /> : null;
  const currentVersion = detail?.versions.find(v => v.id === detail.app.currentVersionId);
  const currentFiles = detail?.files.filter(f => f.versionId === currentVersion?.id) || [];

  return <div className={`${styles.dashboard} shell`}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>OWNER CONSOLE / WZ</span><h1>لوحة المالك</h1><p>إدارة الكتالوج والتحميل، مع حالة واضحة لكل خطوة.</p></div>
      <div className={styles.headerActions}><Badge tone="cyan">وصول المالك فقط</Badge><button className={styles.secondary} onClick={refresh} disabled={busy}><Icon name="refresh" />تحديث الحالة</button></div>
    </header>
    <div className={styles.workspace}>
      <nav className={styles.navigation} aria-label="أقسام لوحة المالك">
        <span className={styles.navLabel}>مساحة الإدارة</span>
        {sections.map(item => <a key={item.id} href={`#${item.id}`} aria-current={section === item.id ? 'page' : undefined} onClick={event => navigate(event, item.id)}>
          <Icon name={item.icon} /><span>{item.label}<small lang="en" dir="ltr">{item.english}</small></span></a>)}
        <p className={styles.navNote}>metadata فقط<br />حفظ البيانات لا يعني جاهزية direct.</p>
      </nav>
      <div className={styles.content}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow} lang="en" dir="ltr">{activeSection.english}</p><h2 ref={heading} tabIndex={-1}>{activeSection.label}</h2></div>
          <small>{system ? `آخر تحقق: ${formatTime(system.checkedAt)}` : 'الحالة لم تُعتمد بعد'}</small></div>
        <div ref={feedback} tabIndex={-1} className={styles.feedback} role={writeError ? 'alert' : 'status'} aria-live="polite">
          {writeError && <div className={styles.errorBanner}><strong>عمليات الحفظ محظورة</strong><p>{writeError}</p><button className={styles.secondary} onClick={refresh} disabled={busy}>إعادة قراءة الحالة</button></div>}
          {notice && <p className={styles.successBanner}>{notice}</p>}
        </div>

        {section === 'overview' && <>
          <div className={styles.overviewHero}><div><span className={styles.eyebrow}>CONTROL BEFORE DELIVERY</span><h3>وضوح الحالة، قبل زر التحميل.</h3><p>راقب الإصدارات والملفات وشروط الإطلاق. هذه اللوحة لا ترفع ملفات APK ولا تنشئ تخزينًا.</p></div>
            <Badge tone={system?.activationAllowed && system.activationAllowed && system.enabled && system.deploymentEnabled ? 'cyan' : 'warning'}>{system ? system.activationAllowed && system.enabled && system.deploymentEnabled ? 'التفعيل العام متاح · افحص شروط كل تطبيق' : 'التحميل المباشر محظور حاليًا' : 'الجاهزية غير معروفة'}</Badge></div>
          <div className={styles.stats}>
            <div><span>التطبيقات في الكتالوج</span><strong>{catalog?.items.length ?? '—'}</strong><small>الصفحة الحالية</small></div>
            <div><span>إصدارات التطبيق المحدد</span><strong>{detail?.versions.length ?? '—'}</strong><small>{detail ? detail.app.name : 'اختر تطبيقًا'}</small></div>
            <div><span>ملفات verified للتطبيق</span><strong>{detail ? detail.files.filter(f => f.scanStatus === 'verified').length : '—'}</strong><small>verified لا تعني active أو published</small></div>
            <div><span>ميزانية معتمدة</span><strong className={styles.statWord}>{system?.budget ? system.budget.verified ? 'معتمدة' : 'غير معتمدة' : '—'}</strong><small>صلاحية الفترة تُفحص مستقلة</small></div>
          </div>
          <div className={styles.twoColumns}><Panel title="حواجز الأمان"><SystemGates system={system} error={systemError} /></Panel>
            <Panel title="مسار إدارة البيانات" description="كل حالة مستقلة عن الأخرى."><ol className={styles.steps}><li><strong>pending</strong><span>تسجيل metadata أولية.</span></li><li><strong>verified</strong><span>اجتياز مراجعة سلامة الملف.</span></li><li><strong>active</strong><span>اختيار الملف والإصدار للاستخدام.</span></li><li><strong>published</strong><span>نشر الإصدار؛ شروط direct تبقى مستقلة.</span></li></ol></Panel></div>
          {catalogError && <State title="تعذر قراءة الكتالوج" error>{catalogError}</State>}
        </>}

        {section === 'applications' && <CatalogEditor onChange={() => setRevision(v=>v+1)} />}
        {section === 'applications' && <Panel title="كتالوج التطبيقات" description="اختر تطبيقًا لإدارة إعدادات التحميل المتقدم.">
          {catalogError ? <State title="تعذر قراءة الكتالوج" error>{catalogError}</State> : !catalog ? <Loading label="جارٍ قراءة التطبيقات…" /> : catalog.items.length === 0 ? <State title="لا توجد تطبيقات في هذه الصفحة">أضف التطبيقات عبر مسار الكتالوج المعتمد.</State> : <>
            <div className={styles.appList}>{catalog.items.map(app => <button key={app.id} className={styles.appRow} onClick={() => selectApp(app.id)} disabled={busy} aria-label={`إدارة ${app.name}`}>
              <AppIdentity app={app} /><Badge tone={app.mode === 'disabled' ? 'danger' : app.mode === 'direct' ? 'cyan' : 'neutral'}>{app.mode ? modeLabels[app.mode] : 'افتح إعداد التحميل لقراءة الوضع'}</Badge><Icon name="chevron" /></button>)}</div>
            <div className={styles.pagination}><button className={styles.secondary} disabled={page === 1 || busy} onClick={() => setCursors(v => v.slice(0, -1))}>السابق</button><span>صفحة {page} · {catalog.items.length} تطبيق في الصفحة</span><button className={styles.secondary} disabled={catalog.nextAfter === null || busy} onClick={() => { if (catalog.nextAfter !== null) setCursors(v => [...v, catalog.nextAfter]); }}>التالي</button></div>
          </>}
        </Panel>}

        {(['configuration', 'versions', 'files'] as Section[]).includes(section) && <>
          <Panel title="التطبيق المحدد">
            <Field label="اختيار تطبيق من الصفحة الحالية">{id => <select id={id} value={selectedId || ''} disabled={busy || !catalog} onChange={e => { setSelectedId(e.target.value ? Number(e.target.value) : null); setNotice(''); }}>
              <option value="">اختر تطبيقًا</option>{selectedId && !catalog?.items.some(a => a.id === selectedId) && <option value={selectedId}>{detail?.app.name || `تطبيق #${selectedId}`}</option>}
              {catalog?.items.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}
            </select>}</Field>
            {detail && <div className={styles.selectedApp}><AppIdentity app={detail.app} /><div className={styles.badges}><Badge tone="cyan">{modeLabels[detail.app.mode]}</Badge><Badge>الإصدار الحالي: {currentVersion?.label || 'لم يُحدّد'}</Badge></div>
              {currentVersion && <VersionBadges active={currentVersion.active} published={currentVersion.published} />}
              {currentFiles.length > 0 ? currentFiles.map(file => <div key={file.id} className={styles.fileSummary}><span dir="auto">{file.filename}</span><ScanBadges status={file.scanStatus} active={file.active} retired={file.retired} /></div>) : <p className={styles.muted}>لا توجد ملفات مرتبطة بالإصدار الحالي.</p>}
            </div>}
          </Panel>
          {editorState}
          {locked && detail && !writeError && <p className={styles.warning}>الحفظ غير متاح حتى اكتمال قراءة الحالة وحماية الطلب وتجهيز جداول التحميل.</p>}
        </>}

        {section === 'configuration' && detail && <Panel title="إعداد تحميل التطبيق" description="الوضع المسجّل لا يثبت جاهزية التسليم. كل شروط الخادم يجب أن تجتاز التحقق.">
          <ConfigForm key={`${detail.app.id}-${detail.app.configRevision}-${revision}`} detail={detail} system={system} busy={busy} locked={locked} onSave={input => mutate(token => adminApi.saveConfig(detail.app.id, input, token), updated => !!updated && updated.app.mode === input.mode && updated.app.currentVersionId === input.current_version_id)} />
        </Panel>}
        {section === 'versions' && detail && <div className={styles.twoColumns}>
          <Panel title="الإصدارات المسجّلة">{detail.versions.length ? <ul className={styles.recordList}>{detail.versions.map(version => <li key={version.id}><div className={styles.recordHead}><strong dir="auto">{version.label}</strong>{version.id === detail.app.currentVersionId && <Badge tone="cyan">الإصدار الحالي</Badge>}</div><small dir="ltr">{version.releaseKey}</small><VersionBadges active={version.active} published={version.published} /></li>)}</ul> : <State title="لا توجد إصدارات">أنشئ أول إصدار بحالة pending.</State>}</Panel>
          <Panel title="بيانات الإصدار"><VersionForm key={`${detail.app.id}-${detail.app.configRevision}-${revision}`} detail={detail} busy={busy} locked={locked} onSave={(input, id) => mutate(token => adminApi.saveVersion(input, token, id), updated => !!updated?.versions.some(v => (id ? v.id === id : 'release_key' in input && v.releaseKey === input.release_key) && ('action' in input ? input.action === 'activate' ? v.active : input.action === 'publish' ? v.published : !v.active && !v.published : v.label === input.version_label && (id ? true : !v.active && !v.published))))} /></Panel>
        </div>}
        {section === 'files' && detail && <>
          <Panel title="ملفات التحميل" description="تعرض القائمة الحالة والبيانات العامة للملف؛ مرجع التخزين والبصمة لا يظهران هنا.">
            {detail.files.length ? <ul className={styles.recordList}>{detail.files.map(file => <li key={file.id}><div className={styles.recordHead}><strong dir="auto">{file.filename}</strong><span dir="ltr">{formatBytes(file.sizeBytes)}</span></div><small>الإصدار: {detail.versions.find(v => v.id === file.versionId)?.label} · {file.variantKey} · APK</small><ScanBadges status={file.scanStatus} active={file.active} retired={file.retired} /><div className={styles.formActions}>
                <button className={styles.secondary} disabled={busy || locked || file.retired || file.active || file.scanStatus !== 'verified'} onClick={() => mutate(token => adminApi.fileAction(file.id, 'activate', file.revision, token), updated => !!updated?.files.some(f => f.id === file.id && f.active && f.scanStatus === 'verified'))}>تفعيل الملف</button>
                <button className={styles.secondary} disabled={busy || locked || !file.active} onClick={() => mutate(token => adminApi.fileAction(file.id, 'deactivate', file.revision, token), updated => !!updated?.files.some(f => f.id === file.id && !f.active))}>إلغاء تفعيل الملف</button>
              </div></li>)}</ul> : <State title="لا توجد ملفات">أضف metadata بعد إنشاء الإصدار؛ لا يوجد رفع ملفات هنا.</State>}
          </Panel><Panel title="تسجيل metadata لملف جديد" description="لا يُقبل ملف ثنائي؛ تُحفظ البيانات كـpending فقط.">
            <FileForm key={`${detail.app.id}-${detail.app.configRevision}-${revision}`} detail={detail} busy={busy} locked={locked} onSave={input => mutate(token => adminApi.saveFile(input, token), updated => !!updated?.files.some(f => f.id === input.id && f.versionId === input.version_id && f.variantKey === input.metadata.variant_key && f.filename === input.metadata.download_filename && f.sizeBytes === input.metadata.size_bytes && f.scanStatus === 'pending' && !f.active))} />
          </Panel>
        </>}

        {section === 'analytics' && <Analytics />}
        {section === 'monetization' && <MonetizationReview />}
        {section === 'system' && <>
          <Panel title="شروط النظام"><SystemGates system={system} error={systemError} /></Panel>
          <Panel title="الميزانية والحجز" description="عرض للقراءة فقط. لا تعديل للفوترة أو الميزانية من هذه اللوحة.">
            {!system ? <State title="الميزانية غير متاحة">يلزم رد صالح من الخادم؛ لا نفترض وجود رصيد مجاني.</State> : !system.budget ? <State title="لم تُعتمد ميزانية تحميل">لا يمكن تفعيل direct بدون ميزانية حالية موثقة.</State> : <>
              <dl className={styles.budget}><div><dt>الحالة</dt><dd>{system.budget.verified ? 'معتمدة' : 'غير معتمدة'}</dd></div><div><dt>الحد المعتمد</dt><dd dir="ltr">{formatBytes(system.budget.limitBytes)}</dd></div><div><dt>الحجم المحجوز</dt><dd dir="ltr">{formatBytes(system.budget.reservedBytes)}</dd></div><div><dt>بداية الفترة</dt><dd>{formatTime(system.budget.startsAt)}</dd></div><div><dt>نهاية الفترة</dt><dd>{formatTime(system.budget.expiresAt)}</dd></div></dl>
              <label className={styles.progressLabel} htmlFor="budget-progress">الحجم المحجوز من الحد المعتمد</label><progress id="budget-progress" max={100} value={budgetPercent(system.budget)} />
            </>}
          </Panel>{detail && <Panel title="عوائق التطبيق المحدد">{blockers.length ? <ul className={styles.blockerList}>{blockers.map(text => <li key={text}>{text}</li>)}</ul> : <p>لا توجد عوائق في آخر قراءة؛ يُعاد التحقق في الخادم لكل طلب.</p>}</Panel>}
        </>}
        {section === 'kill-switch' && <Panel title="الإيقاف العام للتحميل المباشر" description="يؤثر في كل التطبيقات التي تستخدم مسار direct.">
          {systemError ? <State title="حالة الإيقاف غير معروفة" error>{systemError}</State> : !system ? <Loading label="جارٍ قراءة مفتاح الإيقاف…" /> : <>
            <div className={styles.killStatus}><Icon name="close" width={32} height={32} /><div><h3>{system.enabled ? 'مفتاح الإيقاف غير مفعّل' : 'مفتاح الإيقاف مفعّل'}</h3><p>{system.enabled ? 'التفعيل العام مسموح؛ بقية شروط التحميل مستقلة.' : 'التحميل المباشر محظور بواسطة إعداد الخادم.'}</p></div><Badge tone={system.enabled ? 'warning' : 'success'}>{system.enabled ? 'enabled' : 'disabled'}</Badge></div>
            <KillSwitchForm system={system} busy={busy} locked={locked} onDisable={() => mutate(token => adminApi.disable(token), (_updated, status) => status.enabled === false)} />
          </>}
        </Panel>}
      </div>
    </div>
  </div>;
}

function SystemGates({ system, error }: { system: SystemStatus | null; error: string }) {
  if (error) return <State title="حالة النظام غير متاحة" error>{error}</State>;
  if (!system) return <Loading label="جارٍ التحقق من شروط النظام…" />;
  const budgetReady = !!system.budget?.verified && system.budget.current && Date.parse(system.budget.startsAt) <= Date.parse(system.checkedAt) && Date.parse(system.budget.expiresAt) > Date.parse(system.checkedAt) && BigInt(system.budget.reservedBytes) < BigInt(system.budget.limitBytes);
  return <><div className={styles.gates}>
    <Gate label="جداول التحميل" ready={system.migrationReady} /><Gate label="إعداد النشر" ready={system.deploymentEnabled} />
    <Gate label="التفعيل العام" ready={system.enabled} /><Gate label="مزود التخزين" ready={system.storageReady} />
    <Gate label="حماية مدخل الشبكة" ready={system.ingressReady} /><Gate label="canary فعلي" ready={system.canaryReady} /><Gate label="الميزانية الحالية" ready={budgetReady} />
  </div>{system.blockers.length > 0 && <ul className={styles.blockerList}>{[...new Set(system.blockers.map(blockerLabel))].map(text => <li key={text}>{text}</li>)}</ul>}</>;
}
