/** The evening-of-first-Flex-day thank-you, with the once-per-family BACKTOPLAY10 code. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { findCoupon } from "@/lib/ops/coupons";
import { sendFlexThankYous } from "@/lib/ops/flex-thank-you";
import { setPolicy } from "@/lib/ops/settings";
import { emailHtml, plainText } from "@/lib/notify/html";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

// The first Flex day is tomorrow; the evening run happens at 6pm that day in San Diego.
const day = () => addDaysISO(todayLA(), 1);
const evening = () => zonedDateTime(day(), "18:00");
const BASE = "https://yalla.test";

async function setup() {
  const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
  const first = await session(flex.id, { capacity: 4, minAgeMonths: 36, maxAgeMonths: 59 }, 1);
  const later = await session(flex.id, { capacity: 4, minAgeMonths: 36, maxAgeMonths: 59 }, 8);
  await db().insert(s.discounts).values({ code: "BACKTOPLAY10", name: "Back to play", kind: "percent", value: 10, programId: flex.id, oncePerFamily: true });
  const [f] = await db().insert(s.families).values({ name: "Rivera family" }).returning();
  await db().insert(s.guardians).values({ familyId: f.id, firstName: "Jordan", lastName: "Rivera", email: "jordan.rivera@example.com", isPrimary: true, portalAccess: true });
  const [c] = await db().insert(s.children).values({ familyId: f.id, firstName: "Ava", lastName: "Rivera", birthDate: addDaysISO(day(), -Math.round(48 * 30.44)) }).returning();
  return { flex, first, later, familyId: f.id, child: c };
}

async function book(familyId: string, items: { sessionId: string; childId: string }[], discountId?: string) {
  const hold = await createHold(db(), owner, { familyId, items, source: "admin", acknowledgePaperwork: true });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
  if (discountId) await db().update(s.bookings).set({ discountId }).where(eq(s.bookings.id, hold.booking.id));
  return hold.booking;
}

const thankYous = () => db().select().from(s.messages).where(eq(s.messages.templateKey, "flex_thank_you"));

describe("Yalla Flex first-day thank-you", () => {
  it("goes out once, on the evening of the first Flex day, personal and with the code", async () => {
    const { first, later, familyId, child } = await setup();
    await book(familyId, [{ sessionId: first.id, childId: child.id }]);
    await book(familyId, [{ sessionId: later.id, childId: child.id }]);

    expect((await sendFlexThankYous(db(), { baseUrl: BASE, now: evening() })).sent).toBe(1);
    // Running again, or on their second Flex day, sends nothing more.
    expect((await sendFlexThankYous(db(), { baseUrl: BASE, now: evening() })).sent).toBe(0);
    expect((await sendFlexThankYous(db(), { baseUrl: BASE, now: zonedDateTime(later.localDate, "18:00") })).sent).toBe(0);

    const [m] = await thankYous();
    expect(await thankYous()).toHaveLength(1);
    expect(m.subject).toBe("Thank you for spending the day with us");
    expect(m.body).toMatch(/^Hi Jordan,/);
    expect(m.body).toContain("It was lovely getting to know Ava");
    expect(m.body).toContain("10% off your next Yalla Flex session");
    expect(m.body).toContain(`%% BACKTOPLAY10 | ${BASE}/coupon/BACKTOPLAY10`);
    expect(m.body).toContain(`${BASE}/programs/yalla-flex?coupon=BACKTOPLAY10#dates`);
    expect(m.body).not.toMatch(/\{\{/);
    // The code stands apart in the email, with a Copy code button; the text version spells it out.
    const html = emailHtml({ key: "flex_thank_you", subject: m.subject!, body: m.body, audience: "family" });
    expect(html).toContain("BACKTOPLAY10</p>");
    expect(html).toContain(">Copy code</a>");
    expect(html).toContain(">Book your next Flex day</a>");
    expect(plainText(m.body)).toContain("Your code: BACKTOPLAY10");
  });

  it("isn't sent to families who came before, if the child was absent, or while the code is off", async () => {
    const a = await setup();
    // A family whose first Flex day was earlier.
    const past = await session(a.flex.id, { capacity: 4, minAgeMonths: 36, maxAgeMonths: 59 }, -3);
    const [pb] = await db().insert(s.bookings).values({ familyId: a.familyId, reference: "YL-PASTFX", status: "confirmed", source: "admin" }).returning();
    await db().insert(s.bookingItems).values({ bookingId: pb.id, sessionId: past.id, childId: a.child.id, status: "confirmed" });
    await book(a.familyId, [{ sessionId: a.first.id, childId: a.child.id }]);
    expect((await sendFlexThankYous(db(), { baseUrl: BASE, now: evening() })).sent).toBe(0);

    // A new family whose child was marked absent.
    const [f] = await db().insert(s.families).values({ name: "Chen family" }).returning();
    await db().insert(s.guardians).values({ familyId: f.id, firstName: "Lee", lastName: "Chen", email: "lee.chen@example.com", isPrimary: true, portalAccess: true });
    const [c] = await db().insert(s.children).values({ familyId: f.id, firstName: "Mo", lastName: "Chen", birthDate: addDaysISO(day(), -Math.round(48 * 30.44)) }).returning();
    await book(f.id, [{ sessionId: a.first.id, childId: c.id }]);
    await db().insert(s.attendanceRecords).values({ sessionId: a.first.id, childId: c.id, status: "absent" });
    expect((await sendFlexThankYous(db(), { baseUrl: BASE, now: evening() })).sent).toBe(0);
    await db().delete(s.attendanceRecords);

    // The code turned off in Billing → Discounts, or the email turned off in Settings.
    await db().update(s.discounts).set({ active: false });
    expect((await sendFlexThankYous(db(), { baseUrl: BASE, now: evening() })).sent).toBe(0);
    await db().update(s.discounts).set({ active: true });
    await setPolicy(db(), owner, "notifications.flexThankYou", false);
    expect((await sendFlexThankYous(db(), { baseUrl: BASE, now: evening() })).sent).toBe(0);
    await setPolicy(db(), owner, "notifications.flexThankYou", true);
    expect((await sendFlexThankYous(db(), { baseUrl: BASE, now: evening() })).sent).toBe(1);
  });

  it("BACKTOPLAY10 works once per family, for Yalla Flex only", async () => {
    const { first, later, familyId, child } = await setup();
    const [d] = await db().select().from(s.discounts).where(eq(s.discounts.code, "BACKTOPLAY10"));
    await expect(findCoupon(db(), "backtoplay10", [later.id], { familyId })).resolves.toMatchObject({ code: "BACKTOPLAY10" });
    await book(familyId, [{ sessionId: first.id, childId: child.id }], d.id);
    await expect(findCoupon(db(), "BACKTOPLAY10", [later.id], { familyId })).rejects.toThrow(/already used/);
    const camp = await program({ kind: "camp", name: "Camp Yalla" });
    const campDay = await session(camp.id, { capacity: 4 });
    await expect(findCoupon(db(), "BACKTOPLAY10", [campDay.id])).rejects.toThrow(/Yalla Flex only/);
  });
});
