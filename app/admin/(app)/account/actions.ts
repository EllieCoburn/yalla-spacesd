"use server";

import { and, eq, isNull } from "drizzle-orm";
import { adminAction } from "@/lib/admin/action";
import { audit, OpsError } from "@/lib/audit";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/crypto";
import { beginMfaSetup, confirmMfaSetup, revokeAllSessions, revokeSession } from "@/lib/auth/staff";
import { staffSessions, staffUsers } from "@/lib/db/schema";

export const startMfa = adminAction(null, async ({ db, staff }) => {
  await beginMfaSetup(db, staff.id);
  return "Scan the code with your authenticator app, then enter the 6-digit code to finish.";
});

export const finishMfa = adminAction(null, async ({ db, staff, str }) => {
  await confirmMfaSetup(db, staff, str("code"));
  return "Two-step verification is on.";
});

export const changePassword = adminAction(null, async ({ db, staff, actor, str }) => {
  const [u] = await db.select().from(staffUsers).where(eq(staffUsers.id, staff.id));
  if (!verifyPassword(str("current"), u.passwordHash)) throw new OpsError("invalid", "Your current password isn’t correct.");
  const p = passwordProblem(str("password"));
  if (p) throw new OpsError("weak_password", p);
  if (str("password") !== str("confirm")) throw new OpsError("invalid", "The new passwords don’t match.");
  await db.update(staffUsers).set({ passwordHash: hashPassword(str("password")) }).where(eq(staffUsers.id, staff.id));
  await revokeAllSessions(db, staff.id, staff.sessionId);
  await audit(db, actor, { action: "staff.password_change", entityType: "staff", entityId: staff.id, summary: "Changed password; other sessions signed out" });
  return "Password changed. You’ve been signed out everywhere else.";
});

export const endSession = adminAction(null, async ({ db, staff, actor, str }) => {
  const id = str("sessionId");
  const [s] = await db.select().from(staffSessions).where(and(eq(staffSessions.id, id), eq(staffSessions.staffId, staff.id), isNull(staffSessions.revokedAt)));
  if (!s) throw new OpsError("not_found", "Session not found.");
  await revokeSession(db, id);
  await audit(db, actor, { action: "staff.session_revoke", entityType: "staff", entityId: staff.id, summary: "Signed out a session" });
  return "Session signed out.";
});
