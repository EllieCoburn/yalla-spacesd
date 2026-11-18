/** Coupon codes at checkout: the invoice and the card charge carry the reduced price. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { invoiceTotals } from "@/lib/ops/billing";
import { submitPublicBooking } from "@/lib/ops/public-booking";
import { processEvent } from "@/lib/payments/webhooks";
import { plainText } from "@/lib/notify/html";
import { db, program, reset, session } from "./helpers";

beforeEach(reset);

const book = (email: string, sessionId: string, couponCode?: string) =>
  submitPublicBooking(db(), {
    guardian: { firstName: "Test", lastName: "Coupon", email, phone: "619-555-0100" },
    children: [{ key: "a", firstName: "Kid", lastName: "Coupon", birthDate: "2022-02-01", allergies: "", medications: "" }],
    lines: [{ sessionId, childKeys: ["a"] }],
    signatures: [],
    meta: {},
    baseUrl: "http://test",
    couponCode,
  });

async function invoiceFor(email: string) {
  const [g] = await db().select().from(s.guardians).where(eq(s.guardians.email, email));
  const [b] = await db().select().from(s.bookings).where(eq(s.bookings.familyId, g.familyId));
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, b.id));
  const [pay] = await db().select().from(s.payments).where(eq(s.payments.invoiceId, inv.id));
  return { booking: b, totals: (await invoiceTotals(db(), [inv.id])).get(inv.id)!, payment: pay };
}

describe("Coupon codes", () => {
  it("takes 50% off camp with CLUBYALLAFAM, in any letter case, and charges the card the reduced amount", async () => {
    const camp = await program({ kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const sess = await session(camp.id, { capacity: 4 });
    await db().insert(s.discounts).values({ code: "CLUBYALLAFAM", name: "Club Yalla family camp rate", kind: "percent", value: 50, programId: camp.id });

    const r = await book("coupon.family@example.com", sess.id, " clubyallafam ");
    expect(r.ok).toBe(true);
    const { booking, totals, payment } = await invoiceFor("coupon.family@example.com");
    expect(booking.discountId).toBeTruthy();
    expect(totals.total).toBe(8000);
    expect(payment.amountCents).toBe(8000);
  });

  it("refuses an unknown code, or a code for another program, without booking anything", async () => {
    const camp = await program({ kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const flex = await program({ name: "Yalla Flex" });
    const flexDay = await session(flex.id, { capacity: 4 });
    await db().insert(s.discounts).values({ code: "CLUBYALLAFAM", name: "Camp rate", kind: "percent", value: 50, programId: camp.id });

    const bad = await book("bad.code@example.com", flexDay.id, "NOPE");
    expect(bad).toMatchObject({ ok: false, code: "coupon" });
    const wrong = await book("wrong.program@example.com", flexDay.id, "clubyallafam");
    expect(wrong).toMatchObject({ ok: false, code: "coupon", error: expect.stringMatching(/Camp Yalla only/) });
    expect(await db().select().from(s.bookings)).toHaveLength(0);

    // Without a code the price is unchanged.
    expect((await book("no.code@example.com", flexDay.id)).ok).toBe(true);
    expect((await invoiceFor("no.code@example.com")).totals.total).toBe(15000);
  });

  it("emails an itemized, personal receipt with the coupon broken out and a link to book more", async () => {
    const camp = await program({ kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const sess = await session(camp.id, { capacity: 4 });
    await db().insert(s.discounts).values({ code: "CLUBYALLAFAM", name: "Camp rate", kind: "percent", value: 50, programId: camp.id });
    expect((await book("receipt.family@example.com", sess.id, "clubyallafam")).ok).toBe(true);
    const { payment } = await invoiceFor("receipt.family@example.com");
    await processEvent(db(), "test", { id: "evt_r1", type: "payment.succeeded", checkoutRef: payment.checkoutRef!, providerRef: "pi_r", amountCents: payment.amountCents });

    const [m] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "payment_receipt"));
    expect(m.subject).toMatch(/^Your Yalla receipt: Camp Yalla · /);
    expect(m.body).toMatch(/^Hi Test,/);
    expect(m.body).toContain("We’ve received your payment of $80.00 for Camp Yalla");
    expect(m.body).toMatch(/\$\$ Camp Yalla · .* · Kid \| \$160\.00/);
    expect(m.body).toContain("$$= Subtotal | $160.00");
    expect(m.body).toContain("$$- Coupon CLUBYALLAFAM (50% off) | −$80.00");
    expect(m.body).toContain("$$= Total | $80.00");
    expect(m.body).toContain("$$- Paid by card | −$80.00");
    expect(m.body).toContain("$$= Remaining balance | $0.00");
    expect(m.body).toContain("Need to book additional offerings?");
    expect(m.body).toMatch(/https?:\/\/\S+\/book\n/);
    // The text version reads cleanly.
    expect(plainText(m.body)).toContain("Coupon CLUBYALLAFAM (50% off) · −$80.00");
    expect(plainText(m.body)).toContain("Total: $80.00");
  });
});
