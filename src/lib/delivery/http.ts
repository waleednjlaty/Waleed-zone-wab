import 'server-only';
import {scheduleMetrics} from '@/lib/analytics/schedule';
import { createHash, randomBytes } from 'node:crypto';
import { getSql } from '@/lib/db';
import type { Sql } from 'postgres';
import { adminOrigin } from '@/lib/admin/security';
import { DownloadError } from '@/lib/downloads/rules';
import { downloadBody, downloadHeaders, downloadErrorResponse, downloadMethodNotAllowed } from '@/lib/downloads/http';
import { LegacyCountdown, legacyDelivery } from './legacy';
import { providerRetry } from './retry';
import { resolveSteamrip } from '@/lib/downloads/providers/steamrip';
import { ProviderFailure } from '@/lib/downloads/providers/public-http';
import { browserManager } from '@/lib/downloads/browser/manager';
import { discoveryCache } from '@/lib/downloads/browser/cache';
import { consumeWindow, requestNetwork } from '@/lib/security/limits';
import { ownerCdnCache, ownerCdnScope } from '@/lib/downloads/owner-cdn';

/** Only stable, explicitly allowed provider landing pages may leave the error boundary. */
function safeManualSource(raw:string):string|null {
  try {
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)return null;
    if(['steamrip.com','www.steamrip.com'].includes(url.hostname))
      return /^\/[A-Za-z0-9-]+\/?$/.test(url.pathname)?url.href:null;
    if(['bzzhr.to','www.bzzhr.to','bzzhr.co','www.bzzhr.co','buzzheavier.com','www.buzzheavier.com'].includes(url.hostname))
      return /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)?url.href:null;
  } catch {/* Invalid URLs cannot be exposed as a fallback. */}
  return null;
}

