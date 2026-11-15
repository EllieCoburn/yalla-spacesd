/** Sibling discount: each additional child at the same program on the same day, across age groups. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { setPolicy } from "@/lib/ops/settings";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

async function invoiceLinesFor(familyId: string, items: { sessionId: string; childId: string }[]) {
  const hold = await createHold(db(), owner, { familyId, items, source: "admin", acknowledgePaperwork: true });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: true, notify: false });
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
  return db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, inv.id));
}

describe("Sibling discount", () => {
  it("takes 10% off the second child at camp, even in a different age group", async () => {
    const p = await program({ kind: "camp", priceCents: 16000, minAgeMonths: 18, maxAgeMonths: 131 });
    const young = await session(p.id, { minAgeMonths: 18, maxAgeMonths: 47, capacity: 8 }, 10, "09:00", "15:00");
    const middle = await session(p.id, { minAgeMonths: 48, maxAgeMonths: 83, capacity: 8, localDate: young.localDate }, 10, "09:00", "15:00");
    const { family: f, children } = await family("Camp", [
      { first: "Ada", birth: addDaysISO(todayLA(), -365 * 3) },
      { first: "Bo", birth: addDaysISO(todayLA(), -365 * 5) },
    ]);
    const lines = await invoiceLinesFor(f.id, [
      { sessionId: young.id, childId: children[0].id },
      { sessionId: middle.id, childId: children[1].id },
    ]);
    const discounts = lines.filter((l) => l.kind === "discount");
    expect(discounts).toHaveLength(1);
    expect(discounts[0].description).toMatch(/Sibling discount \(10%\)/);
    expect(lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(16000 + 16000 - 1600);
  });

  it("doesn't discount one child on different days, and can be switched off", async () => {
    const p = await program({ kind: "camp", priceCents: 16000 });
    const day1 = await session(p.id, { capacity: 8 }, 10);
    const day2 = await session(p.id, { capacity: 8 }, 12);
    const { family: f, children } = await family("Solo", [{ first: "Cy", birth: addDaysISO(todayLA(), -365 * 4) }]);
    const solo = await invoiceLinesFor(f.id, [
      { sessionId: day1.id, childId: children[0].id },
      { sessionId: day2.id, childId: children[0].id },
    ]);
    expect(solo.some((l) => l.kind === "discount")).toBe(false);

    await setPolicy(db(), owner, "billing.siblingDiscountPercent", 0);
    const day3 = await session(p.id, { capacity: 8 }, 14);
    const { family: g, children: kids } = await family("Off", [
      { first: "Di", birth: addDaysISO(todayLA(), -365 * 4) },
      { first: "Ed", birth: addDaysISO(todayLA(), -365 * 6) },
    ]);
    const off = await invoiceLinesFor(g.id, [
      { sessionId: day3.id, childId: kids[0].id },
      { sessionId: day3.id, childId: kids[1].id },
    ]);
    expect(off.some((l) => l.kind === "discount")).toBe(false);
  });
});

describe("Camp availability wording", () => {
  it("shows a group as almost full at 5 or fewer places, without revealing a count", async () => {
    const { listPublicSessions } = await import("@/lib/ops/public-booking");
    const p = await program({ kind: "camp", priceCents: 16000, lowAvailabilityThreshold: 5, showRemaining: false });
    const roomy = await session(p.id, { capacity: 16 }, 10);
    const tight = await session(p.id, { capacity: 5, localDate: roomy.localDate }, 10);
    const list = await listPublicSessions(db(), { from: roomy.localDate, to: roomy.localDate });
    const st = (id: string) => list.find((s) => s.id === id)?.state;
    expect(st(roomy.id)).toEqual({ state: "available", remaining: null });
    expect(st(tight.id)).toEqual({ state: "limited", remaining: 0, showCount: false });
  });
});
