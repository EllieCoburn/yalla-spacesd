/**
 * Family Portal sign-in (passwordless).
 *
 * Each guardian signs in with their own email. Links are single use, valid for 20 minutes and
 * stored only as hashes. Sessions last 30 days and can be revoked. What a guardian can see follows
 * their own flags (billing, sensitive care information) — never the family as a whole.
 * Cookie handling lives in app/(site)/portal/session.ts.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/auth/crypto";
import type { Executor } from "@/lib/db";
import { families, familyAuthTokens, familySessions, guardians } from "@/lib/db/schema";
import { notificationsMode, notifyFamily } from "@/lib/notify";

export const FAMILY_LINK_MS = 20 * 60 * 1000;
export const FAMILY_SESSION_MS = 30 * 24 * 3600 * 1000;

export type GuardianContext = {
  sessionId: string;
  guardianId: string;
  familyId: string;
  familyName: string;
  firstName: string;
  lastName: string;
  email: string;
  canBook: boolean;
  canViewBilling: boolean;
  canViewSensitive: boolean;
};

/**
 * Sends a sign-in link if the email belongs to a guardian with portal access. The return value is
 * the same either way (so the form never reveals whether an email exists); `devLink` is only set
 * in local development while emails are captured instead of sent.
 */
export async function requestMagicLink(db: Executor, email: string, baseUrl: string): Promise<{ devLink?: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(clean)) return {};
  const [g] = await db
    .select()
    .from(guardians)
    .innerJoin(families, eq(families.id, guardians.familyId))
    .where(and(sql`lower(${guardians.email}) = ${clean}`, eq(guardians.portalAccess, true), eq(families.status, "active")));
  if (!g) return {};
  const token = randomToken();
  await db.insert(familyAuthTokens).values({ guardianId: g.guardians.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + FAMILY_LINK_MS) });
  const link = `${baseUrl}/portal/verify?token=${token}`;
  await notifyFamily(db, { key: "family_sign_in", familyId: g.guardians.familyId, guardianIds: [g.guardians.id], vars: { link }, related: { type: "guardian", id: g.guardians.id } });
  return notificationsMode() === "test" && process.env.NODE_ENV !== "production" ? { devLink: link } : {};
}

/** Exchanges a link for a session. Returns the session token, or null if invalid/expired/used. */
export async function redeemMagicLink(db: Executor, token: string): Promise<string | null> {
  const [t] = await db
    .update(familyAuthTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(familyAuthTokens.tokenHash, sha256(token)), isNull(familyAuthTokens.usedAt), gt(familyAuthTokens.expiresAt, new Date())))
    .returning();
  if (!t) return null;
  const [g] = await db.select().from(guardians).where(eq(guardians.id, t.guardianId));
  if (!g?.portalAccess) return null;
  const session = randomToken();
  await db.insert(familySessions).values({ guardianId: g.id, tokenHash: sha256(session), expiresAt: new Date(Date.now() + FAMILY_SESSION_MS) });
  await audit(db, { type: "family", id: g.id, name: `${g.firstName} ${g.lastName}` }, { action: "family.sign_in", entityType: "family", entityId: g.familyId, summary: "Signed in to the Family Portal" });
  return session;
}

export async function resolveFamilySession(db: Executor, token: string | null | undefined): Promise<GuardianContext | null> {
  if (!token) return null;
  const [row] = await db
    .select({ s: familySessions, g: guardians, f: families })
    .from(familySessions)
    .innerJoin(guardians, eq(guardians.id, familySessions.guardianId))
    .innerJoin(families, eq(families.id, guardians.familyId))
    .where(and(eq(familySessions.tokenHash, sha256(token)), isNull(familySessions.revokedAt), gt(familySessions.expiresAt, new Date())));
  if (!row || !row.g.portalAccess || row.f.status !== "active") return null;
  if (Date.now() - row.s.lastSeenAt.getTime() > 60_000) await db.update(familySessions).set({ lastSeenAt: new Date() }).where(eq(familySessions.id, row.s.id));
  return {
    sessionId: row.s.id,
    guardianId: row.g.id,
    familyId: row.g.familyId,
    familyName: row.f.name,
    firstName: row.g.firstName,
    lastName: row.g.lastName,
    email: row.g.email,
    canBook: row.g.canBook,
    canViewBilling: row.g.canViewBilling,
    canViewSensitive: row.g.canViewSensitive,
  };
}

export async function revokeFamilySession(db: Executor, sessionId: string) {
  await db.update(familySessions).set({ revokedAt: new Date() }).where(eq(familySessions.id, sessionId));
}

export const guardianActor = (g: Pick<GuardianContext, "guardianId" | "firstName" | "lastName">) => ({ type: "family" as const, id: g.guardianId, name: `${g.firstName} ${g.lastName}` });
