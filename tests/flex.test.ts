/** Yalla Flex: full by default, spots released by staff, full or half days. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { adjustFlexSpots, earlyBirdByDate, ensureFlexDays, setEarlyBird, setWeeklyVacancies, weeklyVacancies } from "@/lib/ops/flex";
import { listPublicSessions } from "@/lib/ops/public-booking";
import { DEFAULT_WEEKLY } from "@/lib/booking/flex";
import { addDaysISO, todayLA, weekdayOf, zonedDateTime } from "@/lib/time";
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

  it("closes booking at 8:00am, 30 minutes before the 8:30 start, even with a spot open", async () => {
    const { monday, at } = await setup();
    const toddlers = at(monday, 20);
    const st = async (now: Date) => (await listPublicSessions(db(), { from: monday, to: monday, now })).find((x) => x.id === toddlers.id)!.state;
    expect((await st(zonedDateTime(monday, "07:59"))).state).toBe("available");
    expect(await st(zonedDateTime(monday, "08:00"))).toEqual({ state: "closed", reason: "Booking closed" });
  });

  it("creates closure days closed, and says whether camp runs that day", async () => {
    const p = await program({ slug: "yalla-flex", kind: "drop_in", priceCents: 15000, minAgeMonths: 4, maxAgeMonths: 59 });
    const camp = await program({ kind: "camp", priceCents: 16000 });
    const monday = nextMonday();
    const tuesday = addDaysISO(monday, 1);
    await db().insert(s.blackoutDates).values([
      { startsOn: monday, endsOn: monday, programId: p.id, reason: "Labor Day" },
      { startsOn: tuesday, endsOn: tuesday, programId: p.id, reason: "Staff Development Day" },
    ]);
    await db().insert(s.sessions).values({ programId: camp.id, localDate: tuesday, startsAt: zonedDateTime(tuesday, "09:00"), endsAt: zonedDateTime(tuesday, "15:00"), capacity: 10 });
    await ensureFlexDays(db(), { from: monday, days: 7 });
    const list = await listPublicSessions(db(), { from: monday, to: addDaysISO(monday, 2), kinds: ["drop_in"] });
    const mon = list.filter((x) => x.localDate === monday);
    expect(mon).toHaveLength(4);
    expect(mon.every((x) => x.closure === "Labor Day" && !x.campToday && x.state.state === "closed")).toBe(true);
    expect(list.filter((x) => x.localDate === tuesday).every((x) => x.closure === "Staff Development Day" && x.campToday)).toBe(true);
    expect(list.filter((x) => x.localDate === addDaysISO(monday, 2)).every((x) => x.closure === null)).toBe(true);
  });

  it("offers Early Bird only on days staff open seats, for children 12 months and older", async () => {
    const { monday, at } = await setup();
    const toddlers = at(monday, 20);
    await adjustFlexSpots(db(), owner, toddlers.id, 1); // two spots that day
    const pub = async () => (await listPublicSessions(db(), { from: monday, to: monday })).find((x) => x.id === toddlers.id)!;
    expect((await earlyBirdByDate(db(), [monday])).get(monday)).toEqual({ seats: null, booked: 0 });
    expect((await pub()).earlyBirdOpen).toBe(false);

    const { family: f, children } = await family("Early", [{ first: "Ro", birth: addDaysISO(monday, -365 * 2) }, { first: "Su", birth: addDaysISO(monday, -365 * 2 - 40) }]);
    const hold = (childId: string) => createHold(db(), owner, { familyId: f.id, items: [{ sessionId: toddlers.id, childId, addons: ["early"] }], source: "admin", acknowledgePaperwork: true });
    await expect(hold(children[0].id)).rejects.toThrow(/Early Bird isn’t available/);

    await setEarlyBird(db(), owner, monday, "none");
    expect((await earlyBirdByDate(db(), [monday])).get(monday)!.seats).toBe(0);
    await setEarlyBird(db(), owner, monday, "add");
    expect((await pub()).earlyBirdOpen).toBe(true);

    const h = await hold(children[0].id);
    await confirmAdminBooking(db(), owner, h.booking.id, { createInvoice: true, notify: false });
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, h.booking.id));
    const lines = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, inv.id));
    expect(lines.find((l) => /Early Bird/.test(l.description))?.amountCents).toBe(1600);
    // The one seat is taken: the next family can't add it, and staff can't remove the booked seat.
    expect((await pub()).earlyBirdOpen).toBe(false);
    await expect(hold(children[1].id)).rejects.toThrow(/Early Bird isn’t available/);
    await expect(setEarlyBird(db(), owner, monday, "remove")).rejects.toThrow(/already booked/);

    // Under 12 months can't have Early Bird.
    const infants = at(monday, 4);
    await adjustFlexSpots(db(), owner, infants.id, 1);
    await setEarlyBird(db(), owner, monday, "add");
    const { family: g, children: babies } = await family("Baby", [{ first: "Bo", birth: addDaysISO(monday, -240) }]);
    await expect(createHold(db(), owner, { familyId: g.id, items: [{ sessionId: infants.id, childId: babies[0].id, addons: ["early"] }], source: "admin", acknowledgePaperwork: true })).rejects.toThrow(/12 months and older/);
  });
});
