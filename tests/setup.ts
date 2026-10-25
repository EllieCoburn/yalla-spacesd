// Tests run against a real Postgres database (TEST_DATABASE_URL), never the dev or production DB.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const url = process.env.TEST_DATABASE_URL ?? env.TEST_DATABASE_URL;
if (!url || !/test/.test(url)) throw new Error("Set TEST_DATABASE_URL to a dedicated test database (its name must contain 'test').");
process.env.DATABASE_URL = url;
process.env.AUTH_SECRET = env.AUTH_SECRET ?? "test-secret-test-secret-test-secret-0000";
process.env.NOTIFICATIONS_MODE = "test";
delete process.env.STRIPE_SECRET_KEY;
