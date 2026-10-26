/** Applies pending migrations. Runs automatically before `next build` when DATABASE_URL is set. */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseUrl } from "../lib/db/url.ts";

const url = databaseUrl();
if (!url) {
  console.log("[migrate] No database configured — skipping migrations.");
  process.exit(0);
}
const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "lib/db/migrations" });
console.log("[migrate] Database is up to date.");
await client.end();
