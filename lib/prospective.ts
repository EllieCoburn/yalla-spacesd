import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Prospective Family Portal access.
 *
 * Stage 1 uses a shared access code that Yalla gives to families who reach out.
 * Set PROSPECTIVE_ACCESS_CODE in Vercel to choose it. Preview deployments and
 * local builds fall back to "yalla-preview" so the portal can be reviewed; on
 * production the portal stays locked until a code is set.
 * Stage 2 replaces this with individual invitations tied to family accounts.
 */

export const ACCESS_COOKIE = "yalla_prospective";
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

function accessCode(): string | null {
  const code = process.env.PROSPECTIVE_ACCESS_CODE?.trim();
  if (code) return code;
  if (process.env.VERCEL_ENV !== "production") return "yalla-preview";
  return null;
}

function tokenFor(code: string) {
  const secret = process.env.AUTH_SECRET || code;
  return createHmac("sha256", secret).update(`prospective:${code}`).digest("hex");
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export function codeMatches(input: string) {
  const code = accessCode();
  if (!code) return false;
  return timingSafeEqual(digest(input.trim().toLowerCase()), digest(code.toLowerCase()));
}

export function accessToken() {
  const code = accessCode();
  return code ? tokenFor(code) : null;
}

export async function hasProspectiveAccess() {
  const expected = accessToken();
  if (!expected) return false;
  const got = (await cookies()).get(ACCESS_COOKIE)?.value;
  return !!got && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
