import 'server-only';
import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';
import { trustedNetworks } from '@/lib/downloads/network';

/** Only ingress explicitly verified by the operator may select a network bucket. */
export function requestNetwork(request: Request, env: NodeJS.ProcessEnv): string {
  if (env.DOWNLOAD_INGRESS_VERIFIED !== 'true') return 'shared';
  return trustedNetworks(request,env)[0];
}

/** Atomic, shared across instances; uses the existing small auth limiter table. */
export async function consumeWindow(sql: Sql, value: string, capacity: number, seconds: number): Promise<boolean> {
  const key=createHash('sha256').update(value).digest('hex');
  const [row]=await sql`INSERT INTO site_rate_limits(key,hits,reset_at) VALUES(${key},1,NOW()+${seconds} * INTERVAL '1 second')
    ON CONFLICT(key) DO UPDATE SET
      hits=CASE WHEN site_rate_limits.reset_at<=NOW() THEN 1 ELSE LEAST(site_rate_limits.hits+1,${capacity+1}) END,
      reset_at=CASE WHEN site_rate_limits.reset_at<=NOW() THEN NOW()+${seconds} * INTERVAL '1 second' ELSE site_rate_limits.reset_at END
    RETURNING hits`;
  if(Math.random()<0.01) await sql`DELETE FROM site_rate_limits WHERE key IN
    (SELECT key FROM site_rate_limits WHERE reset_at<NOW()-INTERVAL '1 day' LIMIT 100)`;
  return Number.isInteger(Number(row?.hits)) && Number(row.hits)<=capacity;
}
