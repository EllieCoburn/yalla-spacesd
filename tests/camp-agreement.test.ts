/** Camp Yalla admission agreement: signed at checkout for the camp days in each purchase. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { paperworkStatus } from "@/lib/ops/forms";
import { agreementsForBooking, previewAgreements, signForBooking, submitPublicBooking, type PublicBookingInput } from "@/lib/ops/public-booking";
import { createHold, startCheckout } from "@/lib/ops/bookings";
import { db, program, reset, session } from "./helpers";

beforeEach(reset);

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const ANSWERS = { "init-rates": PNG, "init-legal": PNG, "init-handbook": PNG, "read-understood": "yes", signature: PNG };

/** Runs the real migration, so the tests check what families will sign. */
async function setup() {
  const p = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla", priceCents: 16000, minAgeMonths: 18, maxAgeMonths: 131, waitlistEnabled: true });
  for (const file of ["0045_camp_admission_agreement.sql", "0046_camp_agreement_v2.sql"]) {
    const text = readFileSync(`lib/db/migrations/${file}`, "utf8");
    for (const stmt of text.split("--> statement-breakpoint")) {
      const body = stmt.replace(/^--.*$/gm, "").trim();
      if (body) await db().execute(sql.raw(body));
    }
  }
  const day1 = await session(p.id, { capacity: 8, minAgeMonths: 48, maxAgeMonths: 95, title: "Camp Yalla · 4 – 7 years" }, 9, "09:00", "15:00");
  const day2 = await session(p.id, { capacity: 8, minAgeMonths: 48, maxAgeMonths: 95, title: "Camp Yalla · 4 – 7 years" }, 10, "09:00", "15:00");
  return { p, day1, day2 };
}

const input = (sessionIds: string[], over: Partial<PublicBookingInput> = {}): PublicBookingInput => ({
  guardian: { firstName: "Robin", lastName: "Camp", email: "robin.camp@example.com" },
  children: [{ key: "a", firstName: "Pip", lastName: "Camp", birthDate: "2021-03-01" }],
  lines: sessionIds.map((sessionId) => ({ sessionId, childKeys: ["a"] })),
  signatures: [],
  meta: {},
  baseUrl: "http://test",
  ...over,
});
const signed = { templateId: "camp-agreement", childKey: "a", signatureText: "Robin Camp", consent: true, answers: ANSWERS };

