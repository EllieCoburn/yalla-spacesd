/**
 * Emergency recovery when the only owner has lost their authenticator app. Needs database access
 * (DATABASE_URL), so only someone with Neon access can run it. The person sets up two-step
 * verification again at their next sign-in. Recorded in the audit trail.
 *
 *   npm run admin:reset-mfa -- --email you@yalla.example
 */
import { eq } from "drizzle-orm";
import { resetStaffMfa } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { staffUsers } from "@/lib/db/schema";

const i = process.argv.indexOf("--email");
const email = (i > -1 ? process.argv[i + 1] : process.env.ADMIN_EMAIL)?.trim().toLowerCase();
if (!process.env.DATABASE_URL || !email) {
  console.log("Usage: npm run admin:reset-mfa -- --email you@example.com   (requires DATABASE_URL)");
  process.exit(1);
}
const db = getDb();
const [u] = await db.select().from(staffUsers).where(eq(staffUsers.email, email));
if (!u) {
  console.log("No staff account with that email.");
  process.exit(1);
}
await resetStaffMfa(db, { type: "system", name: "Command-line recovery" }, u.id);
console.log(`Two-step verification reset for ${u.name}. They'll set it up again at their next sign-in.`);
process.exit(0);
