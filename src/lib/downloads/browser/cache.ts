import 'server-only';
import type { Sql } from 'postgres';
import { stableBzzhr } from './policy';
export const DISCOVERY_TTL_SECONDS=21600;
export function discoveryCache(sql:Sql) {
  return {
    async read(id:number,revision:string,source:string):Promise<string[]> {
      const [row]=await sql`SELECT provider_pages FROM site_provider_discovery WHERE application_id=${id}
        AND source_revision=${revision} AND source_url=${source} AND expires_at>clock_timestamp()`;
      try {return Array.isArray(row?.provider_pages)?row.provider_pages.slice(0,3).map(stableBzzhr):[];}catch{return [];}
    },
    async write(id:number,revision:string,source:string,pages:string[]) {
      const stable=[...new Set(pages.map(stableBzzhr))].slice(0,3);if(!stable.length)return;
      await sql`INSERT INTO site_provider_discovery(application_id,source_revision,source_url,provider_pages,expires_at)
        VALUES(${id},${revision},${source},${JSON.stringify(stable)}::jsonb,clock_timestamp()+interval '6 hours')
        ON CONFLICT(application_id) DO UPDATE SET source_revision=excluded.source_revision,source_url=excluded.source_url,
        provider_pages=excluded.provider_pages,expires_at=excluded.expires_at`;
    },
    async clear(id:number){await sql`DELETE FROM site_provider_discovery WHERE application_id=${id}`;},
  };
}
