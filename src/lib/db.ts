import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';
const globalForDb=globalThis as unknown as {waleedDbClient?:ReturnType<typeof createDb>;waleedSqlClient?:ReturnType<typeof postgres>};
export function getSql() {
  if(!process.env.DATABASE_URL)return null;
  if(!globalForDb.waleedSqlClient) {
    const connectionString=process.env.DATABASE_URL;
    const forceSsl=connectionString.includes('neon.tech')||connectionString.includes('sslmode')||connectionString.includes('ssl=true');
    globalForDb.waleedSqlClient=postgres(connectionString,{prepare:false,max:1,idle_timeout:10,connect_timeout:10,...(forceSsl?{ssl:'require' as const}:{})});
  }
  return globalForDb.waleedSqlClient;
}
function createDb() {return drizzle(getSql()!,{schema});}
export function getDb() {
  if(!process.env.DATABASE_URL)return null;
  // One existing connection pool for Drizzle and auth, rather than two pools.
  globalForDb.waleedDbClient??=createDb();
  return globalForDb.waleedDbClient;
}