// Bounded per-process load shedding; no fake trusted IP from forwarding headers.
// This guards metadata APIs, not traffic to Telegram. Direct-download quotas remain unchanged.
let minute = 0, count = 0;
export function createLegacyHandler(operation: 'prepare' | 'redeem' | 'status', dependencies?: { sql: Sql; env: NodeJS.ProcessEnv; now?: () => number; resolve?: typeof resolveSteamrip; browser?: typeof browserManager; ownerScope?: typeof ownerCdnScope; ownerCache?: typeof ownerCdnCache }) {
  return async (request: Request) => {
    let retry: {id:number;token:unknown;source:string;revision:string}|undefined;
    try {
      if (request.method !== 'POST') return downloadMethodNotAllowed();
      const env = dependencies?.env ?? process.env;
      try { adminOrigin(request,env,true); } catch { throw new DownloadError(403,'ORIGIN_REJECTED'); }
      if (new URL(request.url).search) throw new DownloadError(400,'INVALID_REQUEST');
      const current = Math.floor(Date.now()/60000); if (minute !== current) { minute=current;count=0; }
      if (++count > 1200) throw new DownloadError(429,'RATE_LIMITED',new Date(Date.now()+60000));
      const form = operation !== 'prepare', body = await downloadBody(request,form);
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
        || !await consumeWindow(sql,`legacy:${operation}:client:${client}`,operation==='prepare'?30:operation==='status'?40:60,60))
        throw new DownloadError(429,'RATE_LIMITED',new Date(Date.now()+60000));
      const source = await legacyDelivery(sql,Number(appId),env);
      const ownerScope = source.provider === 'steamrip' && env.OWNER_CDN_TEST_ENABLED === 'true'
        ? await (dependencies?.ownerScope ?? ownerCdnScope)(request, env) : null;
      const testCache = dependencies?.ownerCache ?? ownerCdnCache;
      const ownerTest = ownerScope ? testCache.peek(ownerScope, Number(appId), source.revision, source.destination) : null;
      if (!form) {
        const prepared=countdown.prepare(Number(appId),source.revision,client);
        const hash=createHash('sha256').update(prepared.token).digest('hex');
        await sql`INSERT INTO site_legacy_download_grants(token_hash,application_id,source_revision,ready_at,expires_at) VALUES(${hash},${Number(appId)},${source.revision},${prepared.ready_at},${prepared.expires_at})`;
        // Bounded cleanup through indexed expiry, never a full-table scan.
        await sql`DELETE FROM site_legacy_download_grants WHERE token_hash IN (SELECT token_hash FROM site_legacy_download_grants WHERE expires_at<clock_timestamp() ORDER BY expires_at LIMIT 100)`;
        scheduleMetrics([{metric:'download_prepare',id:Number(appId)}],request.headers);
        return Response.json({...prepared,...(ownerTest ? {owner_test:ownerTest} : {})},{ headers:{ ...downloadHeaders,
        'Set-Cookie': `${name}=${client}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${env.NODE_ENV==='production'?'; Secure':''}` } });
      }
      const payload=countdown.redeem(body.token,Number(appId),source.revision,client);
      const hash=createHash('sha256').update(body.token as string).digest('hex');
      const now=new Date((dependencies?.now??Date.now)()).toISOString();
      const manager=dependencies?.browser??browserManager;
      if(operation==='status') {
        const [live]=await sql`SELECT token_hash FROM site_legacy_download_grants WHERE token_hash=${hash}
          AND application_id=${Number(appId)} AND source_revision=${source.revision} AND consumed_at IS NULL
          AND ready_at<=${now}::timestamptz AND expires_at>${now}::timestamptz`;
        if(!live)throw new DownloadError(410,'TOKEN_USED');
        // Same-origin, client-bound grant and publication checked on every poll.
        // The worker's URLs, cookie jar and diagnostics never enter this response.
        return Response.json({state:manager.status(hash)??'READY'},{headers:downloadHeaders});
      }
      // Each failed provider attempt remains retryable, but only three attempts per grant.
      // This statement completes before any external request; no DB lease/lock spans network I/O.
      const attempts=await sql`UPDATE site_legacy_download_grants SET attempts=attempts+1
        WHERE token_hash=${hash} AND application_id=${Number(appId)} AND source_revision=${source.revision}
        AND consumed_at IS NULL AND attempts<3 AND ready_at<=${now}::timestamptz AND expires_at>${now}::timestamptz RETURNING token_hash`;
      if(!attempts.length)throw new DownloadError(410,'TOKEN_USED');
      retry={id:Number(appId),token:body.token,source:source.destination,revision:source.revision};
      let discovered:string[]|undefined;
      let destination=source.destination;
      let ownerResult:Awaited<ReturnType<typeof testCache.resolve>> = null;
      if(source.provider==='steamrip') {
        if (ownerScope && ownerTest) {
          ownerResult = await testCache.resolve(ownerScope, Number(appId), source.revision, source.destination,
            AbortSignal.any([request.signal, AbortSignal.timeout(12000)]));
          if (!ownerResult) throw new DownloadError(409, 'OWNER_LINK_EXPIRED');
          destination = ownerResult.destination;
        } else if(env.BACKGROUND_BROWSER_ENABLED==='true'&&!dependencies?.resolve) {
          const cache=discoveryCache(sql),cached=await cache.read(Number(appId),source.revision,source.destination);
          const result=await manager.resolve(Number(appId),source.revision,source.destination,cached,hash,
            AbortSignal.any([request.signal,AbortSignal.timeout(Math.max(1,Math.min(45000,payload.expires_at-(dependencies?.now??Date.now)())))]));
          destination=result.destination;discovered=result.discovered;
        } else destination=await (dependencies?.resolve??resolveSteamrip)(Number(appId),source.revision,source.destination);
      }
      await sql.begin('isolation level read committed',async tx=>{
        await tx`SET LOCAL lock_timeout='2s'`;
        await tx`SET LOCAL statement_timeout='3s'`;
        // Also blocks FK-backed insertion of a previously absent config/source.
        // This short lock begins only after all external resolution has completed.
        await tx`SELECT id FROM applications WHERE id=${Number(appId)} FOR UPDATE`;
        await tx`SELECT application_id FROM site_download_app_config WHERE application_id=${Number(appId)} FOR SHARE`;
        await tx`SELECT application_id FROM site_delivery_sources WHERE application_id=${Number(appId)} FOR SHARE`;
        const current=await legacyDelivery(tx as unknown as Sql,Number(appId),env);
        if(current.revision!==source.revision)throw new DownloadError(409,'SOURCE_CHANGED');
        countdown.redeem(body.token,Number(appId),current.revision,client);
        ownerResult?.assertCurrent();
        if(discovered)await discoveryCache(tx as unknown as Sql).write(Number(appId),source.revision,source.destination,discovered);
        const consumed=await tx`UPDATE site_legacy_download_grants SET consumed_at=${new Date((dependencies?.now??Date.now)()).toISOString()}::timestamptz
          WHERE token_hash=${hash} AND consumed_at IS NULL RETURNING token_hash`;
        if(!consumed.length)throw new DownloadError(410,'TOKEN_USED');
      });
      ownerResult?.assertCurrent();
      scheduleMetrics([{metric:'download_redeem',id:Number(appId)},
        {metric:source.provider==='telegram'?'telegram_redirect':'external_download_redirect',id:Number(appId)}],request.headers);
      // SAME route, only after the grant is atomically consumed; no file proxy.
      if(request.headers.get('accept')?.includes('application/json'))return Response.json({destination},{headers:downloadHeaders});
      return new Response(null,{ status:303,headers:{ ...downloadHeaders,Location:destination } });
    } catch (error) {
      // Provider/driver error messages can contain signatures or connection strings.
      // Log only bounded categories, never the error object, query or destination.
      const driverCode=error && typeof error==='object' && 'code' in error ? String(error.code) : '';
      console.warn(JSON.stringify({area:'delivery',application_id:retry?.id,category:error instanceof DownloadError?error.code:/^[0-9A-Z]{5}$/.test(driverCode)?'DB_'+driverCode:error instanceof TypeError?'INTERNAL_TYPE_ERROR':'DELIVERY_UNAVAILABLE',
        ...(error instanceof ProviderFailure?{stage:error.stage,host:error.host,upstream_status:error.upstreamStatus}:{})}));
      if(retry && error instanceof ProviderFailure) {
        // A failed upstream fetch must not expose a deleted, unpublished or superseded source.
        try {
          const sql=dependencies?.sql??getSql();
          if(!sql)throw new DownloadError(503,'DELIVERY_UNAVAILABLE');
          const current=await legacyDelivery(sql,retry.id,dependencies?.env??process.env);
          if(current.revision!==retry.revision)throw new DownloadError(409,'SOURCE_CHANGED');
          if(error.code==='SOURCE_REMOVED'&&(dependencies?.env??process.env).BACKGROUND_BROWSER_ENABLED==='true')await discoveryCache(sql).clear(retry.id);
        } catch(changed) {return downloadErrorResponse(changed,request,true);}
      }
      if(retry && !request.headers.get('accept')?.includes('application/json')) {const response=providerRetry(error,retry.id,retry.token,request);if(response)return response;}
      const response=downloadErrorResponse(error,request,operation==='redeem');
      if(retry && request.headers.get('accept')?.includes('application/json') && error instanceof ProviderFailure) {
        const payload=await response.json();
        payload.error.stage=error.stage;payload.error.provider_host=error.host;payload.error.upstream_status=error.upstreamStatus;
        if(['PROVIDER_CHALLENGE','PROVIDER_AUTH_REQUIRED','PROVIDER_FORBIDDEN'].includes(error.code)){
          const stableSource=safeManualSource(retry.source);
          if(stableSource)payload.error.source_url=stableSource;
        }
        return Response.json(payload,{status:response.status,headers:response.headers});
      }
      return response;
    }
  };
}
