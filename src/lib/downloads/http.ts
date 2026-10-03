import 'server-only';
import { randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import { CLIENT_SECONDS, DownloadError, UUID, exactFields, matchesSecret, unavailable, validSecret, validToken } from './rules';
import { trustedNetworks } from './network';
import { DownloadService, type DownloadIdentity, type Selection } from './service';

type Operation = 'session' | 'request' | 'status' | 'token' | 'redeem' | 'control';
export const downloadHeaders = {
  'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
};
function cookie(request: Request, name: string) {
  const values = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(name + '='));
  if (values.length > 1) throw new DownloadError(401, 'DOWNLOAD_SESSION_REQUIRED');
  return values[0]?.slice(name.length + 1);
}
function canonicalOrigin(env: NodeJS.ProcessEnv) {
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL || '');
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || (env.NODE_ENV === 'production' && url.protocol !== 'https:')
      || !['https:', 'http:'].includes(url.protocol)) throw unavailable();
    return url.origin;
  } catch { throw unavailable(); }
}
function originGuard(request: Request, env: NodeJS.ProcessEnv, write: boolean) {
  const origin = canonicalOrigin(env), site = request.headers.get('sec-fetch-site');
  if ((site && site !== 'same-origin') || (write && request.headers.get('origin') !== origin)
    || (!write && request.headers.has('origin') && request.headers.get('origin') !== origin))
    throw new DownloadError(403, write ? 'ORIGIN_REJECTED' : 'CSRF_REJECTED');
}
export async function downloadBody(request: Request, form = false, maxBytes = 2048): Promise<Record<string, unknown>> {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== (form ? 'application/x-www-form-urlencoded' : 'application/json')) throw new DownloadError(415, 'UNSUPPORTED_MEDIA_TYPE');
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new DownloadError(413, 'REQUEST_TOO_LARGE');
  if (!request.body) throw new DownloadError(400, 'INVALID_REQUEST');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new DownloadError(413, 'REQUEST_TOO_LARGE'); }
      chunks.push(value);
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    if (form) {
      const data: Record<string, unknown> = {};
      for (const [key, value] of new URLSearchParams(text)) {
        if (Object.hasOwn(data, key)) throw new DownloadError(400, 'INVALID_REQUEST');
        Object.defineProperty(data, key, { value, enumerable: true });
      }
      return data;
    }
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new DownloadError(400, 'INVALID_REQUEST');
    return data;
  } catch (error) {
    if (error instanceof DownloadError) throw error;
    throw new DownloadError(400, 'INVALID_REQUEST');
  } finally { reader.releaseLock(); }
}
const message = (error: DownloadError) => error.status === 429 ? 'طلبات كثيرة؛ انتظر قبل المحاولة مجددًا.'
  : error.status === 425 ? 'لم تنتهِ مهلة تجهيز التحميل.' : 'تعذر تنفيذ طلب التحميل.';
