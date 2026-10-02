import type { DownloadFile, DownloadRequest, DownloadToken } from './types';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^wzdl1_[A-Za-z0-9_-]{43}$/;
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export class DownloadApiError extends Error {
  constructor(public status: number, public code: string, public waitSeconds = 0) {
    super(code);
  }
}

/** Use server-relative durations and monotonic time, not the visitor's wall clock. */
export function deadline(at: string, serverTime: string, now = performance.now()): number {
  if (!validDate(at) || !validDate(serverTime)) throw new DownloadApiError(502, 'INVALID_RESPONSE');
  return now + Math.max(0, Date.parse(at) - Date.parse(serverTime));
}

export function secondsLeft(at: number, now = performance.now()): number {
  return Math.max(0, Math.ceil((at - now) / 1000));
}

export function retrySeconds(headers: Headers, body: Record<string, any>): number {
  const error = body.error || {};
  const candidates: number[] = [];
  const header = headers.get('Retry-After');
  if (header && /^\d+$/.test(header)) candidates.push(Number(header));
  // Date-valued Retry-After uses the server's clock when supplied.
  else if (header && validDate(header) && validDate(body.server_time)) candidates.push((Date.parse(header) - Date.parse(body.server_time)) / 1000);
  if (typeof error.retry_after_seconds === 'number' && Number.isFinite(error.retry_after_seconds)) candidates.push(error.retry_after_seconds);
  if (validDate(error.retry_at) && validDate(body.server_time)) candidates.push((Date.parse(error.retry_at) - Date.parse(body.server_time)) / 1000);
  if (validDate(body.ready_at) && validDate(body.server_time)) candidates.push((Date.parse(body.ready_at) - Date.parse(body.server_time)) / 1000);
  return Math.max(1, Math.ceil(Math.max(0, ...candidates.filter(Number.isFinite)))) || 1;
}

async function json(path: string, options: RequestInit = {}): Promise<Record<string, any>> {
  let response: Response;
  try {
    response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
  } catch {
    throw new DownloadApiError(0, 'NETWORK_ERROR');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new DownloadApiError(response.status, typeof body?.error?.code === 'string' ? body.error.code : 'SERVICE_UNAVAILABLE', retrySeconds(response.headers, body || {}));
  if (!body || typeof body !== 'object') throw new DownloadApiError(502, 'INVALID_RESPONSE');
  return body;
}

const post = (csrf?: string, extra: Record<string, string> = {}): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...extra }, body: '{}',
});

function requestData(body: Record<string, any>): DownloadRequest {
  if (!UUID.test(body.request_id || '') || !['pending', 'ready', 'issued', 'redeemed', 'expired', 'revoked'].includes(body.state)
    || !validDate(body.server_time) || !validDate(body.ready_at) || !validDate(body.request_expires_at)
    || Date.parse(body.request_expires_at) <= Date.parse(body.ready_at)) throw new DownloadApiError(502, 'INVALID_RESPONSE');
  // Deliberately discard status_url and any additional fields, especially delivery URLs.
  return { request_id: body.request_id, state: body.state, server_time: body.server_time, ready_at: body.ready_at, request_expires_at: body.request_expires_at };
}

export const downloadApi = {
  async session(): Promise<string> {
    const body = await json('/api/downloads/session', post());
    if (typeof body.csrf_token !== 'string' || !body.csrf_token || body.csrf_token.length > 512) throw new DownloadApiError(502, 'INVALID_RESPONSE');
    return body.csrf_token;
  },
  async request(file: DownloadFile, csrf: string, key: string): Promise<DownloadRequest> {
    return requestData(await json('/api/downloads/requests', {
      ...post(csrf, { 'Idempotency-Key': key }),
      body: JSON.stringify({ application_id: file.application_id, version_id: file.version_id, file_id: file.file_id }),
    }));
  },
  async status(id: string): Promise<DownloadRequest> {
    if (!UUID.test(id)) throw new DownloadApiError(400, 'INVALID_REQUEST_ID');
    const result = requestData(await json(`/api/downloads/requests/${id}`));
    if (result.request_id !== id) throw new DownloadApiError(502, 'INVALID_RESPONSE');
    return result;
  },
  async token(id: string, csrf: string): Promise<DownloadToken> {
    if (!UUID.test(id)) throw new DownloadApiError(400, 'INVALID_REQUEST_ID');
    const body = await json(`/api/downloads/requests/${id}/token`, post(csrf));
    if (!TOKEN.test(body.token || '') || !validDate(body.server_time) || !validDate(body.token_expires_at)
      || Date.parse(body.token_expires_at) <= Date.parse(body.server_time) || body.redeem_url !== '/api/downloads/redeem') throw new DownloadApiError(502, 'INVALID_RESPONSE');
    return { token: body.token, server_time: body.server_time, token_expires_at: body.token_expires_at, redeem_url: body.redeem_url };
  },
};
