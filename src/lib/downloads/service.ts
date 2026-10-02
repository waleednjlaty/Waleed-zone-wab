import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { CLIENT_SECONDS, COOLDOWN_SECONDS, DownloadError, hashSecret, matchesSecret, newSecret,
  refill, safeFilename, unavailable } from './rules';
import { prepareDelivery, storageAdapters, validateGrant, type DownloadStorage, type ObjectRef } from './storage';

type Tx = TransactionSql;
export type DownloadIdentity = { clientId: string; userId: string | null; principal: string; networks: string[] };
export type Selection = { application_id: number; version_id: string; file_id: string };
type Client = { id: string; csrf_hash: string; expires_at: Date };
export type RequestRow = Selection & {
  id: string; principal_key: string; client_id: string; user_id: string | null; file_snapshot: string;
  state: 'pending' | 'issued' | 'redeemed' | 'expired' | 'revoked'; ready_at: Date;
  request_expires_at: Date; token_hash: string | null; token_generation: number;
  token_expires_at: Date | null; consumed_at: Date | null; delivery_expires_at: Date | null;
  reserved_bytes: string; budget_starts_at: Date | null; created_at: Date;
};
type FileRow = { id: string; size_bytes: string; sha256: string; mime_type: string;
  download_filename: string; storage_backend: string; storage_key: string; storage_object_version: string | null;
  active: boolean; scan_status: string; verified_at: Date | null; retired_at: Date | null };
type Policy = { key: string; capacity: number; perMinute: number };
const terminal = (r: RequestRow) => ['redeemed', 'expired', 'revoked'].includes(r.state);
export function guardLive(r: RequestRow, now: Date, requireReady = false) {
  if (r.state === 'redeemed') throw new DownloadError(410, 'TOKEN_USED', null, now);
  if (r.state === 'revoked') throw new DownloadError(410, 'REQUEST_REVOKED', null, now);
  if (r.state === 'expired' || now >= r.request_expires_at) throw new DownloadError(410, 'REQUEST_EXPIRED', null, now);
  if (requireReady && now < r.ready_at) throw new DownloadError(425, 'DOWNLOAD_NOT_READY', r.ready_at, now);
}
export function publicStatus(r: RequestRow, now: Date, next: Date) {
  const state = !terminal(r) && now >= r.request_expires_at ? 'expired'
    : r.state === 'pending' && now >= r.ready_at ? 'ready' : r.state;
  return { request_id: r.id, state, server_time: now.toISOString(), ready_at: r.ready_at.toISOString(),
    next_download_at: next.toISOString(), request_expires_at: r.request_expires_at.toISOString(),
    wait_seconds: state === 'pending' ? Math.max(0, Math.ceil((r.ready_at.getTime() - now.getTime()) / 1000)) : 0,
    can_issue_token: ['ready', 'issued'].includes(state), status_url: `/api/downloads/requests/${r.id}`,
    ...(r.state === 'redeemed' ? { delivery_expires_at: r.delivery_expires_at?.toISOString() } : {}) };
}
const snapshot = (f: FileRow) => hashSecret(JSON.stringify([f.id, f.storage_backend, f.storage_key,
  f.storage_object_version, String(f.size_bytes), f.sha256, f.mime_type, f.download_filename]));

