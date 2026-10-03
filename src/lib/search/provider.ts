import 'server-only';
import { cache } from 'react';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { applications } from '@/lib/db/schema';
import { getDb } from '@/lib/db';
import { getCatalogDetails } from '@/lib/catalog/metadata';
import supplements from '@/data/catalog-details.json';
import { appName } from '@/components/catalog/presentation';
import { aliasVocabulary } from './aliases';
import { normalizeSearch } from './normalize';
import { rankDocument } from './rank';
import type { SearchDocument } from './types';
import { escapeLike } from '@/lib/utils';

export interface SearchProvider { candidates(query:string):Promise<SearchDocument[]>; }
const INDEX_LIMIT=2000;
const fields={id:applications.id,name:applications.name,developer:applications.developer,
  category:applications.category,description:sql<string>`left(${applications.description}, 400)`,downloads:applications.downloads};
const publicWhere=and(eq(applications.active,true),eq(applications.published,true));
function document(row:{id:number;name:string|null;developer:string|null;category:string|null;description:string|null;downloads:number|null}):SearchDocument {
  const details=getCatalogDetails(row.id);
  return {...row,name:appName(row),...details};
}
// Per-request cache only: bot commits must be visible on the next request.
const smallCatalog=cache(async()=>{
  const db=getDb(); if(!db)return [];
  return (await db.select(fields).from(applications).where(publicWhere).orderBy(asc(applications.id)).limit(INDEX_LIMIT+1)).map(document);
});
/** The current small catalog is indexed on the server, never shipped to the browser.
 * Above 2,000 items, bounded PostgreSQL candidates replace the in-memory scan.
 * A future indexed provider can implement this interface without changing UI/ranking.
 */
export const postgresSearchProvider:SearchProvider={async candidates(query) {
  const catalog=await smallCatalog();
  if(catalog.length<=INDEX_LIMIT)return catalog;
  const db=getDb(); if(!db)return [];
  const normalized=normalizeSearch(query);
  const terms=new Set(normalized.split(' ').filter(Boolean));
  // Expand bilingual aliases before candidate retrieval, including bounded typos.
  for(const entry of aliasVocabulary) {
    if(rankDocument({id:0,name:entry.names[0],aliases:entry.aliases},normalized))entry.names.forEach(name=>terms.add(normalizeSearch(name)));
  }
  // Parameterized expressions; never interpolate a user-provided SQL identifier.
  const name=sql`btrim(regexp_replace(regexp_replace(translate(lower(coalesce(${applications.name},'')), 'أإآٱىـ', 'ااااي'), '[ؐ-ًؚ-ٰٟۖ-ۭ]', '', 'g'), '[^[:alnum:]ء-ي]+', ' ', 'g'))`;
  const conditions=[...terms].slice(0,12).flatMap(term=>[
    sql`${name} LIKE ${`%${escapeLike(term)}%`}`,
    // Candidate-only fuzzy fallback; final ranking still enforces edit limits.
    ...(term.length>=4?[sql`${name} LIKE ${`%${escapeLike(term.slice(0,2))}%`}`]:[]),
    sql`lower(${applications.developer}) LIKE ${`%${escapeLike(term)}%`}`,
    sql`lower(${applications.category}) LIKE ${`%${escapeLike(term)}%`}`,
    ...(term.length>=4?[sql`lower(left(${applications.description},400)) LIKE ${`%${escapeLike(term)}%`}`]:[]),
  ]);
  const curatedIds=Object.keys(supplements).map(Number).filter(id=>Number.isInteger(id)&&id>0&&rankDocument({id,name:'',...getCatalogDetails(id)},query));
  if(curatedIds.length)conditions.push(sql`${applications.id} IN (${sql.join(curatedIds.map(id=>sql`${id}`),sql`, `)})`);
  const exact=or(...[...terms].map(term=>sql`${name} = ${term}`));
  const prefix=or(...[...terms].map(term=>sql`${name} LIKE ${`${escapeLike(term)}%`}`));
  return (await db.select(fields).from(applications).where(and(publicWhere,or(...conditions))).orderBy(sql`CASE WHEN ${exact} THEN 0 WHEN ${prefix} THEN 1 ELSE 2 END`,asc(applications.id)).limit(500)).map(document);
}};
