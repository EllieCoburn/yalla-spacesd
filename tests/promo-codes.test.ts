/** Promo codes at checkout: CLUBYALLAFAM takes 50% off Camp Yalla sessions (after the sibling discount). */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { checkPromo } from "@/lib/ops/public-booking";
import { promoSavings } from "@/lib/booking/promo";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

async function clubCode(overrides: Partial<typeof s.discounts.$inferInsert> = {}) {
  const [d] = await db()
    .insert(s.discounts)
    .values({ code: "CLUBYALLAFAM", name: "Club Yalla family", kind: "percent", value: 50, programKind: "camp", ...overrides })
    .returning();
  return d;
}

async function invoiceLinesFor(familyId: string, items: { sessionId: string; childId: string }[], discountId: string) {
  const hold = await createHold(db(), owner, { familyId, items, source: "admin", acknowledgePaperwork: true });
  await db().update(s.bookings).set({ discountId }).where(eq(s.bookings.id, hold.booking.id));
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: true, notify: false });
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
  return db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, inv.id));
}

const total = (lines: { amountCents: number }[]) => lines.reduce((sum, l) => sum + l.amountCents, 0);

describe("Promo codes", () => {
  it("takes 50% off camp, after the sibling discount", async () => {
    const d = await clubCode();
    const p = await program({ kind: "camp", priceCents: 16000, minAgeMonths: 18, maxAgeMonths: 131 });
    const day = await session(p.id, { capacity: 8, minAgeMonths: 18, maxAgeMonths: 131 }, 10, "09:00", "15:00");
    const { family: f, children } = await family("Camp", [
      { first: "Ada", birth: addDaysISO(todayLA(), -365 * 4) },
      { first: "Bo", birth: addDaysISO(todayLA(), -365 * 6) },
    ]);
    const lines = await invoiceLinesFor(
      f.id,
      children.map((c) => ({ sessionId: day.id, childId: c.id })),
      d.id,
    );
    // 160 + (160 − 16 sibling) = 304, then half off = 152.
    expect(lines.filter((l) => l.description.startsWith("Promo CLUBYALLAFAM"))).toHaveLength(2);
    expect(total(lines)).toBe(15200);
  });

  it("is accepted in any case for camp, and refused for other programs", async () => {
    await clubCode();
    const camp = await program({ kind: "camp", priceCents: 16000 });
    const dropIn = await program({ kind: "drop_in", priceCents: 15000 });
    const c = await session(camp.id, { capacity: 8 }, 10);
    const o = await session(dropIn.id, { capacity: 8 }, 10);
    expect((await checkPromo(db(), " clubyallafam ", [c.id])).code).toBe("CLUBYALLAFAM");
    await expect(checkPromo(db(), "clubyallafam", [o.id])).rejects.toThrow(/Camp Yalla/);
    await expect(checkPromo(db(), "NOPE", [c.id])).rejects.toThrow(/isn’t valid/);
  });

  it("doesn't discount non-camp sessions in a mixed booking", async () => {
    const d = await clubCode();
    const camp = await program({ kind: "camp", priceCents: 16000 });
    const dropIn = await program({ kind: "drop_in", priceCents: 15000 });
    const c = await session(camp.id, { capacity: 8 }, 10);
    const o = await session(dropIn.id, { capacity: 8 }, 12);
    const { family: f, children } = await family("Mixed", [{ first: "Cy", birth: addDaysISO(todayLA(), -365 * 4) }]);
    const lines = await invoiceLinesFor(
      f.id,
      [
        { sessionId: c.id, childId: children[0].id },
        { sessionId: o.id, childId: children[0].id },
      ],
      d.id,
    );
    expect(total(lines)).toBe(8000 + 15000);
  });

  it("respects inactive, end dates and max uses", async () => {
    const camp = await program({ kind: "camp", priceCents: 16000 });
    const c = await session(camp.id, { capacity: 8 }, 10);
    const d = await clubCode({ endsOn: addDaysISO(todayLA(), -1) });
    await expect(checkPromo(db(), "CLUBYALLAFAM", [c.id])).rejects.toThrow(/expired/);
    await db().update(s.discounts).set({ endsOn: null, active: false }).where(eq(s.discounts.id, d.id));
    await expect(checkPromo(db(), "CLUBYALLAFAM", [c.id])).rejects.toThrow(/isn’t valid/);
    await db().update(s.discounts).set({ active: true, maxUses: 1 }).where(eq(s.discounts.id, d.id));
    const { family: f, children } = await family("Used", [{ first: "Di", birth: addDaysISO(todayLA(), -365 * 4) }]);
    await invoiceLinesFor(f.id, [{ sessionId: c.id, childId: children[0].id }], d.id);
    await expect(checkPromo(db(), "CLUBYALLAFAM", [c.id])).rejects.toThrow(/fully used/);
  });

  it("caps a fixed code at what the matching sessions cost", () => {
    expect(promoSavings({ kind: "fixed", value: 5000 }, [3000, 3000])).toEqual([3000, 2000]);
    expect(promoSavings({ kind: "percent", value: 50 }, [16000, 14400])).toEqual([8000, 7200]);
  });
});
