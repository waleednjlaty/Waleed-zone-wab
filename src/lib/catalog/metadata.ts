import entries from '@/data/catalog-details.json';
import { safeExternalUrl } from '@/lib/utils';
export interface CatalogVersion { version: string; releaseDate?: string; size?: string; android?: string; architecture?: string; }
export interface CatalogDetails {
  arabicName?: string; englishName?: string; aliases?: string[]; tags?: string[];
  android?: string; architecture?: string; packageName?: string; fileType?: string;
  updatedAt?: string; screenshots?: {url:string;alt?:string}[]; changelog?: string;
  modInfo?: string; versions?: CatalogVersion[];
}
/** Optional curated additions keyed by the existing catalog ID. No invented values. */
export function getCatalogDetails(id: number): CatalogDetails {
  const value=(entries as Record<string, CatalogDetails>)[String(id)] || {};
  return { ...value, screenshots:value.screenshots?.filter(image=>Boolean(safeExternalUrl(image.url))),
    versions:value.versions?.filter(version=>Boolean(version.version?.trim())) };
}
