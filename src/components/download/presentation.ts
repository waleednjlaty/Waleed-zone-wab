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
