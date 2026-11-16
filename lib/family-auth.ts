/**
 * Family Portal accounts.
 *
 * - Families create an account with their name, email, a password and their children, and are
 *   signed in straight away. After that they sign in with email and password.
 * - Sessions last up to 30 days on that browser (7 days without use), and can be revoked.
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
import { families, familyAuthTokens, familySessions, familySignups, guardians } from "@/lib/db/schema";
import { notificationsMode, notifyFamily, notifyStaff } from "@/lib/notify";
import { staffRecipients } from "@/lib/ops/enquiries";
import { fmtDate } from "@/lib/time";
import { allow } from "@/lib/rate-limit";

export const FAMILY_LINK_MS = 20 * 60 * 1000;
/** A family stays signed in on a browser for up to 30 days, and is signed out after 7 days unused. */
export const FAMILY_SESSION_MS = 30 * 24 * 3600 * 1000;
export const FAMILY_IDLE_MS = 7 * 24 * 3600 * 1000;
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
  // A few links an hour per email at most, so nobody can flood a family's inbox.
  if (!(await allow(db, "signInLinkEmail", clean))) return {};
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
  if (Date.now() - row.s.lastSeenAt.getTime() > FAMILY_IDLE_MS) return null;
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

/** How long a sign-up confirmation link works. */
export const FAMILY_SIGNUP_MS = 24 * 3600 * 1000;

/**
 * Start a new family account. Nothing is created yet: the details wait (password already hashed)
 * until the family confirms their email with the link we send, so nobody can open an account, or
 * enter children's details, under someone else's address. If the email already belongs to a
 * guardian, nothing is stored: with a password they're asked to sign in; without one (an earlier
 * booking) a link to set a password is emailed.
 */
export async function registerFamilyAccount(db: DB, input: NewAccount, baseUrl: string): Promise<{ emailed: true; confirm?: boolean; devLink?: string }> {
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

  // Only the latest request for an email counts.
  await db.delete(familySignups).where(eq(familySignups.email, email));
  const token = randomToken();
  await db.insert(familySignups).values({
    tokenHash: sha256(token),
    email,
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      passwordHash: hashPassword(input.password),
      children: kids.map((c) => ({ firstName: c.firstName.trim(), lastName: c.lastName?.trim() || undefined, birthDate: c.birthDate })),
    },
    expiresAt: new Date(Date.now() + FAMILY_SIGNUP_MS),
  });
  const link = `${baseUrl}/portal/verify?signup=${token}`;
  await notifyStaff(db, { key: "family_confirm_email", to: email, vars: { guardian_first_name: input.firstName.trim(), link }, relatedType: "signup" });
  return { emailed: true, confirm: true, devLink: notificationsMode() === "test" && process.env.NODE_ENV !== "production" ? link : undefined };
}

/**
 * The family used the link in their confirmation email: create the family, guardian, password and
 * children, sign them in, and send the welcome email and the team's notice. Single use.
 */
export async function completeFamilySignup(db: DB, token: string, baseUrl: string): Promise<{ session: string } | null> {
  const created = await db.transaction(async (tx) => {
    const [p] = await tx.delete(familySignups).where(and(eq(familySignups.tokenHash, sha256(token)), gt(familySignups.expiresAt, new Date()))).returning();
    if (!p) return null;
    // Someone else may have set up this email in the meantime; never attach to an existing family.
    const [taken] = await tx.select({ id: guardians.id }).from(guardians).where(sql`lower(${guardians.email}) = ${p.email}`);
    if (taken) return null;
    const d = p.data;
    const actor = { type: "system" as const, name: "Family Portal sign-up" };
    const { family, guardian } = await createFamily(tx, actor, { guardian: { firstName: d.firstName, lastName: d.lastName, email: p.email } });
    await tx.update(guardians).set({ passwordHash: d.passwordHash }).where(eq(guardians.id, guardian.id));
    for (const c of d.children)
      await addChild(tx, { type: "family", id: guardian.id, name: `${guardian.firstName} ${guardian.lastName}` }, family.id, {
        firstName: c.firstName,
        lastName: c.lastName || guardian.lastName,
        birthDate: c.birthDate,
      });
    await audit(tx, { type: "family", id: guardian.id, name: `${guardian.firstName} ${guardian.lastName}` }, { action: "family.account_created", entityType: "family", entityId: family.id, summary: `Confirmed their email and created a Family Portal account with ${d.children.length} ${d.children.length === 1 ? "child" : "children"}` });
    return { session: await startSession(tx, guardian.id), familyId: family.id, guardianId: guardian.id, guardian, kids: d.children, email: p.email };
  });
  if (!created) return null;

  // Emails go out after the account is saved; a sending problem never blocks signing up.
  const { guardian, familyId, guardianId, kids, email } = created;
  await notifyFamily(db, { key: "family_welcome", familyId, guardianIds: [guardianId], vars: { portal_link: `${baseUrl}/portal/home` }, related: { type: "guardian", id: guardianId } }).catch((e) =>
    console.error("[welcome email failed]", (e as Error).message?.slice(0, 120)),
  );
  const details = [
    `Parent: ${guardian.firstName} ${guardian.lastName}`,
    `Email: ${email}`,
    ...(kids.length ? kids.map((c, i) => `${kids.length > 1 ? `Child ${i + 1}` : "Child"}: ${c.firstName}, born ${fmtDate(c.birthDate, "MMM d, yyyy")}`) : ["Children: none added yet"]),
  ].join("\n");
  for (const to of await staffRecipients(db).catch(() => [] as string[]))
    await notifyStaff(db, { key: "staff_family_joined", to, vars: { family_name: guardian.lastName.trim(), details, link: `${baseUrl}/admin/families/${familyId}` }, relatedId: familyId }).catch((e) =>
      console.error("[family joined email failed]", (e as Error).message?.slice(0, 120)),
    );
  return { session: created.session };
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
  // A new password signs out every other device.
  await revokeOtherFamilySessions(db, g.guardianId, g.sessionId);
  await audit(db, { type: "family", id: g.guardianId, name: `${g.firstName} ${g.lastName}` }, { action: "family.password_set", entityType: "family", entityId: g.familyId, summary: "Set a Family Portal password; other devices signed out" });
}

/** Signs a guardian out everywhere except (optionally) the current session. */
export async function revokeOtherFamilySessions(db: Executor, guardianId: string, exceptSessionId?: string) {
  await db
    .update(familySessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(familySessions.guardianId, guardianId), isNull(familySessions.revokedAt), exceptSessionId ? sql`${familySessions.id} <> ${exceptSessionId}` : undefined));
}

export async function hasPassword(db: Executor, guardianId: string) {
  const [g] = await db.select({ h: guardians.passwordHash }).from(guardians).where(eq(guardians.id, guardianId));
  return !!g?.h;
}
