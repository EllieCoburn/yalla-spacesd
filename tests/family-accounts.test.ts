import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { registerFamilyAccount, resolveFamilySession, setFamilyPassword, signInWithPassword } from "@/lib/family-auth";
import { db, family, reset } from "./helpers";

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

describe("Family Portal accounts", () => {
  it("creates the family, guardian, password and children, and signs in", async () => {
    const r = await registerFamilyAccount(db(), account(), base);
    expect("session" in r).toBe(true);
    const g = await resolveFamilySession(db(), (r as { session: string }).session);
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

  it("signs in later with email and password, case-insensitively", async () => {
    await registerFamilyAccount(db(), account(), base);
    const r = await signInWithPassword(db(), { email: " Maya@Example.com ", password: "garden-swing-42", baseUrl: base });
    expect("session" in r).toBe(true);
    await expect(signInWithPassword(db(), { email: "maya@example.com", password: "wrong-password", baseUrl: base })).rejects.toThrow(/don’t match/);
    await expect(signInWithPassword(db(), { email: "nobody@example.com", password: "whatever-123", baseUrl: base })).rejects.toThrow(/don’t match/);
  });

  it("pauses sign-in after repeated wrong passwords", async () => {
    await registerFamilyAccount(db(), account(), base);
    for (let i = 0; i < 8; i++) await signInWithPassword(db(), { email: "maya@example.com", password: `nope-${i}-xxxx`, baseUrl: base }).catch(() => null);
    await expect(signInWithPassword(db(), { email: "maya@example.com", password: "garden-swing-42", baseUrl: base })).rejects.toThrow(/wait 15 minutes/);
  });

  it("won't create a second account for an email with a password", async () => {
    await registerFamilyAccount(db(), account(), base);
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
    const r = await registerFamilyAccount(db(), account(), base);
    const g = (await resolveFamilySession(db(), (r as { session: string }).session))!;
    await setFamilyPassword(db(), g, "new-swing-set-77");
    expect("session" in (await signInWithPassword(db(), { email: "maya@example.com", password: "new-swing-set-77", baseUrl: base }))).toBe(true);
  });
});