export class DownloadService {
  constructor(private sql: Sql, private options: { enabled: boolean; hosts: readonly string[];
    adapters?: Readonly<Record<string, DownloadStorage>> }) {}
  private async transaction<T>(fn: (tx: Tx) => Promise<T | DownloadError>): Promise<T> {
    const result = await this.sql.begin(async tx => {
      await tx`SET LOCAL lock_timeout = '1s'`;
      await tx`SET LOCAL statement_timeout = '2s'`;
      return fn(tx);
    });
    if (result instanceof DownloadError) throw result;
    return result as T;
  }
  private async time(tx: Tx) { const [r] = await tx<{ time: Date }[]>`SELECT clock_timestamp() AS time`; return r.time; }
  private async mutex(tx: Tx, keys: string[]) {
    for (const key of [...new Set(keys)].sort()) {
      await tx`INSERT INTO site_download_mutex(key) VALUES(${key}) ON CONFLICT DO NOTHING`;
      await tx`SELECT key FROM site_download_mutex WHERE key=${key} FOR UPDATE`;
    }
  }
  private async principal(tx: Tx, identity: DownloadIdentity) {
    await tx`INSERT INTO site_download_principals(key) VALUES(${identity.principal}) ON CONFLICT DO NOTHING`;
    const [row] = await tx<{ next_download_at: Date; active_request_id: string | null }[]>`
      SELECT next_download_at,active_request_id FROM site_download_principals WHERE key=${identity.principal} FOR UPDATE`;
    return row;
  }
  private async checkClient(tx: Tx, identity: DownloadIdentity) {
    const [row] = await tx`SELECT id FROM site_download_clients WHERE id=${identity.clientId} AND expires_at>clock_timestamp() FOR SHARE`;
    if (!row) throw new DownloadError(401, 'DOWNLOAD_SESSION_REQUIRED');
  }
  private bound(row: RequestRow | undefined, identity: DownloadIdentity, code = 'REQUEST_NOT_FOUND'): asserts row is RequestRow {
    if (!row || row.client_id !== identity.clientId || row.user_id !== identity.userId || row.principal_key !== identity.principal)
      throw new DownloadError(404, code);
  }
  private async request(tx: Tx, id: string, identity: DownloadIdentity, code = 'REQUEST_NOT_FOUND') {
    const [row] = await tx<RequestRow[]>`SELECT * FROM site_download_requests WHERE id=${id} FOR UPDATE`;
    this.bound(row, identity, code); return row;
  }
  private async revoke(tx: Tx, r: RequestRow, code: string, state: 'revoked' | 'expired' = 'revoked') {
    await tx`UPDATE site_download_requests SET state=${state},failure_code=${code} WHERE id=${r.id} AND state IN ('pending','issued')`;
    await tx`UPDATE site_download_principals SET active_request_id=NULL WHERE key=${r.principal_key} AND active_request_id=${r.id}`;
  }
  private async live(tx: Tx, r: RequestRow, now: Date, ready = false) {
    try { guardLive(r, now, ready); return null; }
    catch (e) {
      if (e instanceof DownloadError && e.code === 'REQUEST_EXPIRED') await this.revoke(tx, r, e.code, 'expired');
      return e as DownloadError;
    }
  }
  private async eligibility(tx: Tx, s: Selection, r?: RequestRow): Promise<FileRow | DownloadError> {
    const [settings] = await tx`SELECT enabled FROM site_download_settings WHERE id=1 FOR SHARE`;
    let error: DownloadError | null = !this.options.enabled || !settings?.enabled
      ? new DownloadError(503, 'DIRECT_DOWNLOAD_UNAVAILABLE') : null;
    const [app] = await tx`SELECT active,published FROM applications WHERE id=${s.application_id} FOR SHARE`;
    const [config] = await tx`SELECT mode,current_version_id FROM site_download_app_config WHERE application_id=${s.application_id} FOR SHARE`;
    const [version] = await tx`SELECT application_id,active,published FROM site_download_versions WHERE id=${s.version_id} FOR SHARE`;
    const [file] = await tx<FileRow[]>`SELECT * FROM site_download_files WHERE id=${s.file_id} AND version_id=${s.version_id} FOR SHARE`;
    if (!app?.active || !app.published || config?.mode !== 'direct' || !config.current_version_id
      || !version?.active || !version.published || version.application_id !== s.application_id
      || !file?.active || file.retired_at || file.scan_status !== 'verified' || !file.verified_at
      || !safeFilename(file.download_filename) || !/^[a-f0-9]{64}$/.test(file.sha256)
      || BigInt(file.size_bytes) <= BigInt(0) || BigInt(file.size_bytes) > BigInt(2147483648)
      || file.mime_type !== 'application/vnd.android.package-archive'
      || !this.adapter(file.storage_backend) || (r && snapshot(file) !== r.file_snapshot))
      error ??= new DownloadError(404, 'FILE_UNAVAILABLE');
    if (error) { if (r) await this.revoke(tx, r, error.code); return error; }
    return file;
  }
  private adapter(backend: string) { return (this.options.adapters ?? storageAdapters)[backend]; }

