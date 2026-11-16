/**
 * Security controls from the readiness review: two-step verification for staff, and no working
 * sign-in or reset links kept in the message log.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { totp } from "@/lib/auth/crypto";
import { beginMfaSetup, confirmMfaSetup, createAuthToken, createStaff, login, resetStaffMfa, resolveSession, staffReady, verifyMfaForSession } from "@/lib/auth/staff";
import { notifyStaff, redactSecrets } from "@/lib/notify";
import { requestMagicLink } from "@/lib/family-auth";
import { db, family, owner, reset } from "./helpers";

beforeEach(reset);

const PW = "a-long-test-password-1";

/** A staff member with two-step verification set up, and a fresh (not yet verified) sign-in. */
async function enrolled(email = "mfa@example.com") {
  const u = await createStaff(db(), owner, { email, name: "Mfa Person", roleKey: "owner", password: PW });
  const first = await login(db(), email, PW);
  if (first.status !== "ok") throw new Error("login");
  const ctx = (await resolveSession(db(), first.token))!;
  const secret = await beginMfaSetup(db(), u.id);
  await confirmMfaSetup(db(), ctx, totp(secret, Date.now() - 30_000)); // an earlier step, so "now" is still unused
  const r = await login(db(), email, PW);
  if (r.status !== "ok") throw new Error("login");
  return { u, secret, token: r.token };
}

describe("Staff two-step verification", () => {
  it("is required: a password alone never gives a ready session", async () => {
    await createStaff(db(), owner, { email: "new@example.com", name: "New", roleKey: "owner", password: PW });
    const r = await login(db(), "new@example.com", PW);
    if (r.status !== "ok") throw new Error("login");
    const st = await resolveSession(db(), r.token);
    expect(st!.mfaEnabled).toBe(false);
    expect(staffReady(st)).toBe(false);
  });

  it("locks the account after five wrong codes, ending the session", async () => {
    const { u, secret, token } = await enrolled();
    const good = totp(secret);
    const results: string[] = [];
    for (let i = 0; i < 5; i++) results.push(await verifyMfaForSession(db(), token, String((Number(good) + 7 + i) % 1_000_000).padStart(6, "0")));
    expect(results.slice(0, 4).every((r) => r === "invalid")).toBe(true);
    expect(results[4]).toBe("locked");
    // Even the right code is refused while locked, and the session was ended.
    expect(await verifyMfaForSession(db(), token, good)).not.toBe("ok");
    const [row] = await db().select().from(s.staffUsers).where(eq(s.staffUsers.id, u.id));
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await login(db(), "mfa@example.com", PW)).toMatchObject({ status: "locked" });
  });

  it("won't accept the same code twice", async () => {
    const { secret, token } = await enrolled();
    const code = totp(secret);
    expect(await verifyMfaForSession(db(), token, code)).toBe("ok");
    const again = await login(db(), "mfa@example.com", PW);
    if (again.status !== "ok") throw new Error("login");
    expect(await verifyMfaForSession(db(), again.token, code)).toBe("invalid");
  });

  it("keeps the current authenticator working until a new one is confirmed", async () => {
    const { u, secret, token } = await enrolled();
    await beginMfaSetup(db(), u.id); // started, never finished
    const [row] = await db().select().from(s.staffUsers).where(eq(s.staffUsers.id, u.id));
    expect(row.mfaEnabled).toBe(true);
    expect(await verifyMfaForSession(db(), token, totp(secret))).toBe("ok");
  });

  it("can be reset by an administrator (lost phone), which signs the person out", async () => {
    const { u, secret, token } = await enrolled();
    expect(await verifyMfaForSession(db(), token, totp(secret))).toBe("ok");
    await resetStaffMfa(db(), owner, u.id);
    expect(await resolveSession(db(), token)).toBeNull();
    const [row] = await db().select().from(s.staffUsers).where(eq(s.staffUsers.id, u.id));
    expect(row.mfaEnabled).toBe(false);
    expect(row.mfaSecretEnc).toBeNull();
  });
});

describe("Message log", () => {
  it("never keeps working reset or sign-in links", async () => {
    const u = await createStaff(db(), owner, { email: "victim@example.com", name: "Victim", roleKey: "owner", password: PW });
    const token = await createAuthToken(db(), u.id, "password_reset");
    await notifyStaff(db(), { key: "staff_password_reset", to: u.email, vars: { name: u.name, link: `https://yalla.test/admin/reset?token=${token}` }, relatedId: u.id });
    const f = await family("Alpha");
    await db().update(s.guardians).set({ portalAccess: true }).where(eq(s.guardians.id, f.guardian.id));
    await requestMagicLink(db(), f.guardian.email, "https://yalla.test");
    const rows = await db().select().from(s.messages);
    expect(rows.length).toBe(2);
    for (const m of rows) {
      expect(m.body).not.toMatch(/token=/);
      expect(m.body).toContain("[private link removed]");
    }
    expect(rows.find((m) => m.toAddress === "victim@example.com")!.body).not.toContain(token);
  });

  it("redacts only links that carry a secret", () => {
    expect(redactSecrets("Visit https://yalla.test/portal/home today")).toBe("Visit https://yalla.test/portal/home today");
    expect(redactSecrets("Sign in: https://yalla.test/portal/verify?token=abc&next=%2Fbook")).toBe("Sign in: [private link removed]");
    expect(redactSecrets("Status: https://yalla.test/book/confirmation/YL-1?k=abc")).toBe("Status: [private link removed]");
  });
});
