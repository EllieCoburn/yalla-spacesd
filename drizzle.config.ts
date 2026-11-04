import { defineConfig } from "drizzle-kit";
import { migrationUrl } from "./lib/db/url";

// drizzle-kit (generate / studio / push) uses the direct Neon connection, like scripts/migrate.mts.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: migrationUrl() ?? "" },
});
