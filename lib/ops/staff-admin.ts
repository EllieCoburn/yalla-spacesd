/**
 * Staff accounts & roles administration. All checks happen here on the server:
 * - The owner role always keeps every permission.
 * - You can't disable yourself, and the last active owner can't be disabled or demoted.
 * - Disabling an account signs it out everywhere.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import { ALL_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { createAuthToken, createStaff, revokeAllSessions } from "@/lib/auth/staff";
import type { DB, Executor } from "@/lib/db";
import { roles, staffUsers } from "@/lib/db/schema";
import { notifyStaff } from "@/lib/notify";

async function activeOwnerCount(db: Executor, excludeId?: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(staffUsers)
    .innerJoin(roles, eq(roles.id, staffUsers.roleId))
    .where(and(eq(roles.key, "owner"), eq(staffUsers.status, "active"), excludeId ? ne(staffUsers.id, excludeId) : undefined));
  return r.n;
}

export async function inviteStaff(db: DB, actor: Actor, input: { email: string; name: string; roleKey: string }, baseUrl: string) {
  if (!input.name.trim()) throw new OpsError("invalid", "Enter their name.");
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new OpsError("invalid", "Enter a valid email address.");
  const user = await createStaff(db, actor, { email: input.email, name: input.name, roleKey: input.roleKey });
  const [role] = await db.select().from(roles).where(eq(roles.key, input.roleKey));
  const token = await createAuthToken(db, user.id, "invite");
  const link = `${baseUrl}/admin/reset?token=${token}&invite=1`;
  const sent = await notifyStaff(db, { key: "staff_invite", to: user.email, vars: { name: user.name, invited_by: actor.name, role: role.name, link }, relatedId: user.id });
  await audit(db, actor, { action: "staff.invite", entityType: "staff", entityId: user.id, summary: `Invited ${user.name} as ${role.name}` });
  return { user, link, mode: sent.mode };
}

export async function resendInvite(db: DB, actor: Actor, staffId: string, baseUrl: string) {
  const [u] = await db.select().from(staffUsers).where(eq(staffUsers.id, staffId));
  if (!u) throw new OpsError("not_found", "Staff member not found.");
  if (u.passwordHash) throw new OpsError("invalid", "This person has already set a password. They can use “Forgot password” instead.");
  const [role] = await db.select().from(roles).where(eq(roles.id, u.roleId));
  const token = await createAuthToken(db, u.id, "invite");
  const link = `${baseUrl}/admin/reset?token=${token}&invite=1`;
  const sent = await notifyStaff(db, { key: "staff_invite", to: u.email, vars: { name: u.name, invited_by: actor.name, role: role.name, link }, relatedId: u.id });
  await audit(db, actor, { action: "staff.invite", entityType: "staff", entityId: u.id, summary: `Re-sent invitation to ${u.name}` });
  return { link, mode: sent.mode };
}

export async function changeRole(db: DB, actor: Actor, staffId: string, roleKey: string) {
  const [u] = await db.select({ u: staffUsers, r: roles }).from(staffUsers).innerJoin(roles, eq(roles.id, staffUsers.roleId)).where(eq(staffUsers.id, staffId));
  if (!u) throw new OpsError("not_found", "Staff member not found.");
  const [next] = await db.select().from(roles).where(eq(roles.key, roleKey));
  if (!next) throw new OpsError("invalid", "Unknown role.");
  if (u.r.key === next.key) return;
  if (u.r.key === "owner" && u.u.status === "active" && (await activeOwnerCount(db, staffId)) === 0) throw new OpsError("last_owner", "Yalla needs at least one active owner. Make someone else an owner first.");
  await db.update(staffUsers).set({ roleId: next.id, updatedAt: new Date() }).where(eq(staffUsers.id, staffId));
  await audit(db, actor, { action: "staff.role", entityType: "staff", entityId: staffId, summary: `Changed ${u.u.name}’s role from ${u.r.name} to ${next.name}`, changes: { role: { from: u.r.key, to: next.key } } });
}

export async function setStaffStatus(db: DB, actor: Actor & { id?: string }, staffId: string, status: "active" | "disabled") {
  const [u] = await db.select({ u: staffUsers, r: roles }).from(staffUsers).innerJoin(roles, eq(roles.id, staffUsers.roleId)).where(eq(staffUsers.id, staffId));
  if (!u) throw new OpsError("not_found", "Staff member not found.");
  if (status === "disabled") {
    if (actor.type === "staff" && actor.id === staffId) throw new OpsError("invalid", "You can’t disable your own account.");
    if (u.r.key === "owner" && (await activeOwnerCount(db, staffId)) === 0) throw new OpsError("last_owner", "You can’t disable the last active owner.");
  }
  await db.update(staffUsers).set({ status, updatedAt: new Date(), ...(status === "active" ? { failedLogins: 0, lockedUntil: null } : {}) }).where(eq(staffUsers.id, staffId));
  if (status === "disabled") await revokeAllSessions(db, staffId);
  await audit(db, actor, { action: status === "disabled" ? "staff.disable" : "staff.enable", entityType: "staff", entityId: staffId, summary: `${status === "disabled" ? "Disabled" : "Re-enabled"} ${u.u.name}${status === "disabled" ? " and signed them out" : ""}` });
}

export async function updateRolePermissions(db: DB, actor: Actor, roleId: string, permissions: string[]) {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role) throw new OpsError("not_found", "Role not found.");
  if (role.key === "owner") throw new OpsError("invalid", "The owner role always has full access and can’t be edited.");
  const valid = permissions.filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p));
  const before = new Set(role.permissions);
  const after = new Set(valid);
  const added = valid.filter((p) => !before.has(p));
  const removed = role.permissions.filter((p) => !after.has(p as Permission));
  await db.update(roles).set({ permissions: valid, updatedAt: new Date() }).where(eq(roles.id, roleId));
  await audit(db, actor, {
    action: "staff.role_permissions",
    entityType: "role",
    entityId: roleId,
    summary: `Updated ${role.name} permissions${added.length ? ` · added ${added.join(", ")}` : ""}${removed.length ? ` · removed ${removed.join(", ")}` : ""}`,
    changes: { added, removed },
  });
}

export async function createRole(db: DB, actor: Actor, input: { name: string; description?: string; copyFrom?: string }) {
  if (!input.name.trim()) throw new OpsError("invalid", "Name the role.");
  const key = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!key) throw new OpsError("invalid", "Use letters or numbers in the role name.");
  const existing = await db.select().from(roles).where(eq(roles.key, key));
  if (existing.length) throw new OpsError("duplicate", "A role with that name already exists.");
  let permissions: string[] = ["dashboard.view"];
  if (input.copyFrom) {
    const [src] = await db.select().from(roles).where(eq(roles.id, input.copyFrom));
    if (src && src.key !== "owner") permissions = src.permissions;
  }
  const [r] = await db.insert(roles).values({ key, name: input.name.trim(), description: input.description?.trim() || null, permissions }).returning();
  await audit(db, actor, { action: "staff.role_create", entityType: "role", entityId: r.id, summary: `Created role ${r.name}` });
  return r;
}
