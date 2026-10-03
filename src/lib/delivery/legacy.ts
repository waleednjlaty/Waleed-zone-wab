import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Sql } from 'postgres';
import { DownloadError } from '@/lib/downloads/rules';
import { telegramDestination } from './telegram';
import { telegramDownloadUrl } from '@/lib/site';

const fail = () => new DownloadError(404,'SOURCE_UNAVAILABLE');
export type Delivery = { destination: string; revision: string; provider: 'telegram' | 'external' };
/** Re-read publication, disable gate and the exact source on every redemption. */
export async function legacyDelivery(sql: Sql, applicationId: number, env: NodeJS.ProcessEnv): Promise<Delivery> {
  const [schema] = await sql`SELECT to_regclass('site_download_app_config') AS config,to_regclass('site_delivery_sources') AS sources`;
  if (!schema.sources || !schema.config) throw new DownloadError(503,'DELIVERY_SCHEMA_UNAVAILABLE');
  // One statement snapshot: no mixture of old publication/revision and new source.
  const [app] = await sql`SELECT a.id,a.active,a.published,a.revision,a.shrankme_url,a.devupload_url,c.mode,
    s.telegram_channel_username,s.telegram_message_id FROM applications a
    LEFT JOIN site_download_app_config c ON c.application_id=a.id
    LEFT JOIN site_delivery_sources s ON s.application_id=a.id AND s.provider='telegram'
    WHERE a.id=${applicationId}`;
  if (!app?.active || !app.published || app.mode==='disabled') throw fail();
  const delivery = (destination: string, provider: Delivery['provider']): Delivery => ({ destination,provider,
    // Hash hides internal revision and binds the grant to the exact source even if a trigger is absent.
    revision:createHash('sha256').update(JSON.stringify([String(app.revision),provider,destination])).digest('hex') });
  if (app.telegram_message_id !== null && app.telegram_message_id !== undefined) {
    let destination; try { destination = telegramDestination(app.telegram_channel_username,app.telegram_message_id,env); } catch { throw fail(); }
    return delivery(destination,'telegram');
  }
  const raw = app.shrankme_url || app.devupload_url;
  if (typeof raw !== 'string' || raw.length > 2000) throw fail();
  let url: URL; try { url = new URL(raw); } catch { throw fail(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw fail();
  // SteamRIP's column is a source page, not a downloadable APK. Keep its live bot extractor.
  if (url.hostname === 'steamrip.com' || url.hostname === 'www.steamrip.com')
    return delivery(telegramDownloadUrl(applicationId),'external');
  const hosts = (env.LEGACY_DOWNLOAD_ALLOWED_HOSTS || 'devuploads.com,shrinkme.io,shrinkme.site').split(',').map(v=>v.trim());
  if (!hosts.includes(url.hostname)) throw fail();
  return delivery(url.href,'external');
}
type Payload = { application_id: number; ready_at: number; expires_at: number; nonce: string; revision: string; client: string };
export class LegacyCountdown {
  constructor(private key: string, private now: () => number = Date.now) {
    if (!key || key.length < 32 || key.length > 512) throw new DownloadError(503,'SIGNING_UNAVAILABLE');
  }
  private mac(value: string) { return createHmac('sha256',this.key).update('wz-legacy-v1:'+value).digest(); }
  private client(value: string) { return this.mac('client:'+value).toString('base64url'); }
  prepare(applicationId: number, revision: string, client: string) {
    const server_time = this.now(), ready_at = server_time+20000, expires_at = ready_at+180000;
    const payload: Payload = { application_id: applicationId,ready_at,expires_at,revision,
      nonce: randomBytes(32).toString('base64url'),client:this.client(client) };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return { token: `${encoded}.${this.mac(encoded).toString('base64url')}`,ready_at:new Date(ready_at).toISOString(),
      expires_at:new Date(expires_at).toISOString(),server_time:new Date(server_time).toISOString() };
  }
  redeem(token: unknown, applicationId: number, revision: string, client: string) {
    if (typeof token !== 'string' || token.length > 1000) throw new DownloadError(400,'INVALID_TOKEN');
    const parts = token.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
      || Buffer.from(parts[1],'base64url').toString('base64url') !== parts[1]
      || !timingSafeEqual(Buffer.from(parts[1],'base64url'),this.mac(parts[0]))) throw new DownloadError(400,'INVALID_TOKEN');
    let data: Payload; try { data = JSON.parse(Buffer.from(parts[0],'base64url').toString()); } catch { throw new DownloadError(400,'INVALID_TOKEN'); }
    if (!data || typeof data !== 'object' || data.application_id !== applicationId || data.client !== this.client(client) || data.revision !== revision
      || !Number.isSafeInteger(data.ready_at) || !Number.isSafeInteger(data.expires_at)
      || data.expires_at-data.ready_at !== 180000 || typeof data.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.nonce))
      throw new DownloadError(400,'INVALID_TOKEN');
    if (this.now() >= data.expires_at) throw new DownloadError(410,'TOKEN_EXPIRED');
    if (this.now() < data.ready_at) throw new DownloadError(425,'COUNTDOWN_PENDING',new Date(data.ready_at),new Date(this.now()));
  }
}
