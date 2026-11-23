/** The enrollment calendar's revenue: captured after discounts, open spots at their lowest and full rates. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { submitPublicBooking } from "@/lib/ops/public-booking";
import { processEvent } from "@/lib/payments/webhooks";
import { calendarSessions } from "@/lib/admin/queries/calendar";
import { db, program, reset, session } from "./helpers";

beforeEach(reset);

const book = (email: string, sessionId: string, couponCode?: string) =>
  submitPublicBooking(db(), {
    guardian: { firstName: "Test", lastName: "Revenue", email, phone: "619-555-0100" },
    children: [{ key: "a", firstName: "Kid", lastName: "Revenue", birthDate: "2022-02-01", allergies: "", medications: "" }],
    lines: [{ sessionId, childKeys: ["a"] }],
    signatures: [],
    meta: {},
    baseUrl: "http://test",
    couponCode,
  });

async function pay(email: string, n: number) {
  const [g] = await db().select().from(s.guardians).where(eq(s.guardians.email, email));
  const [b] = await db().select().from(s.bookings).where(eq(s.bookings.familyId, g.familyId));
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, b.id));
  const [p] = await db().select().from(s.payments).where(eq(s.payments.invoiceId, inv.id));
  await processEvent(db(), "test", { id: `evt_rev${n}`, type: "payment.succeeded", checkoutRef: p.checkoutRef!, providerRef: `pi_rev${n}`, amountCents: p.amountCents });
}

describe("Calendar revenue", () => {
  it("a $160 camp day booked at 50% off counts as $80 captured; open spots at full price", async () => {
    const camp = await program({ kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const sess = await session(camp.id, { capacity: 4, priceCents: 16000 });
    await db().insert(s.discounts).values({ code: "HALFOFF", name: "Half off", kind: "percent", value: 50, programId: camp.id });
    expect((await book("rev1@example.com", sess.id, "halfoff")).ok).toBe(true);
    await pay("rev1@example.com", 1);
    expect((await book("rev2@example.com", sess.id)).ok).toBe(true);
    await pay("rev2@example.com", 2);

    const [row] = await calendarSessions(db(), sess.localDate, sess.localDate, "camp", { money: true });
    expect(row.money).toMatchObject({ capturedCents: 8000 + 16000, unpaidCents: 0, openSpots: 2, spotMinCents: 16000, spotMaxCents: 16000 });
    // If fully booked: captured + 2 open spots at $160 = $560, not 4 × $160 = $640.
    expect(row.money!.capturedCents + row.money!.openSpots * row.money!.spotMaxCents).toBe(56000);
    // No revenue unless asked for.
    const [plain] = await calendarSessions(db(), sess.localDate, sess.localDate, "camp");
    expect(plain.money).toBeUndefined();
  });

  it("a Yalla Flex open spot ranges from the half-day to the full-day rate", async () => {
    const flex = await program({ slug: "yalla-flex", name: "Yalla Flex", kind: "drop_in", priceCents: 15000 });
    await session(flex.id, { capacity: 3, minAgeMonths: 20, maxAgeMonths: 35, title: "Yalla Flex · 20 – 35 months" });
    const [row] = await calendarSessions(db(), "2000-01-01", "2100-01-01", "flex", { money: true });
    expect(row.money).toMatchObject({ capturedCents: 0, openSpots: 3, spotMinCents: 7500, spotMaxCents: 15000 });
  });
});
