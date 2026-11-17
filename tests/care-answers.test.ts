/** Every sign-up asks about each child's known allergies and medications before payment. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { careNeededForBooking, saveBookingCare, submitPublicBooking, type PublicBookingInput } from "@/lib/ops/public-booking";
import { createHold } from "@/lib/ops/bookings";
import { startGuestSignup } from "@/lib/playpass/membership";
import { careSentence } from "@/lib/ops/team-notices";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const input = (sessionId: string, child: Partial<PublicBookingInput["children"][number]> = {}, over: Partial<PublicBookingInput> = {}): PublicBookingInput => ({
  guardian: { firstName: "Robin", lastName: "Care", email: "robin.care@example.com", phone: "619-555-0100" },
  children: [{ key: "a", firstName: "Pip", lastName: "Care", birthDate: "2023-02-01", ...child }],
  lines: [{ sessionId, childKeys: ["a"] }],
  signatures: [],
  meta: {},
  baseUrl: "http://test",
  ...over,
});

describe("Allergies and medications before payment", () => {
  it("won't go to payment until both are answered, and leaves nothing behind", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 4 });
    for (const child of [{}, { allergies: "" }, { medications: "" }, { allergies: null, medications: "" }]) {
      const r = await submitPublicBooking(db(), input(sess.id, child));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("care");
        expect(r.error).toMatch(/allergies .*medications/);
      }
    }
    expect(await db().select().from(s.families)).toHaveLength(0);
    expect(await db().select().from(s.bookings)).toHaveLength(0);
  });

  it("saves 'none known' and the details families give", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 4 });
    expect((await submitPublicBooking(db(), input(sess.id, { allergies: "", medications: "" }))).ok).toBe(true);
    let [c] = await db().select().from(s.children);
    expect([c.allergies, c.medicalNotes]).toEqual(["", ""]);
    expect(careSentence(c)).toBe("Pip has no known allergies and takes no known medication.");

    // A signed-in family confirming or updating what's on file.
    const [g] = await db().select().from(s.guardians);
    await db().update(s.guardians).set({ portalAccess: true }).where(eq(s.guardians.id, g.id));
    const signedIn = { sessionId: "x", guardianId: g.id, familyId: g.familyId, familyName: "", firstName: g.firstName, lastName: g.lastName, email: g.email, phone: g.phone, canBook: true, canViewBilling: true, canViewSensitive: true, emailVerified: true, hasPassword: true };
    const sess2 = await session(p.id, { capacity: 4 }, 9);
    const r = await submitPublicBooking(
      db(),
      input(sess2.id, {}, { signedIn, children: [{ key: c.id, existingId: c.id, firstName: c.firstName, lastName: c.lastName, birthDate: c.birthDate, allergies: "Peanuts (hives)", medications: "Inhaler as needed" }], lines: [{ sessionId: sess2.id, childKeys: [c.id] }] }),
    );
    expect(r.ok).toBe(true);
    [c] = await db().select().from(s.children);
    expect([c.allergies, c.medicalNotes]).toEqual(["Peanuts (hives)", "Inhaler as needed"]);
  });

  it("a waitlist offer asks for them before payment when we don't have them", async () => {
    const p = await program({ waitlistEnabled: true });
    const sess = await session(p.id, { capacity: 4 });
    const f = await family("Wait");
    const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: sess.id, childId: f.children[0].id }], source: "waitlist", acknowledgePaperwork: true });
    expect((await careNeededForBooking(db(), hold.booking.id)).map((x) => x.childId)).toEqual([f.children[0].id]);
    await expect(saveBookingCare(db(), hold.booking.id, [{ childId: f.children[0].id, allergies: "", medications: null }])).rejects.toThrow(/allergies/);
    await saveBookingCare(db(), hold.booking.id, [{ childId: f.children[0].id, allergies: "", medications: "Daily vitamin" }]);
    expect(await careNeededForBooking(db(), hold.booking.id)).toEqual([]);
    const [c] = await db().select().from(s.children).where(eq(s.children.id, f.children[0].id));
    expect([c.allergies, c.medicalNotes]).toEqual(["", "Daily vitamin"]);
  });

  it("the Play Pass sign-up asks for them too", async () => {
    const guest = (child: object) => ({
      tier: "explorer",
      acceptTerms: true,
      baseUrl: "http://test",
      guardian: { firstName: "Lu", lastName: "Pass", email: "lu.pass@example.com", phone: "619-555-0100" },
      children: [{ firstName: "Mo", lastName: "Pass", birthDate: "2021-09-09", ...child }],
    });
    await expect(startGuestSignup(db(), guest({}))).rejects.toThrow(/allergies .*medications/);
    expect(await db().select().from(s.children)).toHaveLength(0);
  });
});
