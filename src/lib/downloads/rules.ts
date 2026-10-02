import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const COOLDOWN_SECONDS = 20;
export const CLIENT_SECONDS = 7 * 86400;
export const hashSecret = (value: string) => createHash('sha256').update(value).digest('hex');
export const newSecret = () => randomBytes(32).toString('base64url');
export function validSecret(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
    && Buffer.from(value, 'base64url').toString('base64url') === value;
}
export function validToken(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('wzdl1_') && validSecret(value.slice(6));
}
export function matchesSecret(value: string, hash: string | null) {
  return Boolean(hash && /^[a-f0-9]{64}$/.test(hash)
    && timingSafeEqual(Buffer.from(hashSecret(value), 'hex'), Buffer.from(hash, 'hex')));
}
export class DownloadError extends Error {
  constructor(public status: number, public code: string, public retryAt: Date | null = null,
    public serverTime: Date = new Date()) { super(code); }
  get retrySeconds() {
    return this.retryAt ? Math.max(1, Math.ceil((this.retryAt.getTime() - this.serverTime.getTime()) / 1000)) : null;
  }
}
export const unavailable = () => new DownloadError(503, 'VERIFICATION_UNAVAILABLE');
export function refill(tokens: number, updated: Date, now: Date, capacity: number, perMinute: number) {
  const available = Math.min(capacity, tokens + Math.max(0, now.getTime() - updated.getTime()) / 60000 * perMinute);
  return { available, wait: available >= 1 ? 0 : Math.ceil((1 - available) * 60000 / perMinute) };
}
export function safeFilename(value: string) {
  return value.length > 0 && value.length <= 180 && !/[\/\\\x00-\x1f\x7f]/.test(value)
    && value !== '.' && value !== '..' && value.endsWith('.apk');
}
export function exactFields(body: Record<string, unknown>, fields: string[]) {
  if (Object.keys(body).length !== fields.length || fields.some(key => !(key in body)))
    throw new DownloadError(400, 'INVALID_REQUEST');
}
