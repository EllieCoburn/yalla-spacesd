/** The Camp Yalla first-day welcome: the evening before a new camp family's first camp day. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { sendCampWelcomes } from "@/lib/ops/camp-welcome";
import { familyCampLists } from "@/lib/ops/what-to-bring";
import { sendEveningReminders } from "@/lib/jobs";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const BASE = "https://yalla.test";
// The first camp day is tomorrow; "now" is 6:00pm this evening in San Diego.
const day = () => addDaysISO(todayLA(), 1);
const evening = () => zonedDateTime(todayLA(), "18:00");
const GROUPS = { little: [18, 47], middle: [48, 95], older: [96, 131] } as const;
type G = keyof typeof GROUPS;

async function setup(daysAhead = 1) {
  const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla", priceCents: 16000 });
  const sess = {} as Record<G, typeof s.sessions.$inferSelect>;
  for (const k of Object.keys(GROUPS) as G[]) sess[k] = await session(camp.id, { capacity: 6, minAgeMonths: GROUPS[k][0], maxAgeMonths: GROUPS[k][1] }, daysAhead, "09:00", "15:00");
  const [f] = await db().insert(s.families).values({ name: "Rivera family" }).returning();
  await db().insert(s.guardians).values({ familyId: f.id, firstName: "Jordan", lastName: "Rivera", email: "jordan.rivera@example.com", isPrimary: true, portalAccess: true });
  return { camp, sess, familyId: f.id };
}

async function child(familyId: string, first: string, g: G) {
  const months = Math.round((GROUPS[g][0] + GROUPS[g][1]) / 2);
  const [c] = await db().insert(s.children).values({ familyId, firstName: first, lastName: "Rivera", birthDate: addDaysISO(day(), -Math.round(months * 30.44)) }).returning();
  return c;
}

async function book(familyId: string, items: { sessionId: string; childId: string; addons?: string[] }[]) {
  const hold = await createHold(db(), owner, { familyId, items, source: "admin", acknowledgePaperwork: true });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
  // Booking may already have sent it (after 6pm on the real clock): start each test from "not sent".
  await db().update(s.families).set({ campWelcomeSentAt: null }).where(eq(s.families.id, familyId));
  await db().delete(s.messages).where(eq(s.messages.templateKey, "camp_welcome"));
  return hold.booking;
}

const welcomes = () => db().select().from(s.messages).where(eq(s.messages.templateKey, "camp_welcome"));

async function onlyWelcome() {
  const list = await welcomes();
  expect(list).toHaveLength(1);
  const m = list[0];
  expect(m.body).not.toMatch(/\{\{|\bundefined\b|\bnull\b/);
  expect(m.body).not.toMatch(/teacher|classroom|daycare|school|preschool|front desk/i);
  return m;
}

describe("Camp Yalla first-day welcome email", () => {
  it("sends one warm welcome the evening before, with what to bring, the front door code and kiosk check-in", async () => {
    const { sess, familyId } = await setup();
    const c = await child(familyId, "Ava", "middle");
    await book(familyId, [{ sessionId: sess.middle.id, childId: c.id }]);
    expect((await sendCampWelcomes(db(), { now: evening(), baseUrl: BASE, evening: true })).sent).toBe(1);
    const m = await onlyWelcome();
    expect(m.toAddress).toBe("jordan.rivera@example.com");
    expect(m.subject).toBe("Welcome to Camp Yalla! See you tomorrow");
    expect(m.body).toContain("We’re so glad Ava is joining us at Camp Yalla tomorrow! A member of Team Yalla will be there at drop-off to welcome you and show Ava to the 4 – 7 years group.");
    expect(m.body).toContain("Please plan to pick up Ava at 3:00pm.");
    expect(m.body).toContain("Ava: 4 – 7 years · Drop off at 9:00am · **Pick up at 3:00pm**");
    expect(m.body).toContain("Pack each day: Packed lunch, Water bottle");
    expect(m.body).toContain("Sun and layers: Sunscreen, Sunhat, Light jacket");
    expect(m.body).toContain("Extra clothes: A change of clothes");
    expect(m.body).toContain("Please don’t bring: Toys from home, Electronics");
    expect(m.body).not.toContain("Diaper");
    expect(m.body).not.toContain("Rest time");
    expect(m.body).toContain("Front door code: 2252");
    expect(m.body.match(/door code:/g)).toHaveLength(1);
    expect(m.body).toContain("kiosk in our lobby");
    // Parents don't stay for camp: no Wi-Fi, coworking or private spaces.
    expect(m.body).not.toMatch(/Wi-Fi|Network:|coworking|private office|Reserve a space/i);
    expect(m.body).toContain(`[Add Early Bird or a late stay](${BASE}/portal/extras/${day()})`);
  });

  it("18 months – 3 years adds rest time items and diapers or pull-ups and wipes", async () => {
    const { sess, familyId } = await setup();
    const c = await child(familyId, "Teddy", "little");
    await book(familyId, [{ sessionId: sess.little.id, childId: c.id }]);
    await sendCampWelcomes(db(), { now: evening(), baseUrl: BASE, evening: true });
    const m = await onlyWelcome();
    expect(m.body).toContain("Diapering: Diapers or pull-ups (if needed), Wipes (if needed)");
    expect(m.body).toContain("Rest time: A sheet, A light blanket");
  });

  it("siblings in different groups: one email, a list for each group, Early Bird and late stay times", async () => {
    const { sess, familyId } = await setup();
    const a = await child(familyId, "Ava", "middle");
    const t = await child(familyId, "Teddy", "little");
    await book(familyId, [
      { sessionId: sess.middle.id, childId: a.id, addons: ["early", "late"] },
      { sessionId: sess.little.id, childId: t.id },
    ]);
    await sendCampWelcomes(db(), { now: evening(), baseUrl: BASE, evening: true });
    const m = await onlyWelcome();
    expect(m.body).toContain("show Ava and Teddy to their groups");
    expect(m.body).toContain("Ava: 4 – 7 years · Drop off at 8:00am · **Pick up at 4:30pm**");
    expect(m.body).toContain("Please plan to pick up Ava at 4:30pm and Teddy at 3:00pm.");
    expect(m.body).toContain("### What to bring for Ava · 4 – 7 years");
    expect(m.body).toContain("### What to bring for Teddy · 18 months – 3 years");
  });

  it("is sent once per family, and not to families who have been to camp before", async () => {
    const { sess, familyId } = await setup();
    const c = await child(familyId, "Ava", "middle");
    await book(familyId, [{ sessionId: sess.middle.id, childId: c.id }]);
    await sendCampWelcomes(db(), { now: evening(), baseUrl: BASE, evening: true });
    await sendCampWelcomes(db(), { now: evening(), baseUrl: BASE, evening: true });
    expect(await welcomes()).toHaveLength(1);

    // A family whose earlier camp day was before tomorrow isn't new.
    const camp = (await db().select().from(s.programs).where(eq(s.programs.slug, "camp-yalla")))[0];
    const past = await session(camp.id, { capacity: 6, minAgeMonths: 48, maxAgeMonths: 95 }, -3, "09:00", "15:00");
    const [f2] = await db().insert(s.families).values({ name: "Back family" }).returning();
    await db().insert(s.guardians).values({ familyId: f2.id, firstName: "Lee", lastName: "Back", email: "lee.back@example.com", isPrimary: true, portalAccess: true });
    const [k2] = await db().insert(s.children).values({ familyId: f2.id, firstName: "Kai", lastName: "Back", birthDate: addDaysISO(day(), -Math.round(70 * 30.44)) }).returning();
    await db().insert(s.bookings).values({ familyId: f2.id, reference: "YL-PAST1", status: "confirmed", source: "admin" }).returning().then(async ([b]) => {
      await db().insert(s.bookingItems).values({ bookingId: b.id, sessionId: past.id, childId: k2.id, status: "confirmed", priceCents: 16000 });
    });
    const [b2] = await db().insert(s.bookings).values({ familyId: f2.id, reference: "YL-NEXT1", status: "confirmed", source: "admin" }).returning();
    await db().insert(s.bookingItems).values({ bookingId: b2.id, sessionId: sess.middle.id, childId: k2.id, status: "confirmed", priceCents: 16000 });
    await sendCampWelcomes(db(), { now: evening(), baseUrl: BASE, evening: true });
    expect((await welcomes()).map((m) => m.toAddress)).toEqual(["jordan.rivera@example.com"]);
  });

  it("replaces that evening's reminder for the first camp day; later camp days get the reminder with a what-to-bring link", async () => {
    const { sess, familyId } = await setup();
    const c = await child(familyId, "Ava", "middle");
    await book(familyId, [{ sessionId: sess.middle.id, childId: c.id }]);
    await sendCampWelcomes(db(), { now: evening(), baseUrl: BASE, evening: true });
    expect((await sendEveningReminders(db(), { baseUrl: BASE, now: evening() })).sent).toBe(0);

    // A second camp family who was already welcomed long ago gets the regular reminder.
    const [f2] = await db().insert(s.families).values({ name: "Old family", campWelcomeSentAt: new Date("2026-01-01") }).returning();
    await db().insert(s.guardians).values({ familyId: f2.id, firstName: "Lee", lastName: "Old", email: "lee.old@example.com", isPrimary: true, portalAccess: true });
    const [k2] = await db().insert(s.children).values({ familyId: f2.id, firstName: "Kai", lastName: "Old", birthDate: addDaysISO(day(), -Math.round(70 * 30.44)) }).returning();
    const [b2] = await db().insert(s.bookings).values({ familyId: f2.id, reference: "YL-OLD01", status: "confirmed", source: "admin" }).returning();
    await db().insert(s.bookingItems).values({ bookingId: b2.id, sessionId: sess.middle.id, childId: k2.id, status: "confirmed", priceCents: 16000 });
    expect((await sendEveningReminders(db(), { baseUrl: BASE, now: evening() })).sent).toBe(1);
    const [r] = await db().select().from(s.messages).where(and(eq(s.messages.templateKey, "booking_reminder"), eq(s.messages.toAddress, "lee.old@example.com")));
    expect(r.body).toContain("Packing for camp? [See what to bring]");
  });

  it("the Family Portal lists each camper's group for their next camp day", async () => {
    const { sess, familyId } = await setup(3);
    const a = await child(familyId, "Ava", "middle");
    const t = await child(familyId, "Teddy", "little");
    await book(familyId, [
      { sessionId: sess.middle.id, childId: a.id },
      { sessionId: sess.little.id, childId: t.id },
    ]);
    const lists = await familyCampLists(db(), familyId);
    expect(lists.map((l) => `${l.name}:${l.group}`).sort()).toEqual(["Ava:4 – 7 years", "Teddy:18 months – 3 years"]);
  });
});
