import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { completeFamilySignup, registerFamilyAccount, resolveFamilySession, setFamilyPassword, signInWithPassword } from "@/lib/family-auth";
import { setPolicy } from "@/lib/ops/settings";
import { db, family, owner, reset } from "./helpers";

beforeEach(reset);

const base = "http://test";
const account = (over: Partial<Parameters<typeof registerFamilyAccount>[1]> = {}) => ({
  firstName: "Maya",
  lastName: "Rivera",
  email: "maya@example.com",
  password: "garden-swing-42",
  children: [
    { firstName: "Leo", birthDate: "2022-03-14" },
    { firstName: "Ana", birthDate: "2024-07-02" },
  ],
  ...over,
});

/** Sign up and confirm the email with the link we send (in test mode the link comes back directly). */
async function signUp(input = account()) {
  const r = await registerFamilyAccount(db(), input, base);
  const token = new URL(r.devLink!).searchParams.get("signup")!;
  const done = await completeFamilySignup(db(), token, base);
  if (!done) throw new Error("signup not completed");
  return done;
}

describe("Family Portal accounts", () => {
  it("creates nothing until the email is confirmed, and the link works once", async () => {
    const r = await registerFamilyAccount(db(), account(), base);
    expect(r.confirm).toBe(true);
    expect(await db().select().from(s.families)).toHaveLength(0);
    expect(await db().select().from(s.children)).toHaveLength(0);
    const [msg] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "family_confirm_email"));
    expect(msg.toAddress).toBe("maya@example.com");
    expect(msg.body).not.toContain("signup="); // the stored copy has no working link
    const token = new URL(r.devLink!).searchParams.get("signup")!;
    expect(await completeFamilySignup(db(), token, base)).not.toBeNull();
    expect(await completeFamilySignup(db(), token, base)).toBeNull();
    expect(await db().select().from(s.familySignups)).toHaveLength(0);
  });

  it("creates the family, guardian, password and children, and signs in", async () => {
    const r = await signUp();
    const g = await resolveFamilySession(db(), r.session);
    expect(g?.firstName).toBe("Maya");
    const kids = await db().select().from(s.children).where(eq(s.children.familyId, g!.familyId));
    expect(kids.map((k) => [k.firstName, k.lastName, k.birthDate]).sort()).toEqual([
      ["Ana", "Rivera", "2024-07-02"],
      ["Leo", "Rivera", "2022-03-14"],
    ]);
    const [row] = await db().select().from(s.guardians).where(eq(s.guardians.id, g!.guardianId));
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(row.passwordHash).not.toContain("garden-swing-42");
  });

  it("sends the family a welcome email and tells the team who joined", async () => {
    await setPolicy(db(), owner, "notifications.staffEmails", "hello@yalla.test");
    await signUp();
    const sent = await db().select().from(s.messages);
    const welcome = sent.find((m) => m.templateKey === "family_welcome");
    expect(welcome?.toAddress).toBe("maya@example.com");
    expect(welcome?.subject).toBe("Welcome to Yalla, Maya!");
    expect(welcome?.body).toContain("http://test/portal/home");
    const notice = sent.find((m) => m.templateKey === "staff_family_joined");
    expect(notice?.toAddress).toBe("hello@yalla.test");
    expect(notice?.subject).toBe("The Rivera family has joined the Yalla portal");
    expect(notice?.body).toContain("Child 1: Leo, born Mar 14, 2022");
    expect(notice?.body).toMatch(/http:\/\/test\/admin\/families\/[\w-]+/);
  });

  it("signs in later with email and password, case-insensitively", async () => {
    await signUp();
    const r = await signInWithPassword(db(), { email: " Maya@Example.com ", password: "garden-swing-42", baseUrl: base });
    expect("session" in r).toBe(true);
    await expect(signInWithPassword(db(), { email: "maya@example.com", password: "wrong-password", baseUrl: base })).rejects.toThrow(/don’t match/);
    await expect(signInWithPassword(db(), { email: "nobody@example.com", password: "whatever-123", baseUrl: base })).rejects.toThrow(/don’t match/);
  });

  it("pauses sign-in after repeated wrong passwords", async () => {
    await signUp();
    for (let i = 0; i < 8; i++) await signInWithPassword(db(), { email: "maya@example.com", password: `nope-${i}-xxxx`, baseUrl: base }).catch(() => null);
    await expect(signInWithPassword(db(), { email: "maya@example.com", password: "garden-swing-42", baseUrl: base })).rejects.toThrow(/wait 15 minutes/);
  });

  it("won't create a second account for an email with a password", async () => {
    await signUp();
    await expect(registerFamilyAccount(db(), account({ firstName: "Someone" }), base)).rejects.toThrow(/already an account/);
  });

  it("an email Yalla already has (from a booking) gets a link instead of a new account", async () => {
    const f = await family("Booked");
    const r = await registerFamilyAccount(db(), account({ email: f.guardian.email }), base);
    expect("emailed" in r).toBe(true);
    const families = await db().select().from(s.families);
    expect(families).toHaveLength(1); // nothing new created
    // Signing in without a password set also emails a link.
    const r2 = await signInWithPassword(db(), { email: f.guardian.email, password: "anything-123", baseUrl: base });
    expect("emailed" in r2).toBe(true);
  });

  it("checks the details before creating anything", async () => {
    await expect(registerFamilyAccount(db(), account({ password: "short" }), base)).rejects.toThrow(/8 characters/);
    await expect(registerFamilyAccount(db(), account({ password: "password1" }), base)).rejects.toThrow(/less common/);
    await expect(registerFamilyAccount(db(), account({ email: "not-an-email" }), base)).rejects.toThrow(/valid email/);
    await expect(registerFamilyAccount(db(), account({ children: [{ firstName: "Kid", birthDate: "" }] }), base)).rejects.toThrow(/date of birth/);
    await expect(registerFamilyAccount(db(), account({ children: [{ firstName: "Kid", birthDate: "2999-01-01" }] }), base)).rejects.toThrow(/future/);
    expect(await db().select().from(s.families)).toHaveLength(0);
  });

  it("a signed-in guardian can set a password", async () => {
    const r = await signUp();
    const g = (await resolveFamilySession(db(), r.session))!;
    await setFamilyPassword(db(), g, "new-swing-set-77");
    expect("session" in (await signInWithPassword(db(), { email: "maya@example.com", password: "new-swing-set-77", baseUrl: base }))).toBe(true);
  });
});
