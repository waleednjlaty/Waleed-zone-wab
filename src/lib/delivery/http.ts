import 'server-only';
import { randomBytes } from 'node:crypto';
import { getSql } from '@/lib/db';
import type { Sql } from 'postgres';
import { adminOrigin } from '@/lib/admin/security';
import { DownloadError } from '@/lib/downloads/rules';
import { downloadBody, downloadHeaders, downloadErrorResponse, downloadMethodNotAllowed } from '@/lib/downloads/http';
import { LegacyCountdown, legacyDelivery } from './legacy';
import { consumeWindow, requestNetwork } from '@/lib/security/limits';

// Bounded per-process load shedding; no fake trusted IP from forwarding headers.
// This guards metadata APIs, not traffic to Telegram. Direct-download quotas remain unchanged.
let minute = 0, count = 0;
export function createLegacyHandler(operation: 'prepare' | 'redeem', dependencies?: { sql: Sql; env: NodeJS.ProcessEnv; now?: () => number }) {
  return async (request: Request) => {
    try {
      if (request.method !== 'POST') return downloadMethodNotAllowed();
      const env = dependencies?.env ?? process.env;
      try { adminOrigin(request,env,true); } catch { throw new DownloadError(403,'ORIGIN_REJECTED'); }
      if (new URL(request.url).search) throw new DownloadError(400,'INVALID_REQUEST');
      const current = Math.floor(Date.now()/60000); if (minute !== current) { minute=current;count=0; }
      if (++count > 1200) throw new DownloadError(429,'RATE_LIMITED',new Date(Date.now()+60000));
      const form = operation === 'redeem', body = await downloadBody(request,form);
      const allowed = form ? ['application_id','token'] : ['application_id'];
      if (Object.keys(body).length !== allowed.length || allowed.some(k=>!Object.hasOwn(body,k))) throw new DownloadError(400,'INVALID_REQUEST');
      const appId = form && typeof body.application_id === 'string' && /^[1-9][0-9]{0,9}$/.test(body.application_id) ? Number(body.application_id) : body.application_id;
      if (!Number.isSafeInteger(appId) || Number(appId)<1 || Number(appId)>2147483647) throw new DownloadError(400,'INVALID_REQUEST');
      const name = env.NODE_ENV === 'production' ? '__Host-wz_legacy_client' : 'wz_legacy_client';
      const cookies = (request.headers.get('cookie') || '').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));
      if (cookies.length > 1) throw new DownloadError(400,'INVALID_CLIENT');
      const value = cookies[0]?.slice(name.length+1);
      if (value && !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new DownloadError(400,'INVALID_CLIENT');
      if (form && !value) throw new DownloadError(403,'CLIENT_REQUIRED');
      const client = value || randomBytes(32).toString('base64url');
      const countdown = new LegacyCountdown(env.LEGACY_DOWNLOAD_SIGNING_KEY || '',dependencies?.now);
      const sql = dependencies?.sql ?? getSql(); if (!sql) throw new DownloadError(503,'DELIVERY_UNAVAILABLE');
      const network=requestNetwork(request,env);
      if(!await consumeWindow(sql,'legacy:network:'+network,network==='shared'?600:120,60)
        || !await consumeWindow(sql,`legacy:${operation}:client:${client}`,operation==='prepare'?30:60,60))
        throw new DownloadError(429,'RATE_LIMITED',new Date(Date.now()+60000));
      const source = await legacyDelivery(sql,Number(appId),env);
      if (!form) return Response.json(countdown.prepare(Number(appId),source.revision,client),{ headers:{ ...downloadHeaders,
        'Set-Cookie': `${name}=${client}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${env.NODE_ENV==='production'?'; Secure':''}` } });
      countdown.redeem(body.token,Number(appId),source.revision,client);
      return new Response(null,{ status:303,headers:{ ...downloadHeaders,Location:source.destination } });
    } catch (error) { return downloadErrorResponse(error,request,operation==='redeem'); }
  };
}
