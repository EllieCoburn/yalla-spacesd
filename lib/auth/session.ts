import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import type { Permission } from "./permissions";
import { can, resolveSession, SESSION_ABSOLUTE_MS, type StaffContext } from "./staff";

export const ADMIN_COOKIE = "yalla_admin";

export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(getDb(), token);
});

/** For admin pages: signed in, MFA satisfied. */
export async function requireStaff(): Promise<StaffContext> {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");
  if (staff.mfaEnabled && !staff.mfaVerified) redirect("/admin/login/verify");
  return staff;
}

/** For admin pages that need a specific permission. Enforced on the server. */
export async function requirePermission(perm: Permission): Promise<StaffContext> {
  const staff = await requireStaff();
  if (!can(staff, perm)) redirect(`/admin/forbidden?need=${encodeURIComponent(perm)}`);
  return staff;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000),
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function sessionToken() {
  return (await cookies()).get(ADMIN_COOKIE)?.value ?? null;
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
    origin: h.get("origin") ?? undefined,
    host: h.get("host") ?? undefined,
  };
}
