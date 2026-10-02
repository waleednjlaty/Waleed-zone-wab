import type { AppDetail, Mode, SystemStatus } from './types';

export const modeLabels: Record<Mode, string> = {
  legacy: 'legacy · المسار السابق', direct: 'direct · تحميل مباشر', disabled: 'disabled · معطّل',
};
const blockerLabels: Record<string, string> = {
  DIRECT_ACTIVATION_BLOCKED: 'تفعيل direct محظور في هذه المرحلة؛ يلزم اعتماد الإطلاق من الخادم.',
  MIGRATION_REQUIRED: 'جداول التحميل غير جاهزة. يلزم تطبيق migration بإجراء منفصل معتمد.',
  DOWNLOAD_TABLES_MISSING: 'جداول التحميل غير جاهزة.',
  DEPLOYMENT_DISABLED: 'التحميل المباشر غير مفعّل في إعدادات النشر.',
  DOWNLOADS_DISABLED: 'مفتاح إيقاف التحميل العام مفعّل.',
  STORAGE_UNAVAILABLE: 'مزود التخزين الخاص لم يُعتمد بعد.',
  INGRESS_UNVERIFIED: 'لم يكتمل التحقق من حماية مدخل الشبكة.',
  BUDGET_UNVERIFIED: 'ميزانية التحميل غير معتمدة أو انتهت صلاحيتها.',
  BUDGET_EXHAUSTED: 'ميزانية التحميل المتاحة مستنفدة.',
  VERSION_REQUIRED: 'اختر إصدارًا حاليًا.',
  VERSION_INACTIVE: 'الإصدار الحالي غير active.',
  VERSION_UNPUBLISHED: 'الإصدار الحالي غير published.',
  FILE_UNVERIFIED: 'يلزم ملف verified بعد مراجعة سلامته.',
  FILE_INACTIVE: 'يلزم ملف active غير متقاعد.',
  APP_UNPUBLISHED: 'التطبيق غير منشور في الكتالوج.',
};
/** Unrecognized server codes get a safe explanation, never raw server text. */
export function blockerLabel(code: string) {
  return blockerLabels[code] || 'شرط تحقق إضافي لم يكتمل في الخادم. راجع حالة النظام قبل التفعيل.';
}
export function directBlockers(detail: AppDetail | null, system: SystemStatus | null, selectedVersionId?: string | null) {
  const blockers = new Set<string>();
  if (!detail || !system) return ['بيانات التحقق غير متاحة؛ تفعيل direct محظور.'];
  for (const code of [...system.blockers, ...detail.blockers]) blockers.add(blockerLabel(code));
  if (!detail.directActivationAllowed) blockers.add(blockerLabel('DIRECT_ACTIVATION_BLOCKED'));
  if (!system.migrationReady) blockers.add(blockerLabel('MIGRATION_REQUIRED'));
  if (!system.deploymentEnabled) blockers.add(blockerLabel('DEPLOYMENT_DISABLED'));
  if (!system.enabled) blockers.add(blockerLabel('DOWNLOADS_DISABLED'));
  if (!system.storageReady) blockers.add(blockerLabel('STORAGE_UNAVAILABLE'));
  if (!system.ingressReady) blockers.add(blockerLabel('INGRESS_UNVERIFIED'));
  const budget = system.budget;
  const checkedAt = Date.parse(system.checkedAt);
  if (!budget || !budget.verified || !Number.isFinite(checkedAt)
    || Date.parse(budget.startsAt) > checkedAt || Date.parse(budget.expiresAt) <= checkedAt)
    blockers.add(blockerLabel('BUDGET_UNVERIFIED'));
  else if (budget.reservedBytes >= budget.limitBytes) blockers.add(blockerLabel('BUDGET_EXHAUSTED'));
  const version = detail.versions.find(v => v.id === (selectedVersionId === undefined ? detail.app.currentVersionId : selectedVersionId));
  if (!version) blockers.add(blockerLabel('VERSION_REQUIRED'));
  else {
    if (!version.active) blockers.add(blockerLabel('VERSION_INACTIVE'));
    if (!version.published) blockers.add(blockerLabel('VERSION_UNPUBLISHED'));
    const files = detail.files.filter(f => f.versionId === version.id && !f.retired);
    if (!files.some(f => f.scanStatus === 'verified')) blockers.add(blockerLabel('FILE_UNVERIFIED'));
    if (!files.some(f => f.scanStatus === 'verified' && f.active)) blockers.add(blockerLabel('FILE_INACTIVE'));
  }
  return [...blockers];
}
export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'غير متاح';
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes >= 1024 ** 3 ? 'GiB' : bytes >= 1024 ** 2 ? 'MiB' : 'KiB';
  const divisor = unit === 'GiB' ? 1024 ** 3 : unit === 'MiB' ? 1024 ** 2 : 1024;
  return `${(bytes / divisor).toLocaleString('en-US', { maximumFractionDigits: 1 })} ${unit}`;
}
export function formatTime(iso?: string | null) {
  return iso && Number.isFinite(Date.parse(iso))
    ? new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : 'غير متاح';
}
