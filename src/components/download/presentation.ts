import 'server-only';
import { getSql } from '@/lib/db';
import { DownloadService } from '@/lib/downloads/service';

/** Fail closed when migration/config/storage is absent. IDs are never fabricated. */
export async function getDownloadAvailability(applicationId: number) {
  const sql = getSql();
  if (!sql) return { mode: 'legacy', file: null };
  try {
    return await new DownloadService(sql, {
      enabled: process.env.DIRECT_DOWNLOADS_ENABLED === 'true',
      hosts: (process.env.DOWNLOAD_ALLOWED_DELIVERY_HOSTS || '').split(',').filter(Boolean),
    }).presentation(applicationId);
  } catch { return { mode: 'disabled', file: null }; }
}
export async function getDownloadPresentation(applicationId: number) {
  return (await getDownloadAvailability(applicationId)).file;
}

/** Expose availability only; the destination never crosses the RSC boundary. */
export async function getFallbackDelivery(applicationId: number): Promise<'telegram' | 'external' | 'steamrip' | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const { legacyDelivery } = await import('@/lib/delivery/legacy');
    return (await legacyDelivery(sql,applicationId,process.env)).provider;
  } catch { return null; }
}


/** Bot owns SteamRIP/BZZHR, website owns Telegram/manual/other file delivery.
 * Classify by validated original source, never app title/category or a client hint.
 * A published, active game is necessary before returning a Telegram deep link. */
export async function isSteamRipBotDownload(applicationId:number):Promise<boolean> {
  const sql=getSql();if(!sql)return false;
  try {
    const [app]=await sql`SELECT devupload_url,shrankme_url FROM applications
      WHERE id=${applicationId} AND active=TRUE AND published=TRUE`;
    if(!app)return false;
    const { publicUrl }=await import('@/lib/downloads/providers/public-http');
    const { STEAMRIP_HOSTS }=await import('@/lib/downloads/providers/steamrip');
    const { BZZHR_HOSTS }=await import('@/lib/downloads/providers/bzzhr');
    const sources=[app.devupload_url,app.shrankme_url].filter((v):v is string=>typeof v==='string'&&v.length>0);
    return sources.some(value=>{
      try {publicUrl(value,STEAMRIP_HOSTS);return true;}catch{/* not SteamRIP */}
      try {publicUrl(value,BZZHR_HOSTS);return true;}catch{return false;}
    });
  }catch{return false;}
}
