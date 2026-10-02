import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { validSecret } from '@/lib/downloads/rules';
import { AdminError } from './validation';

const TTL_SECONDS = 900;
export function adminOrigin(request: Request, env: NodeJS.ProcessEnv, write: boolean): string {
  let url: URL;
  try { url = new URL(env.NEXT_PUBLIC_SITE_URL || ''); } catch { throw new AdminError(503, 'ADMIN_UNAVAILABLE'); }
  if (!['https:', 'http:'].includes(url.protocol) || (env.NODE_ENV === 'production' && url.protocol !== 'https:')
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new AdminError(503, 'ADMIN_UNAVAILABLE');
  const site = request.headers.get('sec-fetch-site'), origin = request.headers.get('origin');
  if ((site && site !== 'same-origin') || (write && origin !== url.origin)
    || (!write && origin !== null && origin !== url.origin)) throw new AdminError(403, 'ORIGIN_REJECTED');
  return url.origin; // Never trust request Host, Forwarded, X-Forwarded-Host or URL authority.
}
export function adminSession(request: Request, env: NodeJS.ProcessEnv): string {
  const name = env.NODE_ENV === 'production' ? '__Host-wz_session' : 'wz_session';
  const cookies = (request.headers.get('cookie') || '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(name + '='));
  const secret = cookies[0]?.slice(name.length + 1);
  if (cookies.length !== 1 || !validSecret(secret)) throw new AdminError(401, 'OWNER_REQUIRED');
  return secret;
}
function mac(session: string, ownerId: string, origin: string, payload: string) {
  return createHmac('sha256', session).update(JSON.stringify(['wz-admin-csrf-v1', ownerId, origin, payload])).digest();
}
/** Stateless CSRF token authenticated by, and bound to, the existing opaque session.
 * No additional cookie, schema, auth model or process-local session store is needed. */
export function issueAdminCsrf(session: string, ownerId: string, origin: string, now = Date.now()) {
  const expires_at = Math.floor(now / 1000) + TTL_SECONDS;
  const payload = `${expires_at}.${randomBytes(32).toString('base64url')}`;
  return { csrf_token: `${payload}.${mac(session, ownerId, origin, payload).toString('base64url')}`,
    expires_at: new Date(expires_at * 1000).toISOString() };
}
export function checkAdminCsrf(token: string | null, session: string, ownerId: string, origin: string, now = Date.now()) {
  const parts = token?.split('.') ?? [];
  if (parts.length !== 3 || !/^[0-9]{10}$/.test(parts[0]) || !validSecret(parts[1]) || !validSecret(parts[2]))
    throw new AdminError(403, 'CSRF_REJECTED');
  const expiry = Number(parts[0]), time = Math.floor(now / 1000);
  if (expiry <= time || expiry > time + TTL_SECONDS
    || !timingSafeEqual(Buffer.from(parts[2], 'base64url'), mac(session, ownerId, origin, `${parts[0]}.${parts[1]}`)))
    throw new AdminError(403, 'CSRF_REJECTED');
}
