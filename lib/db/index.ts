import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl } from "./url";

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const globalForDb = globalThis as unknown as { __yallaSql?: postgres.Sql; __yallaDb?: DB };

export function isDbConfigured() {
  return !!databaseUrl();
}

export function getDb(): DB {
  if (globalForDb.__yallaDb) return globalForDb.__yallaDb;
  const url = databaseUrl();
  if (!url) throw new Error("No database connection string found (DATABASE_URL). See docs/ADMIN.md for setup.");
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idle_timeout: 20,
    prepare: !/pooler|pgbouncer/.test(url),
    onnotice: () => {},
  });
  globalForDb.__yallaSql = client;
  globalForDb.__yallaDb = drizzle(client, { schema });
  return globalForDb.__yallaDb;
}

export { schema };
