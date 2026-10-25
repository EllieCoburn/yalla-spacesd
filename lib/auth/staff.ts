/**
 * Staff authentication core (no Next.js dependencies, so it can be tested directly).
 * Cookie handling lives in ./session.ts.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { authTokens, roles, staffSessions, staffUsers } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, hashPassword, newTotpSecret, passwordProblem, randomToken, sha256, verifyPassword, verifyTotp } from "./crypto";
import { ALL_PERMISSIONS, DEFAULT_ROLES, type Permission } from "./permissions";

export const SESSION_ABSOLUTE_MS = 7 * 24 * 3600 * 1000;
export const SESSION_IDLE_MS = 12 * 3600 * 1000;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;

export type StaffContext = {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  permissions: Permission[];
  mfaEnabled: boolean;
  sessionId: string;
  mfaVerified: boolean;
};

export const staffActor = (s: Pick<StaffContext, "id" | "name" | "permissions">): Actor => ({
  type: "staff",
  id: s.id,
  name: s.name,
  permissions: s.permissions,
});

export function can(staff: Pick<StaffContext, "permissions"> | null | undefined, perm: Permission) {
  return !!staff && staff.permissions.includes(perm);
}

export function assertCan(staff: Pick<StaffContext, "permissions"> | null | undefined, perm: Permission) {
  if (!can(staff, perm)) throw new OpsError("forbidden", "You don’t have permission to do that.");
}

export async function ensureDefaultRoles(db: Executor) {
  for (const r of DEFAULT_ROLES) {
    await db
      .insert(roles)
      .values({ key: r.key, name: r.name, description: r.description, permissions: r.permissions, isSystem: r.key === "owner" })
      .onConflictDoNothing({ target: roles.key });
  }
  // The owner role always holds every permission, including ones added later.
  await db.update(roles).set({ permissions: ALL_PERMISSIONS }).where(eq(roles.key, "owner"));
}

export async function staffCount(db: Executor) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(staffUsers);
  return r.n;
}

export async function createStaff(
  db: Executor,
  actor: Actor,
  input: { email: string; name: string; roleKey: string; password?: string },
) {
  const email = input.email.trim().toLowerCase();
  const [role] = await db.select().from(roles).where(eq(roles.key, input.roleKey));
  if (!role) throw new OpsError("invalid", "Unknown role.");
  if (input.password) {
    const p = passwordProblem(input.password);
    if (p) throw new OpsError("weak_password", p);
  }
  const existing = await db.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.email, email));
  if (existing.length) throw new OpsError("duplicate", "A staff account with that email already exists.");
  const [user] = await db
    .insert(staffUsers)
    .values({ email, name: input.name.trim(), roleId: role.id, passwordHash: input.password ? hashPassword(input.password) : null })
    .returning();
  await audit(db, actor, { action: "staff.create", entityType: "staff", entityId: user.id, summary: `Created staff account for ${user.name} (${role.name})` });
  return user;
}

export type LoginResult =
  | { status: "ok"; token: string; mfaRequired: boolean; staffId: string }
  | { status: "invalid" }
  | { status: "locked"; until: Date }
  | { status: "disabled" };

export async function login(db: Executor, email: string, password: string, meta: { ip?: string; userAgent?: string } = {}): Promise<LoginResult> {
  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.email, email.trim().toLowerCase()));
  if (!user) {
    verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"); // even out timing
    return { status: "invalid" };
  }
  if (user.status !== "active") return { status: "disabled" };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { status: "locked", until: user.lockedUntil };
  if (!verifyPassword(password, user.passwordHash)) {
    const failed = user.failedLogins + 1;
    await db
      .update(staffUsers)
      .set({ failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null })
      .where(eq(staffUsers.id, user.id));
    if (failed >= LOCK_AFTER) {
      await audit(db, { type: "system", name: "System" }, { action: "staff.locked", entityType: "staff", entityId: user.id, summary: `Locked ${user.email} after ${failed} failed sign-ins`, ip: meta.ip });
    }
    return { status: "invalid" };
  }
  const token = randomToken();
  await db.insert(staffSessions).values({
    staffId: user.id,
    tokenHash: sha256(token),
    mfaVerified: !user.mfaEnabled,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300),
    expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
  });
  await db.update(staffUsers).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(staffUsers.id, user.id));
  await audit(db, { type: "staff", id: user.id, name: user.name }, { action: "staff.sign_in", entityType: "staff", entityId: user.id, summary: "Signed in", ip: meta.ip });
  return { status: "ok", token, mfaRequired: user.mfaEnabled, staffId: user.id };
}

/** Resolves a session token to the staff member, enforcing expiry, idle timeout and revocation. */
export async function resolveSession(db: Executor, token: string | undefined | null): Promise<StaffContext | null> {
  if (!token) return null;
  const now = new Date();
  const rows = await db
    .select({ s: staffSessions, u: staffUsers, r: roles })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.staffId))
    .innerJoin(roles, eq(roles.id, staffUsers.roleId))
    .where(and(eq(staffSessions.tokenHash, sha256(token)), isNull(staffSessions.revokedAt), gt(staffSessions.expiresAt, now)));
  const row = rows[0];
  if (!row || row.u.status !== "active") return null;
  if (now.getTime() - row.s.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
  if (now.getTime() - row.s.lastSeenAt.getTime() > 60_000) {
    await db.update(staffSessions).set({ lastSeenAt: now }).where(eq(staffSessions.id, row.s.id));
  }
  return {
    id: row.u.id,
    email: row.u.email,
    name: row.u.name,
    roleKey: row.r.key,
    roleName: row.r.name,
    permissions: row.r.permissions as Permission[],
    mfaEnabled: row.u.mfaEnabled,
    sessionId: row.s.id,
    mfaVerified: row.s.mfaVerified,
  };
}

