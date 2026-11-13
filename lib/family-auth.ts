/**
 * Family Portal accounts.
 *
 * - Families create an account with their name, email, a password and their children, and are
 *   signed in straight away. After that they sign in with email and password.
 * - Sessions last a year on that browser (until they sign out) and can be revoked.
 * - Emailed links (single use, 20 minutes, stored only as hashes) are used to set a password for
 *   an email Yalla already has (e.g. from an earlier booking) and to reset a forgotten password.
 * - Repeated wrong passwords lock that account for 15 minutes.
 * What a guardian can see follows their own flags (billing, sensitive care information).
 * Cookie handling lives in app/(site)/portal/session.ts.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { audit, OpsError } from "@/lib/audit";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/auth/crypto";
import { addChild, createFamily } from "@/lib/ops/families";
import type { DB, Executor } from "@/lib/db";
import { families, familyAuthTokens, familySessions, guardians } from "@/lib/db/schema";
import { notificationsMode, notifyFamily } from "@/lib/notify";

export const FAMILY_LINK_MS = 20 * 60 * 1000;
export const FAMILY_SESSION_MS = 365 * 24 * 3600 * 1000;
const LOCK_AFTER = 8;
const LOCK_MS = 15 * 60 * 1000;

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
/** Where a sign-in link may send the family afterwards (same-site pages only). */
export const safeNextPath = (n: unknown, fallback = "/portal/home") => (typeof n === "string" && /^\/(book|portal|play-passes)(\/|$|\?)/.test(n) && !n.startsWith("//") ? n : fallback);

export async function requestMagicLink(db: Executor, email: string, baseUrl: string, next?: string): Promise<{ devLink?: string }> {
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
  const after = next ? safeNextPath(next, "") : "";
  const link = `${baseUrl}/portal/verify?token=${token}${after ? `&next=${encodeURIComponent(after)}` : ""}`;
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

/* ───────────────────────── Passwords ───────────────────────── */

const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwertyuiop", "iloveyou", "yallayalla", "letmein123"]);

export function familyPasswordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters for your password.";
  if (password.length > 200) return "That password is too long.";
  if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) return "Choose a less common password.";
  return null;
}

async function startSession(db: Executor, guardianId: string) {
  const session = randomToken();
  await db.insert(familySessions).values({ guardianId, tokenHash: sha256(session), expiresAt: new Date(Date.now() + FAMILY_SESSION_MS) });
  return session;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type NewAccount = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  children: { firstName: string; lastName?: string; birthDate: string }[];
};

/**
 * Create a family account and sign in. If the email already belongs to a guardian, nothing is
 * created: with a password they're asked to sign in; without one (an earlier booking) a link to
 * set a password is emailed, so nobody can take over an existing family by typing its email.
 */
