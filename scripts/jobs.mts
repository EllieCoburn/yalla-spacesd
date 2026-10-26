/** Runs housekeeping once (same work as the /api/cron/housekeeping route). Usage: npm run jobs:run */
import { getDb } from "@/lib/db";
import { runHousekeeping } from "@/lib/jobs";

const result = await runHousekeeping(getDb(), { baseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000" });
console.log("[jobs]", JSON.stringify(result));
process.exit(0);
