/** The printable day roster PDF: every child booked that day, with parents, phones, allergies and medications. */
import { beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { dayRosterGroups, dayRosterPdf } from "@/lib/ops/roster-pdf";
import { addDaysISO, todayLA } from "@/lib/time";
import { DEFAULT_ROLES } from "@/lib/auth/permissions";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const GROUPS = { little: [18, 47], middle: [48, 95], older: [96, 131] } as const;
const day = () => addDaysISO(todayLA(), 2);

async function family(last: string, parents: { first: string; phone: string | null; primary?: boolean }[], kids: { first: string; months: number; allergies?: string; meds?: string; preferred?: string }[]) {
  const [f] = await db().insert(s.families).values({ name: `${last} family` }).returning();
  for (const p of parents)
    await db().insert(s.guardians).values({ familyId: f.id, firstName: p.first, lastName: last, email: `${p.first.toLowerCase()}.${last.toLowerCase()}@example.com`, phone: p.phone, isPrimary: !!p.primary, portalAccess: true });
  const out = [];
  for (const k of kids) {
    const [c] = await db()
      .insert(s.children)
      .values({ familyId: f.id, firstName: k.first, lastName: last, preferredName: k.preferred ?? null, birthDate: addDaysISO(day(), -Math.round(k.months * 30.44)), allergies: k.allergies ?? null, medicalNotes: k.meds ?? null })
      .returning();
    out.push(c);
  }
  return { familyId: f.id, kids: out };
}

async function book(familyId: string, items: { sessionId: string; childId: string }[]) {
  const hold = await createHold(db(), owner, { familyId, items, source: "admin", acknowledgePaperwork: true });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
}

async function campDay() {
  const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla", priceCents: 16000 });
  const sess: Record<string, typeof s.sessions.$inferSelect> = {};
  for (const [k, [min, max]] of Object.entries(GROUPS)) sess[k] = await session(camp.id, { capacity: 8, minAgeMonths: min, maxAgeMonths: max }, 2, "09:00", "15:00");
  const rivera = await family("Rivera", [{ first: "Jordan", phone: "619-555-0101", primary: true }, { first: "Sam", phone: "619-555-0102" }], [
    { first: "Ava", months: 60, allergies: "Peanuts and tree nuts (EpiPen in backpack)", meds: "EpiPen Jr." },
    { first: "Teddy", months: 30, allergies: "none", preferred: "Ted" },
  ]);
  const chen = await family("Chen", [{ first: "Lee", phone: "619-555-0199", primary: true }], [{ first: "Mia", months: 110, meds: "Inhaler as needed" }]);
  await book(rivera.familyId, [
    { sessionId: sess.middle.id, childId: rivera.kids[0].id },
    { sessionId: sess.little.id, childId: rivera.kids[1].id },
  ]);
  await book(chen.familyId, [{ sessionId: sess.older.id, childId: chen.kids[0].id }]);
  return { camp, sess, rivera, chen };
}

const staffPerms = DEFAULT_ROLES.find((r) => r.key === "owner")!.permissions;

describe("Day roster PDF", () => {
  it("lists every camp group for the day with parents, phones, allergies and medications", async () => {
    await campDay();
    const { program: name, groups } = await dayRosterGroups(db(), day(), { perms: staffPerms });
    expect(name).toBe("Camp Yalla");
    expect(groups.map((g) => g.title)).toEqual(["Camp Yalla · 18 months – 3 years", "Camp Yalla · 4 – 7 years", "Camp Yalla · 8 – 10 years"]);
    const [little, middle, older] = groups;
    expect(little.rows[0]).toMatchObject({ name: "Teddy Rivera", preferredName: "Ted", birthDate: addDaysISO(day(), -Math.round(30 * 30.44)), allergies: null, medications: null });
    expect(little.rows[0].parents).toEqual([
      { name: "Jordan Rivera", phone: "619-555-0101" },
      { name: "Sam Rivera", phone: "619-555-0102" },
    ]);
    expect(middle.rows[0]).toMatchObject({ name: "Ava Rivera", allergies: "Peanuts and tree nuts (EpiPen in backpack)", medications: "EpiPen Jr." });
    expect(older.rows[0]).toMatchObject({ name: "Mia Chen", allergies: null, medications: "Inhaler as needed", parents: [{ name: "Lee Chen", phone: "619-555-0199" }] });

    const doc = await dayRosterPdf(db(), day(), { perms: staffPerms, printedBy: "Test Owner" });
    expect(doc.children).toBe(3);
    expect(doc.filename).toBe(`yalla-camp-yalla-roster-${day()}.pdf`);
    const parsed = await PDFDocument.load(doc.bytes);
    expect(parsed.getPageCount()).toBe(1);
    expect(parsed.getPage(0).getSize()).toEqual({ width: 792, height: 612 });
    if (process.env.ROSTER_PDF_OUT) writeFileSync(process.env.ROSTER_PDF_OUT, doc.bytes);
  });

  it("leaves out cancelled and absent children, and can print one session", async () => {
    const { sess, rivera } = await campDay();
    const { eq, and } = await import("drizzle-orm");
    await db().update(s.bookingItems).set({ attendance: "absent" }).where(and(eq(s.bookingItems.sessionId, sess.middle.id), eq(s.bookingItems.childId, rivera.kids[0].id)));
    const { groups } = await dayRosterGroups(db(), day(), { perms: staffPerms });
    expect(groups.map((g) => g.title)).toEqual(["Camp Yalla · 18 months – 3 years", "Camp Yalla · 8 – 10 years"]);
    const one = await dayRosterGroups(db(), day(), { perms: staffPerms, sessionId: sess.older.id });
    expect(one.groups.map((g) => g.rows.map((r) => r.name))).toEqual([["Mia Chen"]]);
  });

  it("runs onto more pages for a big day, every page numbered", async () => {
    const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const big = await session(camp.id, { capacity: 40, minAgeMonths: 48, maxAgeMonths: 95 }, 2, "09:00", "15:00");
    for (let i = 0; i < 30; i++) {
      const f = await family(`Fam${i}`, [{ first: "Pat", phone: "619-555-0000", primary: true }, { first: "Kim", phone: "619-555-0001" }], [{ first: `Kid${i}`, months: 60, allergies: i % 3 ? undefined : "Dairy: no milk, cheese or yogurt. Can have oat milk." }]);
      await book(f.familyId, [{ sessionId: big.id, childId: f.kids[0].id }]);
    }
    const doc = await dayRosterPdf(db(), day(), { perms: staffPerms, printedBy: "Test Owner" });
    expect(doc.children).toBe(30);
    expect((await PDFDocument.load(doc.bytes)).getPageCount()).toBeGreaterThan(1);
    if (process.env.ROSTER_PDF_OUT) writeFileSync(process.env.ROSTER_PDF_OUT.replace(".pdf", "-big.pdf"), doc.bytes);
  });
});