export function downloadErrorResponse(error: unknown, request?: Request, html = false) {
  const e = error instanceof DownloadError ? error : unavailable();
  const headers: Record<string, string> = { ...downloadHeaders };
  if (e.retrySeconds !== null) headers['Retry-After'] = String(e.retrySeconds);
  else if (e.status === 503) headers['Retry-After'] = '10';
  if (html && !request?.headers.get('accept')?.includes('application/json')) {
    headers['Content-Type'] = 'text/html; charset=utf-8';
    // Only server-controlled codes/messages; no supplied values, tokens or file metadata.
    return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تعذر التحميل</title><main data-error-code="${e.code}"><h1>تعذر التحميل</h1><p>${message(e)}</p><a href="/">العودة إلى وليد زون</a></main></html>`, { status: e.status, headers });
  }
  return Response.json({ error: { code: e.code, message: message(e), retry_after_seconds: e.retrySeconds,
    retry_at: e.retryAt?.toISOString() ?? null }, server_time: e.serverTime.toISOString(), trace_id: randomUUID() }, { status: e.status, headers });
}
export function downloadMethodNotAllowed(_request?: Request, allow = 'POST') {
  const response = downloadErrorResponse(new DownloadError(405, 'METHOD_NOT_ALLOWED'));
  response.headers.set('Allow', allow); return response;
}

export function createDownloadHandler(operation: Operation, dependencies?: { service: DownloadService; env: NodeJS.ProcessEnv }) {
  return async (request: Request, requestId?: string): Promise<Response> => {
    try {
      const env = dependencies?.env ?? process.env;
      const write = operation !== 'status';
      if (request.method !== (write ? 'POST' : 'GET')) return downloadMethodNotAllowed(request, write ? 'POST' : 'GET');
      originGuard(request, env, write);
      // No query-string tokens or alternative authority on any endpoint.
      if (new URL(request.url).search) throw new DownloadError(400, 'INVALID_REQUEST');
      const networks = trustedNetworks(request, env);
      const sql = dependencies ? null : getSql();
      if (!dependencies && !sql) throw unavailable();
      const service = dependencies?.service ?? new DownloadService(sql!, {
        enabled: env.DIRECT_DOWNLOADS_ENABLED === 'true',
        hosts: (env.DOWNLOAD_ALLOWED_DELIVERY_HOSTS || '').split(',').map(x => x.trim()).filter(Boolean),
      });
      // Also counts malformed/unauthenticated bodies before identity and CSRF work.
      await service.attemptPolicies(networks.map(n => ({ key: `ingress:${n}`, capacity: 40, perMinute: 120 })));
      const userId = await service.userId(cookie(request, env.NODE_ENV === 'production' ? '__Host-wz_session' : 'wz_session'));
      const name = env.NODE_ENV === 'production' ? '__Host-wz_download_client' : 'wz_download_client';
      const secret = cookie(request, name);
      if (secret && !validSecret(secret)) throw new DownloadError(401, 'DOWNLOAD_SESSION_REQUIRED');
      if (operation === 'session') {
        const body = await downloadBody(request); exactFields(body, []);
        const result = await service.bootstrap(secret ?? null, networks);
        const headers: Record<string, string> = { ...downloadHeaders,
          'Set-Cookie': `${name}=${result.cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CLIENT_SECONDS}${env.NODE_ENV === 'production' ? '; Secure' : ''}` };
        return Response.json({ csrf_token: result.csrf_token, server_time: result.server_time }, { headers });
      }
      if (!secret) throw new DownloadError(401, 'DOWNLOAD_SESSION_REQUIRED');
      const client = await service.client(secret);
      if (!client) throw new DownloadError(401, 'DOWNLOAD_SESSION_REQUIRED');
      const identity: DownloadIdentity = { clientId: client.id, userId,
        principal: userId ? `user:${userId}` : `client:${client.id}`, networks };
      await service.attempts(identity, operation === 'control' ? 'request' : operation);
      const body = write ? await downloadBody(request, operation === 'redeem') : {};
      if (write) {
        const csrf = operation === 'redeem' ? body.csrf_token : request.headers.get('x-csrf-token');
        if (!validSecret(csrf) || !matchesSecret(csrf, client.csrf_hash)) throw new DownloadError(403, 'CSRF_REJECTED');
      }
      if (operation === 'control') {
        if (!env.OWNER_USER_ID || userId !== env.OWNER_USER_ID) throw new DownloadError(userId ? 403 : 401, 'OWNER_REQUIRED');
        exactFields(body, ['enabled']);
        if (body.enabled !== false) throw new DownloadError(400, 'INVALID_REQUEST');
        return Response.json(await service.disable(userId), { headers: downloadHeaders });
      }
      if (operation === 'request') {
        exactFields(body, ['application_id', 'version_id', 'file_id']);
        const key = request.headers.get('idempotency-key');
        if (!Number.isSafeInteger(body.application_id) || Number(body.application_id) <= 0 || Number(body.application_id) > 2147483647
          || typeof body.version_id !== 'string' || !UUID.test(body.version_id)
          || typeof body.file_id !== 'string' || !UUID.test(body.file_id) || !key || !UUID.test(key)) throw new DownloadError(400, 'INVALID_REQUEST');
        const admitted = await service.admit(identity, { ...body, version_id: body.version_id.toLowerCase(), file_id: body.file_id.toLowerCase() } as Selection, key.toLowerCase());
        return Response.json(admitted.data, { status: admitted.created ? 201 : 200,
          headers: { ...downloadHeaders, Location: admitted.data.status_url } });
      }
      if (operation === 'redeem') {
        exactFields(body, ['request_id', 'token', 'csrf_token']);
        if (!validToken(body.token)) throw new DownloadError(400, 'INVALID_TOKEN_FORMAT');
        if (typeof body.request_id !== 'string' || !UUID.test(body.request_id)) throw new DownloadError(400, 'INVALID_REQUEST_ID');
        const url = await service.redeem(identity, body.request_id.toLowerCase(), body.token);
        return new Response(null, { status: 303, headers: { ...downloadHeaders, Location: url } });
      }
      if (!requestId || !UUID.test(requestId)) throw new DownloadError(400, 'INVALID_REQUEST_ID');
      if (operation === 'token') {
        exactFields(body, []);
        return Response.json(await service.issue(identity, requestId.toLowerCase()), { headers: downloadHeaders });
      }
      return Response.json(await service.status(identity, requestId.toLowerCase()), { headers: downloadHeaders });
    } catch (error) { return downloadErrorResponse(error, request, operation === 'redeem'); }
  };
}
