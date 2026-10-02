import files from '@/data/download-presentation.json';
import type { DownloadFile } from './types';
import { UUID } from './api';

/**
 * Read-only rollout seam, intentionally empty until the integration agent connects
 * a public eligible-file DTO from the backend. Never derives file IDs from legacy
 * shortener URLs; this presentation map cannot authorize a download.
 */
export function getDownloadPresentation(applicationId: number): DownloadFile | null {
  const file = (files as Record<string, DownloadFile>)[String(applicationId)];
  return file && file.application_id === applicationId && UUID.test(file.version_id) && UUID.test(file.file_id)
    && typeof file.version === 'string' && file.version.trim() && Number.isSafeInteger(file.size_bytes) && file.size_bytes > 0
    && (!file.file_type || ['apk', 'apks', 'xapk', 'obb', 'zip'].includes(file.file_type)) ? file : null;
}