  async userId(session: string | undefined): Promise<string | null> {
    // Query errors propagate; never downgrade an auth/DB outage to anonymous.
    if (!session) return null;
    if (session.length > 128) throw new DownloadError(401, 'DOWNLOAD_SESSION_REQUIRED');
    const [row] = await this.sql`SELECT u.id FROM site_sessions s JOIN site_users u ON u.id=s.user_id
      WHERE s.token_hash=${hashSecret(session)} AND s.expires_at>clock_timestamp()`;
    if (!row) throw new DownloadError(401, 'DOWNLOAD_SESSION_REQUIRED');
    return String(row.id);
  }
  async client(secret: string): Promise<Client | null> {
    const [row] = await this.sql<Client[]>`SELECT id,csrf_hash,expires_at FROM site_download_clients
      WHERE token_hash=${hashSecret(secret)} AND expires_at>clock_timestamp()`;
    return row ?? null;
  }
  async bootstrap(secret: string | null, networks: string[]) {
    const existing = secret ? await this.client(secret) : null;
    await this.attemptPolicies([
      ...networks.map(n => ({ key: `bootstrap:network:${n}`, capacity: 10, perMinute: 30 })),
      ...(existing ? [{ key: `bootstrap:client:${existing.id}`, capacity: 3, perMinute: 10 }] : []),
    ]);
    const cookie = existing ? secret! : newSecret(), csrf = newSecret();
    const result = await this.transaction(async tx => {
      await this.mutex(tx, networks.map(n => `network:${n}`));
      const now = await this.time(tx);
      if (existing) {
        const changed = await tx`UPDATE site_download_clients SET csrf_hash=${hashSecret(csrf)}
          WHERE id=${existing.id} AND expires_at>${now} RETURNING id`;
        if (!changed.length) throw new DownloadError(401, 'DOWNLOAD_SESSION_REQUIRED');
      } else {
        const [quota] = await tx`SELECT count(*)::int AS count,min(created_at) AS oldest FROM site_download_clients
          WHERE network_hashes && ${tx.array(networks)}::text[] AND created_at>${new Date(now.getTime() - 86400000)}`;
        if (quota.count >= 100) throw new DownloadError(429, 'RATE_LIMITED', new Date(quota.oldest.getTime() + 86400000), now);
        await tx`INSERT INTO site_download_clients(id,token_hash,csrf_hash,network_hashes,created_at,expires_at)
          VALUES(${randomUUID()},${hashSecret(cookie)},${hashSecret(csrf)},${tx.array(networks)},${now},${new Date(now.getTime() + CLIENT_SECONDS * 1000)})`;
      }
      return { csrf_token: csrf, server_time: now.toISOString() };
    });
    return { cookie, ...result };
  }
  async attemptPolicies(policies: Policy[]) {
    await this.transaction(async tx => {
      const sorted = [...policies].sort((a, b) => a.key.localeCompare(b.key));
      // Insert/lock in a stable order before capturing DB time, on every instance.
      for (const p of sorted) {
        await tx`INSERT INTO site_download_limit_state(key,tokens,updated_at,expires_at)
          VALUES(${p.key},${p.capacity},clock_timestamp(),clock_timestamp()+INTERVAL '48 hours') ON CONFLICT DO NOTHING`;
        await tx`SELECT key FROM site_download_limit_state WHERE key=${p.key} FOR UPDATE`;
      }
      const now = await this.time(tx); let wait = 0;
      for (const p of sorted) {
        const [r] = await tx<{ tokens: number; updated_at: Date }[]>`SELECT tokens,updated_at FROM site_download_limit_state WHERE key=${p.key}`;
        const value = refill(r.tokens, r.updated_at, now, p.capacity, p.perMinute);
        wait = Math.max(wait, value.wait);
        // Invalid/denied calls still spend each scope that has a token; no refunds.
        await tx`UPDATE site_download_limit_state SET tokens=${Math.max(0, value.available - (value.available >= 1 ? 1 : 0))},
          updated_at=${now},expires_at=${new Date(now.getTime() + 172800000)} WHERE key=${p.key}`;
      }
      return wait ? new DownloadError(429, 'RATE_LIMITED', new Date(now.getTime() + wait), now) : undefined;
    });
  }
  async attempts(identity: DownloadIdentity, operation: 'request' | 'token' | 'redeem' | 'status') {
    const network = (name: string, capacity: number, perMinute: number) => identity.networks.map(n => ({ key: `${name}:network:${n}`, capacity, perMinute }));
    const principal = (name: string, capacity: number, perMinute: number) => ({ key: `${name}:${identity.principal}`, capacity, perMinute });
    const policies = operation === 'status'
      ? [{ key: `read:client:${identity.clientId}`, capacity: 5, perMinute: 30 }, ...network('read', 30, 240)]
      : [principal('write', 6, 12), ...network('write', 20, 60),
        ...(operation === 'token' ? [principal('token', 3, 5)] : []),
        ...(operation === 'redeem' ? [principal('redeem', 2, 5), ...network('redeem', 10, 30)] : [])];
    await this.attemptPolicies(policies);
  }
  private async quotas(tx: Tx, identity: DownloadIdentity, now: Date) {
    let retry = 0;
    for (const [seconds, userLimit, networkLimit] of [[600, 10, 40], [3600, 60, 300], [86400, 200, 1200]]) {
      const since = new Date(now.getTime() - seconds * 1000);
      for (const network of [false, true]) {
        const rows = network
          ? await tx<{ created_at: Date }[]>`SELECT created_at FROM site_download_requests WHERE network_hashes && ${tx.array(identity.networks)}::text[] AND created_at>${since} ORDER BY created_at`
          : await tx<{ created_at: Date }[]>`SELECT created_at FROM site_download_requests WHERE principal_key=${identity.principal} AND created_at>${since} ORDER BY created_at`;
        const limit = network ? networkLimit : userLimit;
        if (rows.length >= limit) retry = Math.max(retry, rows[rows.length - limit].created_at.getTime() + seconds * 1000);
      }
    }
    if (retry) throw new DownloadError(429, 'RATE_LIMITED', new Date(retry), now);
  }
  async admit(identity: DownloadIdentity, selection: Selection, key: string) {
    return this.transaction(async tx => {
      const p = await this.principal(tx, identity);
      await this.mutex(tx, identity.networks.map(n => `network:${n}`));
      await this.checkClient(tx, identity);
      let now = await this.time(tx);
      const payload = hashSecret(JSON.stringify([selection.application_id, selection.version_id, selection.file_id]));
      const [alias] = await tx`SELECT request_id,payload_hash FROM site_download_idempotency WHERE principal_key=${identity.principal} AND key=${key}`;
      if (alias) {
        if (alias.payload_hash !== payload) throw new DownloadError(409, 'IDEMPOTENCY_CONFLICT');
        const r = await this.request(tx, alias.request_id, identity);
        return { created: false, data: publicStatus(r, now, p.next_download_at) };
      }
      if (p.active_request_id) {
        const [active] = await tx<RequestRow[]>`SELECT * FROM site_download_requests WHERE id=${p.active_request_id} AND principal_key=${identity.principal} FOR UPDATE`;
        if (!active) throw unavailable();
        if (!terminal(active) && now < active.request_expires_at) {
          // A second login session shares the user cooldown, but cannot take over its client-bound request.
          if (active.client_id !== identity.clientId || active.user_id !== identity.userId)
            throw new DownloadError(409, 'DOWNLOAD_IN_PROGRESS');
          if (active.file_id !== selection.file_id || active.version_id !== selection.version_id || active.application_id !== selection.application_id)
            throw new DownloadError(409, 'DOWNLOAD_IN_PROGRESS');
          await tx`INSERT INTO site_download_idempotency(principal_key,key,payload_hash,request_id)
            VALUES(${identity.principal},${key},${payload},${active.id})`;
          return { created: false, data: publicStatus(active, now, p.next_download_at) };
        }
        await this.revoke(tx, active, 'REQUEST_EXPIRED', 'expired');
      }
      if (now < p.next_download_at) throw new DownloadError(429, 'DOWNLOAD_COOLDOWN', p.next_download_at, now);
      await this.quotas(tx, identity, now);
      const file = await this.eligibility(tx, selection); if (file instanceof DownloadError) return file;
      now = await this.time(tx); // Parent lock waits must not shorten the preparation interval.
      const id = randomUUID(), ready = new Date(now.getTime() + COOLDOWN_SECONDS * 1000);
      const [r] = await tx<RequestRow[]>`INSERT INTO site_download_requests(id,principal_key,client_id,user_id,application_id,version_id,file_id,
        file_snapshot,idempotency_key,payload_hash,network_hashes,created_at,ready_at,request_expires_at)
        VALUES(${id},${identity.principal},${identity.clientId},${identity.userId},${selection.application_id},${selection.version_id},${selection.file_id},
        ${snapshot(file)},${key},${payload},${tx.array(identity.networks)},${now},${ready},${new Date(ready.getTime() + 300000)}) RETURNING *`;
      await tx`INSERT INTO site_download_idempotency(principal_key,key,payload_hash,request_id) VALUES(${identity.principal},${key},${payload},${id})`;
      await tx`UPDATE site_download_principals SET next_download_at=${ready},active_request_id=${id},updated_at=${now} WHERE key=${identity.principal}`;
      return { created: true, data: publicStatus(r, now, ready) };
    });
  }
  async status(identity: DownloadIdentity, id: string) {
    // GET never locks/mutates a grant, advances cooldown or touches storage.
    const [r] = await this.sql<RequestRow[]>`SELECT * FROM site_download_requests WHERE id=${id}`;
    this.bound(r, identity);
    const [p] = await this.sql<{ next_download_at: Date; time: Date }[]>`SELECT next_download_at,clock_timestamp() AS time FROM site_download_principals WHERE key=${identity.principal}`;
    return publicStatus(r, p.time, p.next_download_at);
  }
  private async reserve(tx: Tx, r: RequestRow, file: FileRow, now: Date) {
    const [budget] = await tx`SELECT * FROM site_download_budget WHERE id=1 FOR UPDATE`;
    now = await this.time(tx);
    if (!budget?.allowance_verified || now < budget.starts_at || now >= budget.expires_at)
      throw new DownloadError(503, 'DELIVERY_BUDGET_UNAVAILABLE');
    if (BigInt(r.reserved_bytes) > BigInt(0)) {
      if (!r.budget_starts_at || r.budget_starts_at.getTime() !== budget.starts_at.getTime())
        throw new DownloadError(503, 'DELIVERY_BUDGET_UNAVAILABLE');
      return;
    }
    const bytes = BigInt(file.size_bytes) * BigInt(budget.amplification_factor);
    if (BigInt(budget.reserved_bytes) + bytes > BigInt(budget.byte_limit))
      throw new DownloadError(503, 'DELIVERY_BUDGET_EXHAUSTED');
    const [outstanding] = await tx`SELECT count(*)::int AS count FROM site_download_requests WHERE reserved_bytes>0
      AND ((state IN ('pending','issued') AND request_expires_at>${now}) OR delivery_expires_at>${now})`;
    if (outstanding.count >= budget.max_outstanding) throw new DownloadError(429, 'DELIVERY_CAPACITY_REACHED', new Date(now.getTime() + 20000), now);
    await tx`UPDATE site_download_budget SET reserved_bytes=reserved_bytes+${bytes.toString()}::bigint WHERE id=1`;
    await tx`UPDATE site_download_requests SET reserved_bytes=${bytes.toString()},budget_starts_at=${budget.starts_at} WHERE id=${r.id}`;
  }
  async issue(identity: DownloadIdentity, id: string) {
    return this.transaction(async tx => {
      await this.principal(tx, identity);
      const r = await this.request(tx, id, identity);
      await this.checkClient(tx, identity);
      let now = await this.time(tx);
      const failure = await this.live(tx, r, now, true); if (failure) return failure;
      const file = await this.eligibility(tx, r, r); if (file instanceof DownloadError) return file;
      if (r.token_generation >= 3) {
        await this.revoke(tx, r, 'TOKEN_ISSUANCE_EXHAUSTED');
        return new DownloadError(409, 'TOKEN_ISSUANCE_EXHAUSTED', null, now);
      }
      await this.reserve(tx, r, file, now);
      now = await this.time(tx);
      const finalFailure = await this.live(tx, r, now, true); if (finalFailure) return finalFailure;
      const token = 'wzdl1_' + newSecret(), expiry = new Date(Math.min(now.getTime() + 60000, r.request_expires_at.getTime()));
      await tx`UPDATE site_download_requests SET state='issued',token_hash=${hashSecret(token)},token_generation=token_generation+1,
        token_expires_at=${expiry} WHERE id=${id}`;
      return { token, token_expires_at: expiry.toISOString(), server_time: now.toISOString(), redeem_url: '/api/downloads/redeem' };
    });
  }
  private tokenCheck(r: RequestRow, token: string, now: Date) {
    if (!matchesSecret(token, r.token_hash)) throw new DownloadError(404, 'DOWNLOAD_NOT_FOUND', null, now);
    guardLive(r, now, true);
    if (r.state !== 'issued' || !r.token_expires_at) throw new DownloadError(404, 'DOWNLOAD_NOT_FOUND', null, now);
    if (now >= r.token_expires_at) throw new DownloadError(410, 'TOKEN_EXPIRED', null, now);
  }
  async redeem(identity: DownloadIdentity, id: string, token: string) {
    const initial = await this.transaction(async tx => {
      await this.principal(tx, identity);
      const r = await this.request(tx, id, identity, 'DOWNLOAD_NOT_FOUND');
      await this.checkClient(tx, identity);
      const now = await this.time(tx); this.tokenCheck(r, token, now);
      const file = await this.eligibility(tx, r, r); if (file instanceof DownloadError) return file;
      return { r, file };
    });
    const { r, file } = initial;
    const ref: ObjectRef = { backend: file.storage_backend, key: file.storage_key,
      ...(file.storage_object_version ? { objectVersion: file.storage_object_version } : {}) };
    const adapter = this.adapter(ref.backend)!;
    let grant;
    try {
      grant = await prepareDelivery(adapter, ref, { sizeBytes: BigInt(file.size_bytes), sha256: file.sha256,
        contentType: file.mime_type, filename: file.download_filename, requestId: id }, this.options.hosts);
    } catch (e) {
      if (e instanceof DownloadError && e.code === 'FILE_INTEGRITY_UNAVAILABLE') {
        // Parent-only write, no principal locks while holding the file lock.
        await this.sql`UPDATE site_download_files SET scan_status='quarantined',active=false WHERE id=${file.id}`;
      }
      throw e;
    }
    return this.transaction(async tx => {
      await this.principal(tx, identity);
      const current = await this.request(tx, id, identity, 'DOWNLOAD_NOT_FOUND');
      await this.checkClient(tx, identity);
      let now = await this.time(tx); this.tokenCheck(current, token, now);
      if (current.token_generation !== r.token_generation) throw new DownloadError(404, 'DOWNLOAD_NOT_FOUND');
      const eligible = await this.eligibility(tx, current, current); if (eligible instanceof DownloadError) return eligible;
      await this.reserve(tx, current, eligible, now); // Recheck budget period before disclosure.
      now = await this.time(tx); this.tokenCheck(current, token, now);
      validateGrant(grant, ref, adapter, this.options.hosts, now);
      const consumed = await tx`UPDATE site_download_requests SET state='redeemed',consumed_at=${now},delivery_expires_at=${grant.expiresAt}
        WHERE id=${id} AND state='issued' AND token_hash=${hashSecret(token)} AND token_generation=${r.token_generation} RETURNING id`;
      if (consumed.length !== 1) throw new DownloadError(410, 'TOKEN_USED');
      await tx`UPDATE site_download_principals SET active_request_id=NULL WHERE key=${identity.principal} AND active_request_id=${id}`;
      return grant.url; // transaction wrapper awaits COMMIT before the HTTP handler can disclose this.
    });
  }
  async disable(userId: string) {
    const result = await this.sql`UPDATE site_download_settings SET enabled=false,updated_at=clock_timestamp(),updated_by=${userId} WHERE id=1 RETURNING id`;
    if (!result.length) throw unavailable();
    return { enabled: false };
  }
}