export async function registerFamilyAccount(db: DB, input: NewAccount, baseUrl: string): Promise<{ session: string } | { emailed: true; devLink?: string }> {
  const email = input.email.trim().toLowerCase();
  if (!input.firstName.trim() || !input.lastName.trim()) throw new OpsError("invalid", "Enter your first and last name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new OpsError("invalid", "Enter a valid email address.");
  const problem = familyPasswordProblem(input.password);
  if (problem) throw new OpsError("invalid", problem);
  const kids = input.children.filter((c) => c.firstName.trim() || c.birthDate);
  const today = new Date().toISOString().slice(0, 10);
  for (const c of kids) {
    if (!c.firstName.trim() || !DATE.test(c.birthDate)) throw new OpsError("invalid", "Add each child’s first name and date of birth.");
    if (c.birthDate > today) throw new OpsError("invalid", `${c.firstName.trim()}’s date of birth is in the future.`);
  }

  const [existing] = await db.select().from(guardians).where(sql`lower(${guardians.email}) = ${email}`);
  if (existing) {
    if (existing.passwordHash) throw new OpsError("exists", "There’s already an account with this email. Sign in instead, or reset your password.");
    const { devLink } = await requestMagicLink(db, email, baseUrl, "/portal/account?welcome=1");
    return { emailed: true, devLink };
  }

  return db.transaction(async (tx) => {
    const actor = { type: "system" as const, name: "Family Portal sign-up" };
    const { family, guardian } = await createFamily(tx, actor, { guardian: { firstName: input.firstName, lastName: input.lastName, email } });
    await tx.update(guardians).set({ passwordHash: hashPassword(input.password) }).where(eq(guardians.id, guardian.id));
    for (const c of kids)
      await addChild(tx, { type: "family", id: guardian.id, name: `${guardian.firstName} ${guardian.lastName}` }, family.id, {
        firstName: c.firstName.trim(),
        lastName: c.lastName?.trim() || guardian.lastName,
        birthDate: c.birthDate,
      });
    await audit(tx, { type: "family", id: guardian.id, name: `${guardian.firstName} ${guardian.lastName}` }, { action: "family.account_created", entityType: "family", entityId: family.id, summary: `Created a Family Portal account with ${kids.length} ${kids.length === 1 ? "child" : "children"}` });
    return { session: await startSession(tx, guardian.id) };
  });
}

/**
 * Sign in with email and password. A guardian who has never set a password is emailed a link to
 * set one. Wrong passwords count toward a short lockout; the message never says which part was wrong.
 */
export async function signInWithPassword(db: Executor, input: { email: string; password: string; baseUrl: string; ip?: string }): Promise<{ session: string } | { emailed: true; devLink?: string }> {
  const email = input.email.trim().toLowerCase();
  const wrong = new OpsError("invalid", "That email and password don’t match. Try again, or reset your password.");
  const [row] = await db
    .select({ g: guardians, f: families })
    .from(guardians)
    .innerJoin(families, eq(families.id, guardians.familyId))
    .where(sql`lower(${guardians.email}) = ${email}`);
  if (!row || !row.g.portalAccess || row.f.status !== "active") {
    verifyPassword(input.password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86)); // even out timing
    throw wrong;
  }
  const g = row.g;
  if (g.lockedUntil && g.lockedUntil > new Date()) throw new OpsError("locked", "Too many attempts. Please wait 15 minutes, or reset your password.");
  if (!g.passwordHash) {
    const { devLink } = await requestMagicLink(db, email, input.baseUrl, "/portal/account?welcome=1");
    return { emailed: true, devLink };
  }
  if (!verifyPassword(input.password, g.passwordHash)) {
    const failed = g.failedLogins + 1;
    await db.update(guardians).set({ failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null }).where(eq(guardians.id, g.id));
    if (failed >= LOCK_AFTER) await audit(db, { type: "system", name: "System" }, { action: "family.locked", entityType: "family", entityId: g.familyId, summary: `Portal sign-in paused for ${g.email} after ${failed} wrong passwords`, ip: input.ip });
    throw wrong;
  }
  await db.update(guardians).set({ failedLogins: 0, lockedUntil: null }).where(eq(guardians.id, g.id));
  await audit(db, { type: "family", id: g.id, name: `${g.firstName} ${g.lastName}` }, { action: "family.sign_in", entityType: "family", entityId: g.familyId, summary: "Signed in to the Family Portal", ip: input.ip });
  return { session: await startSession(db, g.id) };
}

/** Set or change the signed-in guardian's password (they're already verified by their session). */
export async function setFamilyPassword(db: Executor, g: GuardianContext, password: string) {
  const problem = familyPasswordProblem(password);
  if (problem) throw new OpsError("invalid", problem);
  await db.update(guardians).set({ passwordHash: hashPassword(password), failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(guardians.id, g.guardianId));
  await audit(db, { type: "family", id: g.guardianId, name: `${g.firstName} ${g.lastName}` }, { action: "family.password_set", entityType: "family", entityId: g.familyId, summary: "Set a Family Portal password" });
}

export async function hasPassword(db: Executor, guardianId: string) {
  const [g] = await db.select({ h: guardians.passwordHash }).from(guardians).where(eq(guardians.id, guardianId));
  return !!g?.h;
}
