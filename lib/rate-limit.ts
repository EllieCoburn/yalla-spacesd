/**
 * Simple, database-backed rate limits for abuse-prone actions. Each attempt is recorded under a
 * one-way hash of its key (an email or IP address), and an action is refused once a key reaches its
 * limit within the window. Works across server instances without another service.
 */
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { OpsError } from "@/lib/audit";
import { sha256 } from "@/lib/auth/crypto";
import type { Executor } from "@/lib/db";
import { rateEvents } from "@/lib/db/schema";

export const LIMITS = {
  familySignInIp: { limit: 30, windowSec: 15 * 60 },
  familySignInEmail: { limit: 10, windowSec: 15 * 60 },
  signInLinkEmail: { limit: 5, windowSec: 60 * 60 },
  signInLinkIp: { limit: 20, windowSec: 60 * 60 },
  signUpIp: { limit: 10, windowSec: 60 * 60 },
  staffSignInIp: { limit: 30, windowSec: 15 * 60 },
  staffResetEmail: { limit: 3, windowSec: 60 * 60 },
  staffResetIp: { limit: 20, windowSec: 60 * 60 },
  bookingIp: { limit: 15, windowSec: 60 * 60 },
  couponIp: { limit: 20, windowSec: 15 * 60 },
  bookingEmail: { limit: 10, windowSec: 60 * 60 },
  waitlistIp: { limit: 15, windowSec: 60 * 60 },
  /** Check-in codes entered at the lobby kiosk (per kiosk session): plenty for a busy morning, far too few to guess codes. */
  kioskCode: { limit: 60, windowSec: 10 * 60 },
  questionIp: { limit: 10, windowSec: 60 * 60 },
  playPassIp: { limit: 10, windowSec: 60 * 60 },
  emailCheckIp: { limit: 30, windowSec: 60 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

const hash = (bucket: string, key: string) => sha256(`${bucket}:${key.trim().toLowerCase()}`);

/** Records an attempt; returns false (without recording) once the key is over its limit. */
export async function allow(db: Executor, name: LimitName, key: string | null | undefined): Promise<boolean> {
  if (!key) return true;
  const { limit, windowSec } = LIMITS[name];
  const keyHash = hash(name, key);
  const since = new Date(Date.now() - windowSec * 1000);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rateEvents)
    .where(and(eq(rateEvents.bucket, name), eq(rateEvents.keyHash, keyHash), gt(rateEvents.createdAt, since)));
  if (r.n >= limit) return false;
  await db.insert(rateEvents).values({ bucket: name, keyHash });
  return true;
}

/** Like allow(), but refuses with a friendly message. */
export async function throttle(db: Executor, name: LimitName, key: string | null | undefined, message = "That’s a lot of attempts in a short time. Please wait a little while and try again.") {
  if (!(await allow(db, name, key))) throw new OpsError("throttled", message);
}

/** Housekeeping: attempts older than a day are no longer needed. */
export async function pruneRateEvents(db: Executor) {
  await db.delete(rateEvents).where(lt(rateEvents.createdAt, new Date(Date.now() - 24 * 3600 * 1000)));
}
