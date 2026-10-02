import 'server-only';
import { DownloadError, safeFilename } from './rules';
import { configuredStorageAdapters } from './adapters/s3';

export type ObjectRef = { backend: string; key: string; objectVersion?: string };
export type ObjectMetadata = { sizeBytes: bigint; contentType: string; objectVersion?: string; sha256: string };
export type DeliveryGrant = { url: string; expiresAt: Date; deliveryHost: string };
/** Adapters must sign one exact immutable object for GET, support Range, and never relay bytes.
 * sha256 is a trusted provider checksum, not an ETag. Signing is side-effect free/idempotent.
 * Adapters must honour AbortSignal and implement exact URL/object correspondence validation. */
export interface DownloadStorage {
  headObject(ref: ObjectRef, signal: AbortSignal): Promise<ObjectMetadata>;
  createDeliveryGrant(input: { ref: ObjectRef; expiresInSeconds: number; filename: string;
    contentType: string; requestId: string }, signal: AbortSignal): Promise<DeliveryGrant>;
  matchesObject(grant: DeliveryGrant, ref: ObjectRef): boolean;
}
// Server configuration only. Missing/invalid configuration leaves the registry empty and fails closed.
// This does not enable downloads: deployment + shared database gates still apply independently.
export const storageAdapters: Readonly<Record<string, DownloadStorage>> = configuredStorageAdapters();
export function validateGrant(grant: DeliveryGrant, ref: ObjectRef, adapter: DownloadStorage,
  allowedHosts: readonly string[], now: Date) {
  let url: URL;
  try { url = new URL(grant.url); } catch { throw new DownloadError(503, 'STORAGE_UNAVAILABLE'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
    || url.hostname !== grant.deliveryHost || !allowedHosts.includes(url.hostname)
    || !(grant.expiresAt instanceof Date) || !Number.isFinite(grant.expiresAt.getTime())
    || grant.expiresAt.getTime() - now.getTime() < 30000
    || grant.expiresAt.getTime() - now.getTime() > 300000
    || !adapter.matchesObject(grant, ref)) throw new DownloadError(503, 'STORAGE_UNAVAILABLE');
  return grant; // Preserve the original string; reserializing could break a signature.
}
let preparations = 0, circuitUntil = 0;
export async function prepareDelivery(adapter: DownloadStorage, ref: ObjectRef, input: {
  sizeBytes: bigint; sha256: string; contentType: string; filename: string; requestId: string;
}, allowedHosts: readonly string[]) {
  if (preparations >= 2 || Date.now() < circuitUntil) throw new DownloadError(503, 'STORAGE_UNAVAILABLE', new Date(Date.now() + 10000));
  if (!safeFilename(input.filename)) throw new DownloadError(404, 'FILE_UNAVAILABLE');
  preparations++;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = (async () => {
      const meta = await adapter.headObject(ref, controller.signal);
      if (meta.sizeBytes !== input.sizeBytes || meta.contentType !== input.contentType
        || meta.sha256 !== input.sha256 || (ref.objectVersion && meta.objectVersion !== ref.objectVersion))
        throw new DownloadError(503, 'FILE_INTEGRITY_UNAVAILABLE');
      return validateGrant(await adapter.createDeliveryGrant({ ref, expiresInSeconds: 300,
        filename: input.filename, contentType: input.contentType, requestId: input.requestId }, controller.signal), ref, adapter, allowedHosts, new Date());
    })();
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new DownloadError(503, 'STORAGE_UNAVAILABLE')); }, 3000);
    })]);
  } catch (error) {
    if (!(error instanceof DownloadError) || error.code === 'STORAGE_UNAVAILABLE') circuitUntil = Date.now() + 10000;
    if (error instanceof DownloadError) throw error;
    throw new DownloadError(503, 'STORAGE_UNAVAILABLE', new Date(Date.now() + 10000));
  } finally { clearTimeout(timer); preparations--; }
}