describe("Camp Yalla admission agreement", () => {
  it("is asked for at checkout, with the approved text, and one signature covers several days", async () => {
    const { day1, day2 } = await setup();
    const list = await previewAgreements(db(), { sessionIds: [day1.id, day2.id], children: [{ key: "a", firstName: "Pip", birthDate: "2021-03-01" }] });
    expect(list.map((a) => [a.templateId, a.perBooking])).toEqual([["camp-agreement", true]]);
    const text = JSON.stringify(list[0].fields);
    expect(text).toContain("§1596.792(l)");
    expect(text).toContain("San Diego Unified School District");
    expect(text).toContain("one guide for every six children (1:6)");
    expect(text).toContain("supervised water play");
    expect(text).toContain("14. Photographs");
    expect(text).toContain("16. Food, belongings and personal care");
    expect(list[0].version).toBe(2);
    for (const banned of ["classroom", "immuniz", "Title 22", "Flex", "Club Yalla", "November 11"]) expect(text.includes(banned), banned).toBe(false);

    const unsigned = await submitPublicBooking(db(), input([day1.id, day2.id]));
    expect(unsigned.ok).toBe(false);
    if (!unsigned.ok) expect(unsigned.code).toBe("agreements");

    // One signature for both days; it reaches payment (which re-checks the agreement against the booking).
    const ok = await submitPublicBooking(db(), input([day1.id, day2.id], { signatures: [signed] }));
    expect(ok.ok).toBe(true);
    const [b] = await db().select().from(s.bookings);
    const subs = await db().select().from(s.formSubmissions).where(eq(s.formSubmissions.templateId, "camp-agreement"));
    expect(subs).toHaveLength(1);
    expect(subs[0].bookingId).toBe(b.id);
    expect(subs[0].status).toBe("signed");

    // The signed copy is in the Family Portal, exactly as signed, with working links.
    const { familySignedCopies, signedCopy } = await import("@/lib/ops/forms");
    const [g] = await db().select().from(s.guardians);
    const me = { familyId: g.familyId, guardianId: g.id, canViewSensitive: true };
    const copies = await familySignedCopies(db(), me);
    expect(copies.map((c) => [c.title, c.bookingReference])).toEqual([["Camp Yalla Admission Agreement", b.reference]]);
    const copy = (await signedCopy(db(), me, copies[0].id))!;
    expect(copy.version).toBe(2);
    expect(JSON.stringify(copy.fields)).toContain("[Illness Policy](/portal/illness-policy)");
    expect(copy.answers.signature).toMatch(/^data:image\/png/);
    // Nobody outside the family can open it.
    expect(await signedCopy(db(), { familyId: "someone-else", guardianId: "x", canViewSensitive: true }, copies[0].id)).toBeNull();
  });

  it("is signed again on the next purchase, and the first purchase keeps its signature", async () => {
    const { day1, day2 } = await setup();
    expect((await submitPublicBooking(db(), input([day1.id], { signatures: [signed] }))).ok).toBe(true);
    const [g] = await db().select().from(s.guardians);
    const [child] = await db().select().from(s.children);
    const signedIn = { sessionId: "x", guardianId: g.id, familyId: g.familyId, familyName: "", firstName: g.firstName, lastName: g.lastName, email: g.email, canBook: true, canViewBilling: true, canViewSensitive: true, emailVerified: true, hasPassword: false };
    const kid = [{ key: child.id, existingId: child.id, firstName: child.firstName, lastName: child.lastName, birthDate: child.birthDate }];
    const again = await previewAgreements(db(), { familyId: g.familyId, sessionIds: [day2.id], children: kid });
    expect(again.map((a) => a.templateId)).toEqual(["camp-agreement"]);
    const second = await submitPublicBooking(db(), input([day2.id], { signedIn, children: kid, lines: [{ sessionId: day2.id, childKeys: [child.id] }], signatures: [{ ...signed, childKey: child.id }] }));
    expect(second.ok).toBe(true);
    const subs = await db().select().from(s.formSubmissions).where(and(eq(s.formSubmissions.templateId, "camp-agreement"), eq(s.formSubmissions.status, "signed")));
    expect(subs).toHaveLength(2);
    expect(new Set(subs.map((x) => x.bookingId)).size).toBe(2);
    // Outside a booking it's never shown as an outstanding form in the Family Portal.
    const status = await paperworkStatus(db(), { familyId: g.familyId, childIds: [child.id] });
    expect([...status.values()].flat().some((i) => i.templateId === "camp-agreement")).toBe(false);
  });

  it("a waitlist offer is signed on the offer page, then goes to payment", async () => {
    const { day1 } = await setup();
    const [f] = await db().insert(s.families).values({ name: "Offer family" }).returning();
    await db().insert(s.guardians).values({ familyId: f.id, firstName: "Ola", lastName: "Offer", email: "ola@example.com", isPrimary: true, canViewBilling: true });
    const [c] = await db().insert(s.children).values({ familyId: f.id, firstName: "Ivy", lastName: "Offer", birthDate: "2021-05-01" }).returning();
    const hold = await createHold(db(), { type: "system", name: "Waitlist offer" }, { familyId: f.id, items: [{ sessionId: day1.id, childId: c.id }], source: "waitlist", acknowledgePaperwork: true });
    await expect(startCheckout(db(), { type: "system", name: "t" }, hold.booking.id, { base: "http://test" })).rejects.toThrow(/Camp Yalla Admission Agreement/);
    const needed = await agreementsForBooking(db(), hold.booking.id);
    expect(needed.map((a) => [a.templateId, a.childName])).toEqual([["camp-agreement", "Ivy"]]);
    await signForBooking(db(), { type: "system", name: "Waitlist offer" }, { bookingId: hold.booking.id, signatures: [{ templateId: "camp-agreement", childId: c.id, signatureText: "Ola Offer", consent: true, answers: ANSWERS }] });
    expect(await agreementsForBooking(db(), hold.booking.id)).toHaveLength(0);
    const checkout = await startCheckout(db(), { type: "system", name: "t" }, hold.booking.id, { base: "http://test" });
    expect(checkout.url).toContain("/pay/test/");
  });
});
