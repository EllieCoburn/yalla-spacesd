import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const globalForDb = globalThis as unknown as { __yallaSql?: postgres.Sql; __yallaDb?: DB };

export function isDbConfigured() {
  return !!process.env.DATABASE_URL;
}

export function getDb(): DB {
  if (globalForDb.__yallaDb) return globalForDb.__yallaDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See docs/ADMIN.md for setup.");
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
