/** Yalla Flex: full by default, spots released by staff, full or half days. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { adjustFlexSpots, ensureFlexDays, setWeeklyVacancies, weeklyVacancies } from "@/lib/ops/flex";
import { listPublicSessions } from "@/lib/ops/public-booking";
import { DEFAULT_WEEKLY } from "@/lib/booking/flex";
import { addDaysISO, todayLA, weekdayOf } from "@/lib/time";
import { db, family, owner, program, reset } from "./helpers";

beforeEach(reset);

/** The next Monday at least a week away (beyond the program's notice period). */
const nextMonday = () => {
  let d = addDaysISO(todayLA(), 8);
  while (weekdayOf(d) !== 1) d = addDaysISO(d, 1);
  return d;
};

async function setup() {
  const p = await program({ slug: "yalla-flex", kind: "drop_in", priceCents: 15000, showRemaining: false, waitlistEnabled: false, lowAvailabilityThreshold: 0, minAgeMonths: 4, maxAgeMonths: 59 });
  const monday = nextMonday();
  await ensureFlexDays(db(), { from: monday, days: 7 });
  const rows = await db().select().from(s.sessions).where(eq(s.sessions.programId, p.id));
  const at = (date: string, minAge: number) => rows.find((r) => r.localDate === date && r.minAgeMonths === minAge)!;
  return { p, monday, rows, at };
}

describe("Yalla Flex", () => {
  it("creates four age groups each weekday, full unless a weekly vacancy is set", async () => {
    const { rows, monday, at } = await setup();
    expect(rows).toHaveLength(5 * 4);
    expect(await weeklyVacancies(db())).toEqual(DEFAULT_WEEKLY);
    // 20 – 35 months has one spot Monday to Thursday; everything else is full.
    expect(at(monday, 20).capacity).toBe(1);
    expect(at(addDaysISO(monday, 3), 20).capacity).toBe(1);
    expect(at(addDaysISO(monday, 4), 20).capacity).toBe(0);
    expect(at(monday, 4).capacity).toBe(0);
    expect(at(monday, 36).title).toBe("Yalla Flex · 3 – 4 years");

    const list = await listPublicSessions(db(), { from: monday, to: monday });
    const st = (min: number) => list.find((x) => x.id === at(monday, min).id)!;
    expect(st(20).state).toEqual({ state: "available", remaining: null });
    expect(st(4).state).toMatchObject({ state: "full", waitlist: false });
    expect(st(20).halfPriceCents).toBe(7500);
    expect(st(4).priceCents).toBe(18000);
  });

  it("lets staff release and take back single-day spots, never below what's booked", async () => {
    const { monday, at } = await setup();
    const infants = at(monday, 4);
    expect((await adjustFlexSpots(db(), owner, infants.id, 1)).capacity).toBe(1);
    const { family: f, children } = await family("Flex", [{ first: "Ivy", birth: addDaysISO(monday, -240) }]);
    const hold = await createHold(db(), owner, { familyId: f.id, items: [{ sessionId: infants.id, childId: children[0].id }], source: "admin", acknowledgePaperwork: true });
    expect(hold.booking.id).toBeTruthy();
    await expect(adjustFlexSpots(db(), owner, infants.id, -1)).rejects.toThrow(/already booked/);
  });

  it("weekly changes shift upcoming days and keep single-day releases", async () => {
    const { monday, at } = await setup();
    await adjustFlexSpots(db(), owner, at(addDaysISO(monday, 1), 12).id, 1); // Tuesday, one-off
    await setWeeklyVacancies(db(), owner, { ...DEFAULT_WEEKLY, saplings: [0, 2, 0, 0, 0], sprouts: [0, 1, 1, 1, 0] });
    const cap = async (date: string, min: number) => (await db().select().from(s.sessions).where(and(eq(s.sessions.localDate, date), eq(s.sessions.minAgeMonths, min))))[0].capacity;
    expect(await cap(addDaysISO(monday, 1), 12)).toBe(3);
    expect(await cap(monday, 20)).toBe(0);
    expect(await cap(addDaysISO(monday, 1), 20)).toBe(1);
  });

  it("charges the half-day rate for a half day, with no extra line on the invoice", async () => {
    const { monday, at } = await setup();
    const toddlers = at(monday, 20);
    const { family: f, children } = await family("Half", [{ first: "Mo", birth: addDaysISO(monday, -365 * 2) }]);
    const hold = await createHold(db(), owner, { familyId: f.id, items: [{ sessionId: toddlers.id, childId: children[0].id, addons: ["half"] }], source: "admin", acknowledgePaperwork: true });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: true, notify: false });
    const [item] = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, hold.booking.id));
    expect(item.priceCents).toBe(7500);
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
    const lines = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, inv.id));
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toMatch(/half day.*8:30am–12:00pm/i);
    expect(lines[0].amountCents).toBe(7500);
  });
});
