import { UUID } from '@/lib/downloads/rules';

export class AdminError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const invalid = () => new AdminError(400, 'INVALID_REQUEST');
export function fields(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => ![...required, ...optional].includes(key))) throw invalid();
}
export function id(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2147483647) throw invalid();
  return Number(value);
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid();
  return value.toLowerCase();
}
export function text(value: unknown, max: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.length || value.length > max || value.trim() !== value
    || /[\p{Cc}\p{Cf}]/u.test(value) || (pattern && !pattern.test(value))) throw invalid();
  return value;
}
export const key = (value: unknown) => text(value, 100, /^[a-z0-9][a-z0-9._-]*$/);
export function choice(value: unknown, allowed: string[]): string {
  if (typeof value !== 'string' || !allowed.includes(value)) throw invalid();
  return value;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
export function revision(value: unknown): string {
  return text(value, 64, /^[a-f0-9]{64}$/);
}
export const APK_MIME = 'application/vnd.android.package-archive';
export const FILE_FIELDS = ['variant_key', 'artifact_type', 'size_bytes', 'sha256', 'mime_type',
  'download_filename', 'storage_backend', 'storage_key', 'storage_object_version'];
export type FileMetadata = {
  variant_key: string; artifact_type: 'apk'; size_bytes: number; sha256: string; mime_type: string;
  download_filename: string; storage_backend: 'railway-s3' | 's3'; storage_key: string; storage_object_version: string | null;
};
export function metadata(body: Record<string, unknown>, fileId: string): FileMetadata {
  fields(body, FILE_FIELDS);
  const variant_key = key(body.variant_key), sha256 = text(body.sha256, 64, /^[a-f0-9]{64}$/);
  if (body.artifact_type !== 'apk' || body.mime_type !== APK_MIME
    || !Number.isSafeInteger(body.size_bytes) || Number(body.size_bytes) < 1 || Number(body.size_bytes) > 2147483648
    || typeof body.storage_backend !== 'string' || !['railway-s3', 's3'].includes(body.storage_backend)) throw invalid();
  const download_filename = text(body.download_filename, 180, /^[^/\\";%]+\.apk$/);
  if (download_filename.startsWith('.')) throw invalid();
  const storage_key = text(body.storage_key, 512);
  if (storage_key !== `artifacts/${fileId}/${sha256}.apk`) throw invalid();
  const storage_object_version = body.storage_object_version === null ? null
    : text(body.storage_object_version, 200, /^[a-zA-Z0-9._~+/-]+$/);
  if (storage_object_version === 'null') throw invalid();
  if (body.storage_backend === 'railway-s3' && storage_object_version !== null) throw invalid();
  return { variant_key, artifact_type: 'apk', size_bytes: Number(body.size_bytes), sha256, mime_type: APK_MIME,
    download_filename, storage_backend: body.storage_backend as FileMetadata['storage_backend'], storage_key, storage_object_version };
}
export function pagination(request: Request, scope?: 'application_id' | 'version_id') {
  const query = new URL(request.url).searchParams;
  const allowed = ['after', 'limit', ...(scope ? [scope] : [])];
  for (const name of query.keys()) if (!allowed.includes(name) || query.getAll(name).length !== 1) throw invalid();
  const limitValue = query.get('limit') ?? '50';
  if (!/^[1-9][0-9]{0,2}$/.test(limitValue) || Number(limitValue) > 100) throw invalid();
  let after: number | string | null = null;
  if (query.has('after')) {
    const value = query.get('after')!;
    if (scope) after = uuid(value);
    else { if (!/^[1-9][0-9]*$/.test(value)) throw invalid(); after = id(Number(value)); }
  }
  let parent: number | string | null = null;
  if (scope === 'application_id') {
    const value = query.get(scope) ?? '';
    if (!/^[1-9][0-9]*$/.test(value)) throw invalid();
    parent = id(Number(value));
  } else if (scope) parent = uuid(query.get(scope));
  return { limit: Number(limitValue), after, parent };
}
