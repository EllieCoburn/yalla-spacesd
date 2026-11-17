/** Adding coworking upgrades and extras to a day already booked, and the evening-before reminder. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { applyPaidExtras, daysWithCare, extrasForDay, startExtrasCheckout } from "@/lib/ops/booking-extras";
import { processEvent } from "@/lib/payments/webhooks";
import { sendEveningReminders } from "@/lib/jobs";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

async function familyWith(kids: { first: string; months: number }[]) {
  const [f] = await db().insert(s.families).values({ name: "Extras family" }).returning();
  await db().insert(s.guardians).values({ familyId: f.id, firstName: "Kai", lastName: "Extra", email: "kai.extra@example.com", isPrimary: true, portalAccess: true });
  const list = [];
  for (const k of kids) list.push((await db().insert(s.children).values({ familyId: f.id, firstName: k.first, lastName: "Extra", birthDate: addDaysISO(todayLA(), -Math.round(k.months * 30.44)) }).returning())[0]);
  return { familyId: f.id, kids: list };
}

async function book(familyId: string, items: { sessionId: string; childId: string; addons?: string[] }[]) {
  const hold = await createHold(db(), owner, { familyId, items, source: "admin", acknowledgePaperwork: true });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
  return hold.booking;
}

async function pay(invoiceId: string) {
  const [p] = await db().select().from(s.payments).where(eq(s.payments.invoiceId, invoiceId));
  await processEvent(db(), "test", { id: "evt_" + p.id, type: "payment.succeeded", checkoutRef: p.checkoutRef!, providerRef: "pi_x", amountCents: p.amountCents });
}

describe("Adding extras to a booked day", () => {
  it("offers a second grown-up on a Flex day, charges $25 once for the family, and adds it once paid", async () => {
    const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
    const day = await session(flex.id, { capacity: 4, minAgeMonths: 36, maxAgeMonths: 59 }, 2);
    const { familyId, kids } = await familyWith([{ first: "Ada", months: 48 }, { first: "Bo", months: 50 }]);
    await book(familyId, kids.map((k) => ({ sessionId: day.id, childId: k.id })));

    expect(await daysWithCare(db(), familyId)).toEqual([day.localDate]);
    const [d] = await extrasForDay(db(), familyId, day.localDate);
    expect(d.family.map((f) => [f.offer.key, f.added])).toEqual([["adult", false]]);
    // Flex Early Bird (limited seats) and day length aren't offered after booking.
    expect(d.children.flatMap((c) => c.offers.map((o) => o.key))).toEqual([]);

    const items = await db().select().from(s.bookingItems);
    // Picking it for both children still charges once.
    const { invoice, url } = await startExtrasCheckout(db(), owner, { familyId, date: day.localDate, picks: items.map((i) => ({ itemId: i.id, key: "adult" })), baseUrl: "http://test" });
    expect(url).toContain("/pay/test/");
    const lines = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, invoice.id));
    expect(lines.map((l) => l.unitCents)).toEqual([2500]);

    // Not added until paid.
    expect((await db().select().from(s.bookingItems)).some((i) => i.addons.includes("adult"))).toBe(false);
    await pay(invoice.id);
    const after = await db().select().from(s.bookingItems);
    expect(after.filter((i) => i.addons.includes("adult"))).toHaveLength(1);
    const [again] = await extrasForDay(db(), familyId, day.localDate);
    expect(again.family[0].added).toBe(true);
    // Running it twice changes nothing.
    expect(await applyPaidExtras(db(), invoice.id)).toBe(0);
  });

  it("offers camp Early Bird and late stay per child, and nothing for days already over", async () => {
    const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla" });
    const day = await session(camp.id, { capacity: 8 }, 3, "09:00", "15:00");
    const past = await session(camp.id, { capacity: 8 }, -2, "09:00", "15:00");
    const { familyId, kids } = await familyWith([{ first: "Cy", months: 70 }]);
    await book(familyId, [{ sessionId: day.id, childId: kids[0].id }]);
    const [b] = await db().insert(s.bookings).values({ familyId, reference: "YL-PASTX", status: "confirmed", source: "admin" }).returning();
    await db().insert(s.bookingItems).values({ bookingId: b.id, sessionId: past.id, childId: kids[0].id, status: "confirmed" });

    const [d] = await extrasForDay(db(), familyId, day.localDate);
    expect(d.children[0].offers.map((o) => [o.key, o.priceCents])).toEqual([
      ["early", 2000],
      ["late", 3000],
    ]);
    expect(await extrasForDay(db(), familyId, past.localDate)).toEqual([]);
    await expect(startExtrasCheckout(db(), owner, { familyId, date: past.localDate, picks: [{ itemId: "x", key: "late" }], baseUrl: "http://test" })).rejects.toThrow(/Choose at least one/);
  });
});

describe("Evening-before reminder", () => {
  it("goes out once per booking for tomorrow's sessions, with private space and extras links", async () => {
    const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
    const tomorrow = await session(flex.id, { capacity: 4, minAgeMonths: 36, maxAgeMonths: 59 }, 1);
    const later = await session(flex.id, { capacity: 4, minAgeMonths: 36, maxAgeMonths: 59 }, 5);
    const { familyId, kids } = await familyWith([{ first: "Ada", months: 48 }]);
    await book(familyId, [{ sessionId: tomorrow.id, childId: kids[0].id }]);
    await book(familyId, [{ sessionId: later.id, childId: kids[0].id }]);

    const evening = zonedDateTime(todayLA(), "18:00");
    expect((await sendEveningReminders(db(), { baseUrl: "https://yalla.test", now: evening })).sent).toBe(1);
    expect((await sendEveningReminders(db(), { baseUrl: "https://yalla.test", now: evening })).sent).toBe(0);
    const [m] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "booking_reminder"));
    expect(m.subject).toMatch(/^See you tomorrow: Yalla Flex/);
    expect(m.body).toContain("Need a private space?");
    expect(m.body).toContain(`[See what’s available](https://yalla.test/portal/spaces?date=${tomorrow.localDate})`);
    expect(m.body).toContain(`[Add them in your Family Portal](https://yalla.test/portal/extras/${tomorrow.localDate})`);
    expect(m.body).not.toMatch(/\{\{/);
  });
});
