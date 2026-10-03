import type { AdminApp, AppDetail, Artifact, ConfigInput, FileInput, FileAction, Mode, ScanStatus, SystemStatus, Version, VersionInput } from './types';

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
function revision(value: unknown) { const result = text(value, 64); if (!/^[a-f0-9]{64}$/.test(result)) throw invalid(); return result; }
function decimal(value: unknown) {
  const result = text(value, 19);
  if (!/^(0|[1-9][0-9]*)$/.test(result) || BigInt(result) > BigInt('9223372036854775807')) throw invalid();
  return result;
}
function app(value: unknown): AdminApp {
  const row = object(value);
  return { id: number(row.id, 1), name: text(row.name, 300), icon: null,
    mode: null, currentVersionId: null, active: boolean(row.active), published: boolean(row.published) };
}
function version(value: unknown): Version {
  const row = object(value);
  if (row.published_at !== null) timestamp(row.published_at);
  return { id: id(row.id), applicationId: number(row.application_id, 1), label: text(row.version_label, 100), releaseKey: text(row.release_key, 100),
    active: boolean(row.active), published: boolean(row.published), immutable: row.published_at !== null, revision: revision(row.revision) };
}
function artifact(value: unknown): Artifact {
  const row = object(value);
  if (row.mime_type !== 'application/vnd.android.package-archive' || number(row.size_bytes, 1) > 2147483648) throw invalid();
  const retiredAt = row.retired_at === null ? null : timestamp(row.retired_at);
  return { id: id(row.id), versionId: id(row.version_id), variantKey: text(row.variant_key, 100), filename: text(row.download_filename, 180),
    sizeBytes: number(row.size_bytes, 1), mimeType: text(row.mime_type),
    scanStatus: enumValue<ScanStatus>(row.scan_status, ['pending', 'verified', 'quarantined', 'failed']),
    active: boolean(row.active), retired: retiredAt !== null, revision: revision(row.revision) };
}
function status(value: unknown): SystemStatus {
  const row = object(value), budget = row.budget === null ? null : object(row.budget);
  if (row.control !== 'disable_only' || row.budget_source !== 'configured_reservation_ledger'
    || row.provider_billing_available !== false) throw invalid();
  const result: SystemStatus = { checkedAt: new Date().toISOString(), enabled: boolean(row.shared_enabled),
    deploymentEnabled: boolean(row.deployment_enabled), migrationReady: true,
    // This successful read proves schema availability for this environment only.
    // P's contract does not attest provider/ingress/canary; never invent those gates.
    storageReady: false, ingressReady: false, canaryReady: false,
    activationAllowed: boolean(row.activation_allowed),
    blockers: ['DIRECT_ACTIVATION_BLOCKED', 'STORAGE_UNAVAILABLE', 'INGRESS_UNVERIFIED', 'CANARY_REQUIRED', 'PRODUCTION_MIGRATION_UNVERIFIED'],
    budget: budget ? { verified: boolean(budget.allowance_verified), current: boolean(budget.current),
      limitBytes: decimal(budget.byte_limit), reservedBytes: decimal(budget.reserved_bytes), remainingBytes: decimal(budget.remaining_bytes),
      startsAt: timestamp(budget.starts_at), expiresAt: timestamp(budget.expires_at) } : null };
  if (result.budget && (BigInt(result.budget.reservedBytes) > BigInt(result.budget.limitBytes)
    || BigInt(result.budget.remainingBytes) !== BigInt(result.budget.limitBytes) - BigInt(result.budget.reservedBytes)
    || Date.parse(result.budget.expiresAt) <= Date.parse(result.budget.startsAt))) throw invalid();
  return result;
}
const csrfPattern = /^[0-9]{10}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;
export async function request(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT'; body?: unknown; csrf?: string; signal?: AbortSignal } = {}) {
  if (options.method && options.method !== 'GET' && !csrfPattern.test(options.csrf || '')) throw new AdminApiError(403, 'CSRF_REQUIRED');
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
/** Bounded keyset reads. Partial/duplicate pages fail closed instead of hiding records. */
async function all<T extends { id: string }>(path: string, parse: (value: unknown) => T, signal?: AbortSignal) {
  const items: T[] = [], seen = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const row = await request(`${path}&limit=100${after ? `&after=${id(after)}` : ''}`, { signal });
    const batch = list(row.items, parse, 100);
    for (const item of batch) { if (seen.has(item.id)) throw invalid(); seen.add(item.id); items.push(item); }
    const next = nullableId(row.next_after);
    if (next === null) return items;
    if (!batch.length || next !== batch.at(-1)?.id || next === after) throw invalid();
    after = next;
  }
  throw invalid();
}
/** Only fixed same-origin endpoints. Response URLs are never navigation destinations. */
export const adminApi = {
  async csrf(signal?: AbortSignal) {
    const row = await request('/api/admin/session', { signal });
    const token = text(row.csrf_token, 256);
    if (!csrfPattern.test(token)) throw invalid(); timestamp(row.expires_at); return token;
  },
  async applications(after: number | null = null, signal?: AbortSignal) {
    const row = await request(`/api/admin/catalog?limit=50${after === null ? '' : `&after=${number(after, 1)}`}`, { signal });
    const items = list(row.items, app, 50), nextAfter = row.next_after === null ? null : number(row.next_after, 1);
    if (items.some((item, i) => item.id <= (i ? items[i - 1].id : after ?? 0))
      || (nextAfter !== null && nextAfter !== items.at(-1)?.id)) throw invalid();
    return { items, nextAfter };
  },
  async detail(applicationId: number, signal?: AbortSignal): Promise<AppDetail> {
    const application = number(applicationId, 1);
    const [catalog, config, versions] = await Promise.all([
      request(`/api/admin/catalog?limit=1${application > 1 ? `&after=${application - 1}` : ''}`, { signal }),
      request(`/api/admin/downloads/config/${application}`, { signal }),
      all(`/api/admin/downloads/versions?application_id=${application}`, version, signal),
    ]);
    const selected = list(catalog.items, app, 1)[0];
    if (!selected || selected.id !== application || number(config.application_id, 1) !== application
      || versions.some(v => v.applicationId !== application)) throw invalid();
    const mode = enumValue<Mode>(config.mode, ['legacy', 'direct', 'disabled']);
    const currentVersionId = nullableId(config.current_version_id);
    if (currentVersionId && !versions.some(v => v.id === currentVersionId)) throw invalid();
    const files: Artifact[] = [];
    // Limit independent file-list requests; no unbounded fan-out for large catalogs.
    for (let offset = 0; offset < versions.length; offset += 5) {
      const groups = await Promise.all(versions.slice(offset, offset + 5).map(async v => {
        const rows = await all(`/api/admin/downloads/files?version_id=${v.id}`, artifact, signal);
        if (rows.some(f => f.versionId !== v.id)) throw invalid(); return rows;
      }));
      files.push(...groups.flat());
    }
    return { app: { ...selected, mode, currentVersionId, configRevision: revision(config.revision) }, versions, files,
      blockers: ['DIRECT_ACTIVATION_BLOCKED'], directActivationAllowed: false };
  },
  async status(signal?: AbortSignal) { return status(await request('/api/admin/downloads/status', { signal })); },
  async saveVersion(input: VersionInput, csrf: string, versionId?: string) {
    await request(`/api/admin/downloads/versions${versionId ? `/${id(versionId)}` : ''}`, { method: versionId ? 'PATCH' : 'POST', body: input, csrf });
  },
  async saveFile(input: FileInput, csrf: string) {
    await request('/api/admin/downloads/files', { method: 'POST', body: input, csrf });
  },
  async fileAction(fileId: string, action: FileAction, expectedRevision: string, csrf: string) {
    await request(`/api/admin/downloads/files/${id(fileId)}`, { method: 'PATCH',
      body: { action, expected_revision: revision(expectedRevision) }, csrf });
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
