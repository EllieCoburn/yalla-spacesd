"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SYSTEM } from "@/lib/audit";
import { safeEqual } from "@/lib/auth/crypto";
import { clearSessionCookie, getStaff, requestMeta, sessionToken, setSessionCookie } from "@/lib/auth/session";
import { completePasswordToken, createAuthToken, createStaff, ensureDefaultRoles, login, revokeSession, staffCount, verifyMfaForSession } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { staffUsers } from "@/lib/db/schema";
import { notifyStaff } from "@/lib/notify";
import { OpsError } from "@/lib/audit";

export type AuthState = { error?: string; message?: string; email?: string; link?: string } | undefined;

function baseUrl(meta: { host?: string }) {
  const proto = meta.host?.startsWith("localhost") || meta.host?.startsWith("127.") ? "http" : "https";
  return process.env.PUBLIC_BASE_URL ?? `${proto}://${meta.host}`;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const meta = await requestMeta();
  const res = await login(getDb(), email, password, meta);
  if (res.status === "locked") return { email, error: "Too many attempts. This account is locked for 15 minutes, or reset your password." };
  if (res.status === "disabled") return { email, error: "This account has been disabled. Ask an administrator." };
  if (res.status !== "ok") return { email, error: "That email and password don’t match." };
  await setSessionCookie(res.token);
  redirect(res.mfaRequired ? "/admin/login/verify" : String(form.get("next") || "/admin"));
}

export async function verifyMfa(_: AuthState, form: FormData): Promise<AuthState> {
  const token = await sessionToken();
  if (!token) redirect("/admin/login");
  const ok = await verifyMfaForSession(getDb(), token, String(form.get("code") ?? ""));
  if (!ok) return { error: "That code didn’t work. Use the current 6-digit code from your authenticator app." };
  redirect("/admin");
}

export async function signOut() {
  const staff = await getStaff();
  if (staff) await revokeSession(getDb(), staff.sessionId);
  await clearSessionCookie();
  redirect("/admin/login");
}

export async function requestReset(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const db = getDb();
  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.email, email));
  let link: string | undefined;
  if (user && user.status === "active") {
    const token = await createAuthToken(db, user.id, "password_reset");
    const url = `${baseUrl(await requestMeta())}/admin/reset?token=${token}`;
    const sent = await notifyStaff(db, { key: "staff_password_reset", to: user.email, vars: { name: user.name, link: url }, relatedId: user.id });
    // In test mode no email leaves the app; the link is shown only on local development.
    if (sent.mode === "test" && process.env.NODE_ENV !== "production") link = url;
  }
  return { message: "If that email belongs to a staff account, a reset link is on its way.", link };
}

export async function completeReset(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The passwords don’t match." };
  try {
    await completePasswordToken(getDb(), String(form.get("token") ?? ""), password);
  } catch (e) {
    return { error: e instanceof OpsError ? e.message : "Something went wrong. Request a new link." };
  }
  redirect("/admin/login?reset=1");
}

/** First-run setup: only when no staff exist, and only with ADMIN_SETUP_TOKEN. */
export async function setupOwner(_: AuthState, form: FormData): Promise<AuthState> {
  const db = getDb();
  if ((await staffCount(db)) > 0) return { error: "Setup is already complete. Sign in instead." };
  const expected = process.env.ADMIN_SETUP_TOKEN;
  if (!expected) return { error: "ADMIN_SETUP_TOKEN isn’t set for this deployment. Add it in your environment variables and redeploy." };
  if (!safeEqual(String(form.get("setupToken") ?? ""), expected)) return { error: "That setup token isn’t correct." };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The passwords don’t match." };
  try {
    await ensureDefaultRoles(db);
    await createStaff(db, SYSTEM, { email: String(form.get("email") ?? ""), name: String(form.get("name") ?? ""), roleKey: "owner", password });
  } catch (e) {
    return { error: e instanceof OpsError ? e.message : "Couldn’t create the account." };
  }
  redirect("/admin/login?setup=1");
}
