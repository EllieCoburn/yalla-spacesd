import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { familyRateTotal } from "@/lib/booking/family-rate";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { createSeries, monthWeekOf } from "@/lib/ops/schedule";
import { addDaysISO, todayLA, weekdayOf } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

describe("After Hours family rate", () => {
  it("charges per child for one child and caps siblings at the family rate", () => {
    expect(familyRateTotal([6500])).toBe(6500);
    expect(familyRateTotal([6500, 6500])).toBe(8500);
    expect(familyRateTotal([6500, 6500, 6500])).toBe(8500);
    expect(familyRateTotal([6500, 6500, 6500, 6500])).toBe(11000);
    expect(familyRateTotal([6500, 6500, 6500, 6500, 6500])).toBe(13500);
  });

  it("applies across the evening's age groups on the invoice", async () => {
    const p = await program({ kind: "parents_night", priceCents: 6500, minAgeMonths: 18, maxAgeMonths: 131 });
    const young = await session(p.id, { minAgeMonths: 18, maxAgeMonths: 47, capacity: 8 }, 10, "17:00", "21:00");
    const older = await session(p.id, { minAgeMonths: 84, maxAgeMonths: 131, capacity: 10, localDate: young.localDate }, 10, "17:00", "21:00");
    const birthYoung = addDaysISO(todayLA(), -365 * 3);
    const birthOld = addDaysISO(todayLA(), -365 * 8);
    const { family: f, children } = await family("Night", [
      { first: "Ada", birth: birthYoung },
      { first: "Bo", birth: birthOld },
    ]);
    const hold = await createHold(db(), owner, {
      familyId: f.id,
      items: [
        { sessionId: young.id, childId: children[0].id },
        { sessionId: older.id, childId: children[1].id },
      ],
      source: "admin",
      acknowledgePaperwork: true,
    });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: true, notify: false });
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
    const lines = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, inv.id));
    expect(lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(8500);
    expect(lines.find((l) => l.kind === "discount")?.description).toMatch(/Family rate/);
  });
});

describe("After Hours age groups", () => {
  it("uses the session's age group rather than the program's range", async () => {
    const p = await program({ kind: "parents_night", priceCents: 6500, minAgeMonths: 18, maxAgeMonths: 131 });
    const older = await session(p.id, { minAgeMonths: 84, maxAgeMonths: 131, capacity: 10 }, 10, "17:00", "21:00");
    const { family: f, children } = await family("Small", [{ first: "Cy", birth: addDaysISO(todayLA(), -365 * 3) }]);
    await expect(createHold(db(), owner, { familyId: f.id, items: [{ sessionId: older.id, childId: children[0].id }], source: "public" })).rejects.toThrow(/age range/);
  });
});

describe("Monthly schedules", () => {
  it("creates sessions only on the second Friday of each month", async () => {
    const p = await program({ kind: "parents_night" });
    const start = todayLA();
    const r = await createSeries(db(), owner, { programId: p.id, weekdays: [5], monthWeek: 2, startTime: "17:00", endTime: "21:00", startsOn: start, endsOn: addDaysISO(start, 364), capacity: 8 });
    const rows = await db().select().from(s.sessions).where(eq(s.sessions.seriesId, r.series.id));
    expect(rows.length).toBeGreaterThanOrEqual(11);
    for (const row of rows) {
      expect(weekdayOf(row.localDate)).toBe(5);
      expect(Number(row.localDate.slice(8, 10))).toBeGreaterThanOrEqual(8);
      expect(Number(row.localDate.slice(8, 10))).toBeLessThanOrEqual(14);
    }
  });

  it("knows the last weekday of a month", () => {
    expect(monthWeekOf("2026-10-30", true)).toBe(5);
    expect(monthWeekOf("2026-10-23", true)).toBe(4);
    expect(monthWeekOf("2026-11-13", false)).toBe(2);
  });
});

describe("Camp Yalla extras", () => {
  it("charges Early Bird and late stay per child and ignores extras the program doesn't offer", async () => {
    const p = await program({ kind: "camp", priceCents: 16000, minAgeMonths: 18, maxAgeMonths: 131 });
    const day = await session(p.id, { minAgeMonths: 48, maxAgeMonths: 83, capacity: 8 }, 12, "09:00", "15:00");
    const { family: f, children } = await family("Camp", [{ first: "Dee", birth: addDaysISO(todayLA(), -365 * 5) }]);
    const hold = await createHold(db(), owner, {
      familyId: f.id,
      items: [{ sessionId: day.id, childId: children[0].id, addons: ["early", "late", "pony"] }],
      source: "admin",
      acknowledgePaperwork: true,
    });
    expect(hold.items[0].addons).toEqual(["early", "late"]);
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: true, notify: false });
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
    const lines = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, inv.id));
    expect(lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(16000 + 2000 + 3000);
    expect(lines.map((l) => l.description).join(" ")).toMatch(/Early Bird.*Late stay|Late stay.*Early Bird/);
  });
});
