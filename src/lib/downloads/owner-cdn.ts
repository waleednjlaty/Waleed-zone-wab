import 'server-only';
import { createHash } from 'node:crypto';
import { adminSession } from '@/lib/admin/security';
import { DownloadError } from './rules';
import { BZZHR_HOSTS, BZZHR_FILE_HOSTS, signedDestination, validateBzzhrDns } from './providers/bzzhr';
import { publicUrl } from './providers/public-http';
import { stableBzzhr } from './browser/policy';

export const OWNER_CDN_TTL_MS = 600000;
export type OwnerCdnInfo = { verification: 'verified' | 'owner_unverified'; expires_at: string };
type Entry = { destination: string; fileId: string; expires: number; verification: OwnerCdnInfo['verification'] };
type Verify = typeof validateBzzhrDns;
const failure = (code: string) => new DownloadError(409, code);
const barrier = (error: unknown) => ['HEAD_UNAVAILABLE', 'PROVIDER_CHALLENGE', 'PROVIDER_FORBIDDEN', 'PROVIDER_DNS_FAILED', 'PROVIDER_TIMEOUT']
  .includes(String((error as { code?: unknown })?.code));

/** This scope never authorizes an ordinary visitor or a statistics bearer token. */
export async function ownerCdnScope(request: Request, env: NodeJS.ProcessEnv): Promise<string | null> {
  if (env.OWNER_CDN_TEST_ENABLED !== 'true') return null;
  try {
    const { getCurrentUser } = await import('@/lib/auth');
    const session = adminSession(request, env), user = await getCurrentUser();
    return user && env.OWNER_USER_ID?.trim() === user.id ? ownerScopeKey(user.id, session) : null;
  } catch { return null; }
}
export function ownerScopeKey(ownerId: string, session: string) {
  return createHash('sha256').update(JSON.stringify([ownerId, session])).digest('hex');
}
export function ownerCdnBinding(source: string, page: string, raw: string) {
  publicUrl(raw, BZZHR_FILE_HOSTS);
  const stable = stableBzzhr(page), destination = signedDestination(raw, stable);
  const url = new URL(destination), fileId = new URL(stable).pathname.split('/')[1];
  // Owner input is deliberately stricter than legacy provider paths: no suffix,
  // extra query parameters, credentials, fragments, encoded path or lookalike host.
  if (url.pathname !== '/d/' + fileId || [...url.searchParams.keys()].some(k => k !== 'v')
    || !/^[A-Za-z0-9_-]+$/.test(url.searchParams.get('v') || '')) throw failure('FILE_ID_MISMATCH');
  const original = new URL(source);
  if (original.search || original.hash) throw failure('INVALID_SOURCE');
  if (BZZHR_HOSTS.includes(original.hostname as typeof BZZHR_HOSTS[number])) {
    if (new URL(stableBzzhr(source)).pathname.split('/')[1] !== fileId) throw failure('FILE_ID_MISMATCH');
  } else if (!['steamrip.com', 'www.steamrip.com'].includes(original.hostname)
    || !/^\/[A-Za-z0-9-]+\/?$/.test(original.pathname)) throw failure('INVALID_SOURCE');
  return { destination, fileId };
}
export function createOwnerCdnCache(verify: Verify = validateBzzhrDns, now = Date.now) {
  const entries = new Map<string, Entry>();
  const key = (scope: string, id: number, revision: string, source: string) => createHash('sha256')
    .update(JSON.stringify([id, revision, source, scope])).digest('hex');
  function trim() {
    for (const [k, value] of entries) if (value.expires <= now()) entries.delete(k);
    while (entries.size > 100) entries.delete(entries.keys().next().value!);
  }
  const info = (entry: Entry): OwnerCdnInfo => ({ verification: entry.verification, expires_at: new Date(entry.expires).toISOString() });
  async function check(entry: Entry, signal: AbortSignal) {
    try {
      const validated = signedDestination(await verify(entry.destination, signal), entry.destination);
      if (new URL(validated).pathname !== '/d/' + entry.fileId) throw failure('FILE_ID_MISMATCH');
      entry.destination = validated; entry.verification = 'verified';
    } catch (error) {
      // Explicitly attested owner tests may continue on a HEAD access barrier.
      // HTML, removal/expiry, wrong IDs/hosts and 429 never enter this exception.
      if (entry.verification !== 'owner_unverified' || !barrier(error) || signal.aborted) throw error;
    }
    if (signal.aborted) throw failure('PROVIDER_TIMEOUT');
    if (entry.expires <= now()) throw failure('OWNER_LINK_EXPIRED');
  }
  return {
    peek(scope: string, id: number, revision: string, source: string) {
      trim(); const entry = entries.get(key(scope, id, revision, source)); return entry ? info(entry) : null;
    },
    clear(scope: string, id: number, revision: string, source: string) { entries.delete(key(scope, id, revision, source)); },
    async put(scope: string, id: number, revision: string, source: string, page: string, raw: string, allowUnverified: boolean, signal: AbortSignal) {
      const bound = ownerCdnBinding(source, page, raw), entry: Entry = { ...bound, expires: now() + OWNER_CDN_TTL_MS,
        verification: allowUnverified ? 'owner_unverified' : 'verified' };
      await check(entry, signal); trim(); entries.set(key(scope, id, revision, source), entry); trim(); return info(entry);
    },
    async resolve(scope: string, id: number, revision: string, source: string, signal: AbortSignal) {
      trim(); const k = key(scope, id, revision, source), entry = entries.get(k); if (!entry) return null;
      try { await check(entry, signal); } catch (error) { if (entries.get(k) === entry) entries.delete(k); throw error; }
      const assertCurrent = () => { if (entries.get(k) !== entry || entry.expires <= now()) throw failure('OWNER_LINK_EXPIRED'); };
      assertCurrent(); return { destination: entry.destination, info: info(entry), assertCurrent };
    },
  };
}
const shared = globalThis as unknown as { wzOwnerCdnCache?: ReturnType<typeof createOwnerCdnCache> };
export const ownerCdnCache = shared.wzOwnerCdnCache ??= createOwnerCdnCache();