export async function revokeSession(db: Executor, sessionId: string) {
  await db.update(staffSessions).set({ revokedAt: new Date() }).where(eq(staffSessions.id, sessionId));
}

export async function revokeAllSessions(db: Executor, staffId: string, exceptSessionId?: string) {
  await db
    .update(staffSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffSessions.staffId, staffId), isNull(staffSessions.revokedAt), exceptSessionId ? sql`${staffSessions.id} <> ${exceptSessionId}` : undefined));
}

/* ── MFA ── */

export async function beginMfaSetup(db: Executor, staffId: string) {
  const secret = newTotpSecret();
  await db.update(staffUsers).set({ mfaSecretEnc: encryptSecret(secret), mfaEnabled: false }).where(eq(staffUsers.id, staffId));
  return secret;
}

export async function confirmMfaSetup(db: Executor, staff: StaffContext, code: string) {
  const [u] = await db.select().from(staffUsers).where(eq(staffUsers.id, staff.id));
  if (!u?.mfaSecretEnc || !verifyTotp(decryptSecret(u.mfaSecretEnc), code)) throw new OpsError("invalid_code", "That code didn’t match. Check your authenticator app’s time and try again.");
  await db.update(staffUsers).set({ mfaEnabled: true }).where(eq(staffUsers.id, staff.id));
  await db.update(staffSessions).set({ mfaVerified: true }).where(eq(staffSessions.id, staff.sessionId));
  await audit(db, staffActor(staff), { action: "staff.mfa_enabled", entityType: "staff", entityId: staff.id, summary: "Turned on two-step verification" });
}

export async function verifyMfaForSession(db: Executor, token: string, code: string) {
  const [row] = await db
    .select({ s: staffSessions, u: staffUsers })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.staffId))
    .where(and(eq(staffSessions.tokenHash, sha256(token)), isNull(staffSessions.revokedAt), gt(staffSessions.expiresAt, new Date())));
  if (!row?.u.mfaSecretEnc) return false;
  if (!verifyTotp(decryptSecret(row.u.mfaSecretEnc), code)) return false;
  await db.update(staffSessions).set({ mfaVerified: true }).where(eq(staffSessions.id, row.s.id));
  return true;
}

/* ── Password reset & invitations ── */

export async function createAuthToken(db: Executor, staffId: string, kind: "password_reset" | "invite") {
  const token = randomToken();
  await db.insert(authTokens).values({
    staffId,
    kind,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + (kind === "invite" ? 7 * 24 : 1) * 3600 * 1000),
  });
  return token;
}

export async function completePasswordToken(db: Executor, token: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new OpsError("weak_password", problem);
  const [t] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(token)), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
  if (!t) throw new OpsError("invalid_token", "This link has expired or was already used. Request a new one.");
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
  await db.update(staffUsers).set({ passwordHash: hashPassword(password), failedLogins: 0, lockedUntil: null }).where(eq(staffUsers.id, t.staffId));
  await revokeAllSessions(db, t.staffId);
  await audit(db, { type: "system", name: "System" }, { action: t.kind === "invite" ? "staff.invite_accepted" : "staff.password_reset", entityType: "staff", entityId: t.staffId, summary: t.kind === "invite" ? "Accepted invitation and set a password" : "Reset password via email link" });
  return t.staffId;
}
