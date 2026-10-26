/**
 * Creates an owner account from the command line (first-time setup or emergency access).
 *
 *   ADMIN_EMAIL=you@yalla.example ADMIN_NAME="Your Name" ADMIN_PASSWORD="a long passphrase" npm run admin:create
 *   npm run admin:create -- --email you@yalla.example --name "Your Name" --password "a long passphrase"
 *
 * The password must be at least 12 characters. Turn on two-step verification after signing in.
 */
import { SYSTEM } from "@/lib/audit";
import { createStaff, ensureDefaultRoles } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const email = arg("email") ?? process.env.ADMIN_EMAIL;
const name = arg("name") ?? process.env.ADMIN_NAME;
const password = arg("password") ?? process.env.ADMIN_PASSWORD;
const role = arg("role") ?? "owner";

if (!process.env.DATABASE_URL || !email || !name || !password) {
  console.log(`Create a Yalla Admin account.

Usage:
  ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD="a long passphrase" npm run admin:create
  npm run admin:create -- --email you@example.com --name "Your Name" --password "a long passphrase" [--role owner|operations|educator|billing]

Requires DATABASE_URL (read from .env.local when present).`);
  process.exit(1);
}

try {
  const db = getDb();
  await ensureDefaultRoles(db);
  const user = await createStaff(db, SYSTEM, { email, name, roleKey: role, password });
  console.log(`Created ${role} account for ${user.name} <${user.email}>. Sign in at /admin/login and turn on two-step verification.`);
  process.exit(0);
} catch (e) {
  console.error(`Couldn’t create the account: ${(e as Error).message}`);
  process.exit(1);
}
