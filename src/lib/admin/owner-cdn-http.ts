import 'server-only';
import type { Sql } from 'postgres';
import { authorizeOwnerRequest, requireOwner } from '@/lib/authorization';
import { getSql } from '@/lib/db';
import { legacyDelivery } from '@/lib/delivery/legacy';
import { downloadBody, downloadHeaders } from '@/lib/downloads/http';
import { ownerCdnCache, ownerScopeKey } from '@/lib/downloads/owner-cdn';
import { consumeWindow } from '@/lib/security/limits';
import { adminOrigin, adminSession, checkAdminCsrf } from './security';
import { adminErrorResponse } from './http';
import { AdminError } from './validation';

type Dependencies = { sql: Sql; env: NodeJS.ProcessEnv; cache?: typeof ownerCdnCache };
export function createOwnerCdnHandler(dependencies?: Dependencies) {
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return new Response(null, { status: 405, headers: { ...downloadHeaders, Allow: 'GET, POST' } });
      const env = dependencies?.env ?? process.env, write = request.method === 'POST';
      const origin = adminOrigin(request, env, write), denied = await authorizeOwnerRequest(request, false);
      if (denied) throw new AdminError(denied, 'OWNER_REQUIRED');
      const owner = await requireOwner(), session = adminSession(request, env);
      if (write) checkAdminCsrf(request.headers.get('x-csrf-token'), session, owner.id, origin);
      if (env.OWNER_CDN_TEST_ENABLED !== 'true') throw new AdminError(503, 'OWNER_TEST_DISABLED');
      const sql = dependencies?.sql ?? getSql(); if (!sql) throw new AdminError(503, 'ADMIN_UNAVAILABLE');
      if (!await consumeWindow(sql, `owner-cdn:${write ? 'write' : 'read'}:${owner.id}`, write ? 10 : 60, 60)) throw new AdminError(429, 'RATE_LIMITED');
      const url = new URL(request.url);
      if (write && url.search) throw new AdminError(400, 'INVALID_REQUEST');
      const body = write ? await downloadBody(request, false, 8192) : Object.fromEntries(url.searchParams);
      if (!write && (Object.keys(body).length !== 1 || url.searchParams.getAll('application_id').length !== 1)) throw new AdminError(400, 'INVALID_REQUEST');
      const id = write ? body.application_id : /^[1-9][0-9]{0,9}$/.test(String(body.application_id)) ? Number(body.application_id) : null;
      if (!Number.isSafeInteger(id) || Number(id) < 1 || Number(id) > 2147483647) throw new AdminError(400, 'INVALID_REQUEST');
      const source = await legacyDelivery(sql, Number(id), env);
      if (source.provider !== 'steamrip') throw new AdminError(409, 'PROVIDER_TEST_UNAVAILABLE');
      const scope = ownerScopeKey(owner.id, session), cache = dependencies?.cache ?? ownerCdnCache;
      if (!write) return Response.json({ application_id: id, source_revision: source.revision, source_url: source.destination,
        owner_test: cache.peek(scope, Number(id), source.revision, source.destination) }, { headers: downloadHeaders });
      const clear = body.action === 'clear';
      const fields = clear ? ['action', 'application_id', 'expected_revision']
        : ['application_id', 'expected_revision', 'bzzhr_page', 'signed_url', 'allow_unverified', 'confirm_source'];
      if (Object.keys(body).length !== fields.length || fields.some(k => !Object.hasOwn(body, k))) throw new AdminError(400, 'INVALID_REQUEST');
      if (body.expected_revision !== source.revision) throw new AdminError(409, 'SOURCE_CHANGED');
      if (clear) { cache.clear(scope, Number(id), source.revision, source.destination); return Response.json({ cleared: true }, { headers: downloadHeaders }); }
      if (typeof body.bzzhr_page !== 'string' || body.bzzhr_page.length > 2048 || typeof body.signed_url !== 'string' || body.signed_url.length > 4096
        || typeof body.allow_unverified !== 'boolean' || body.confirm_source !== true) throw new AdminError(400, 'INVALID_REQUEST');
      let result;
      try { result = await cache.put(scope, Number(id), source.revision, source.destination, body.bzzhr_page, body.signed_url,
        body.allow_unverified, AbortSignal.any([request.signal, AbortSignal.timeout(12000)])); }
      catch (error) { const code = String((error as { code?: unknown })?.code); throw new AdminError(409, /^[A-Z_]+$/.test(code) ? code : 'LINK_VALIDATION_FAILED'); }
      try {
        const current = await legacyDelivery(sql, Number(id), env);
        if (current.revision !== source.revision) throw new AdminError(409, 'SOURCE_CHANGED');
      } catch (error) { cache.clear(scope, Number(id), source.revision, source.destination); throw error; }
      return Response.json({ application_id: id, owner_test: result }, { headers: downloadHeaders });
    } catch (error) { return adminErrorResponse(error); }
  };
}
