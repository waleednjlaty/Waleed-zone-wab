import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';

function createClient() {
  const connectionString = process.env.DATABASE_URL!;
  const forceSsl =
    connectionString.includes('neon.tech') ||
    connectionString.includes('sslmode') ||
    connectionString.includes('ssl=true');

  const sql = postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 10,
    connect_timeout: 10,
    ...(forceSsl ? { ssl: 'require' as const } : {}),
  });

  return drizzle(sql, { schema });
}

const globalForDb = globalThis as unknown as {
  waleedDbClient?: ReturnType<typeof createClient>;
};

export function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!globalForDb.waleedDbClient) {
    globalForDb.waleedDbClient = createClient();
  }
  return globalForDb.waleedDbClient;
}
