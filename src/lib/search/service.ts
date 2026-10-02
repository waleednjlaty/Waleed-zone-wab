import 'server-only';
import { postgresSearchProvider, type SearchProvider } from './provider';
import { rankDocuments } from './rank';
import { normalizeSearch } from './normalize';
import { sanitizeSearch } from '@/lib/utils';
import type { SearchObserver } from './types';

// Injectable, opt-in observer. No personal identifiers or analytics persistence.
export async function searchCatalog(rawQuery:string,options:{provider?:SearchProvider;observer?:SearchObserver}={}) {
  const query=sanitizeSearch(rawQuery);
  if(!normalizeSearch(query))return [];
  const ranked=rankDocuments(await (options.provider||postgresSearchProvider).candidates(query),query);
  options.observer?.results({query,resultCount:ranked.length});
  return ranked;
}
