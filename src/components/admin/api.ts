import type { AdminApp, AppDetail, Artifact, ConfigInput, FileInput, Mode, ScanStatus, SystemStatus, Version, VersionInput } from './types';

type Json = Record<string, unknown>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export class AdminApiError extends Error {
  constructor(public status: number, public code: string, public retrySeconds = 0) { super(code); }
}
const invalid = () => new AdminApiError(502, 'INVALID_RESPONSE');
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Json;
}
function text(value: unknown, max = 512) {
  if (typeof value !== 'string' || !value.length || value.length > max) throw invalid();
  return value;
}
function number(value: unknown, min = 0) {
  if (!Number.isSafeInteger(value) || Number(value) < min) throw invalid();
  return Number(value);
}
function boolean(value: unknown) {
  if (typeof value !== 'boolean') throw invalid();
  return value;
}
function id(value: unknown) { const result = text(value, 36); if (!uuid.test(result)) throw invalid(); return result; }
function nullableId(value: unknown) { return value === null ? null : id(value); }
function timestamp(value: unknown) { const result = text(value, 64); if (!Number.isFinite(Date.parse(result))) throw invalid(); return result; }
function enumValue<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw invalid(); return value as T;
}
function list<T>(value: unknown, parse: (item: unknown) => T, max = 500) {
  if (!Array.isArray(value) || value.length > max) throw invalid(); return value.map(parse);
}
function codes(value: unknown) { return list(value, v => text(v, 120), 100); }
function icon(value: unknown) {
  if (value === null) return null;
  const raw = text(value, 2048);
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port
      || [...url.searchParams.keys()].some(key => /token|signature|credential|secret|x-amz-|x-goog-/i.test(key))) return null;
    return url.toString();
  } catch { return null; }
}
function app(value: unknown): AdminApp {
  const row = object(value);
  return { id: number(row.application_id, 1), name: text(row.name, 300), icon: icon(row.icon_url),
    mode: enumValue<Mode>(row.mode, ['legacy', 'direct', 'disabled']), currentVersionId: nullableId(row.current_version_id) };
}
function version(value: unknown): Version {
  const row = object(value);
  return { id: id(row.id), applicationId: number(row.application_id, 1), label: text(row.version_label, 100), releaseKey: text(row.release_key, 100),
    active: boolean(row.active), published: boolean(row.published) };
}
function artifact(value: unknown): Artifact {
  const row = object(value);
  if (row.mime_type !== 'application/vnd.android.package-archive' || number(row.size_bytes, 1) > 2147483648) throw invalid();
  const retiredAt = row.retired_at === null ? null : timestamp(row.retired_at);
  return { id: id(row.id), versionId: id(row.version_id), variantKey: text(row.variant_key, 100), filename: text(row.download_filename, 180),
    sizeBytes: number(row.size_bytes, 1), mimeType: text(row.mime_type),
    scanStatus: enumValue<ScanStatus>(row.scan_status, ['pending', 'verified', 'quarantined', 'failed']),
    active: boolean(row.active), retired: retiredAt !== null };
}
function detail(value: unknown): AppDetail {
  const row = object(value), selected = app(row.application), versions = list(row.versions, version), files = list(row.files, artifact);
  if (versions.some(v => v.applicationId !== selected.id) || files.some(f => !versions.some(v => v.id === f.versionId))) throw invalid();
  return { app: selected, versions, files, blockers: codes(row.blockers), directActivationAllowed: boolean(row.direct_activation_allowed) };
}
function status(value: unknown): SystemStatus {
  const row = object(value), budget = row.budget === null ? null : object(row.budget);
  const result: SystemStatus = { checkedAt: timestamp(row.checked_at), enabled: boolean(row.enabled),
    deploymentEnabled: boolean(row.deployment_enabled), migrationReady: boolean(row.migration_ready),
    storageReady: boolean(row.storage_ready), ingressReady: boolean(row.ingress_ready), blockers: codes(row.blockers),
    budget: budget ? { verified: boolean(budget.allowance_verified), limitBytes: number(budget.byte_limit), reservedBytes: number(budget.reserved_bytes),
      startsAt: timestamp(budget.starts_at), expiresAt: timestamp(budget.expires_at) } : null };
  if (result.budget && (result.budget.reservedBytes > result.budget.limitBytes || Date.parse(result.budget.expiresAt) <= Date.parse(result.budget.startsAt))) throw invalid();
  return result;
}
async function request(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT'; body?: unknown; csrf?: string; signal?: AbortSignal } = {}) {
  if (options.method && options.method !== 'GET' && !/^[A-Za-z0-9_-]{32,256}$/.test(options.csrf || '')) throw new AdminApiError(403, 'CSRF_REQUIRED');
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 12000);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    const response = await fetch(path, { method: options.method || 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: controller.signal, headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}) }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
    if (!response.ok) {
      // Never render server error bodies: they may contain metadata or diagnostic secrets.
      const seconds = Number(response.headers.get('Retry-After'));
      throw new AdminApiError(response.status, 'REQUEST_FAILED', Number.isFinite(seconds) ? Math.min(3600, Math.max(0, Math.ceil(seconds))) : 0);
    }
    if (!response.headers.get('content-type')?.includes('application/json')) throw invalid();
    return object(await response.json());
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new AdminApiError(0, controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout); options.signal?.removeEventListener('abort', abort);
  }
}
/** Only fixed same-origin endpoints. Response URLs are never used as navigation destinations. */
export const adminApi = {
  async csrf(signal?: AbortSignal) {
    const row = await request('/api/admin/csrf', { signal });
    const token = text(row.csrf_token, 256);
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw invalid(); return token;
  },
  async applications(page: number, signal?: AbortSignal) {
    const row = await request(`/api/admin/applications?page=${number(page, 1)}&limit=50`, { signal });
    return { items: list(row.applications, app, 50), total: number(row.total) };
  },
  async detail(applicationId: number, signal?: AbortSignal) {
    const value = detail(await request(`/api/admin/applications/${number(applicationId, 1)}`, { signal }));
    if (value.app.id !== applicationId) throw invalid(); return value;
  },
  async status(signal?: AbortSignal) { return status(await request('/api/admin/downloads/status', { signal })); },
  async saveVersion(input: VersionInput, csrf: string, versionId?: string) {
    await request(`/api/admin/downloads/versions${versionId ? `/${id(versionId)}` : ''}`, { method: versionId ? 'PATCH' : 'POST', body: input, csrf });
  },
  async saveFile(input: FileInput, csrf: string) {
    await request('/api/admin/downloads/files', { method: 'POST', body: input, csrf });
  },
  async saveConfig(applicationId: number, input: ConfigInput, csrf: string) {
    await request(`/api/admin/downloads/config/${number(applicationId, 1)}`, { method: 'PUT', body: input, csrf });
  },
  async disable(csrf: string) {
    await request('/api/admin/downloads/control', { method: 'POST', body: { enabled: false }, csrf });
  },
};
export function apiErrorMessage(error: unknown) {
  if (!(error instanceof AdminApiError)) return 'تعذر تنفيذ العملية. أعد تحميل الحالة قبل المحاولة.';
  if (error.status === 401 || error.status === 403) return 'الجلسة أو صلاحية المالك غير متاحة. سجّل الدخول بحساب المالك وأعد تحميل الحالة.';
  if (error.status === 404 || error.status === 405) return 'واجهة الإدارة المطلوبة غير متاحة بعد. يلزم دمج Admin API المتوافقة.';
  if (error.status === 429) return `طلبات كثيرة. انتظر ${error.retrySeconds || 60} ثانية ثم أعد المحاولة.`;
  if (error.status === 409 || error.status === 422) return 'رفض الخادم الحفظ: تعارض أو شروط تحقق ناقصة. حدّث الحالة وراجع العوائق.';
  if (error.status === 400) return 'رفض الخادم البيانات المدخلة. راجع حقول metadata والعلاقات بين التطبيق والإصدار والملف.';
  if (error.status === 503) return 'خدمة الإدارة أو جداول التحميل غير جاهزة. جميع عمليات الحفظ محظورة حتى تعود الخدمة.';
  if (error.code === 'INVALID_RESPONSE') return 'استجابة الإدارة غير مكتملة أو غير متوافقة. لا يمكن اعتماد الحالة أو الحفظ.';
  if (error.code === 'TIMEOUT') return 'انتهت مهلة الاتصال. تحقق من الحالة قبل إعادة الحفظ؛ قد يكون الخادم استلم الطلب.';
  return 'تعذر الاتصال بخدمة الإدارة. تحقق من الحالة قبل إعادة الحفظ.';
}
