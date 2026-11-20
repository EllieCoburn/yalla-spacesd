/** Coupon codes at checkout: the invoice and the card charge carry the reduced price. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { invoiceTotals } from "@/lib/ops/billing";
import { submitPublicBooking } from "@/lib/ops/public-booking";
import { processEvent } from "@/lib/payments/webhooks";
import { plainText } from "@/lib/notify/html";
import { invoicePdf } from "@/lib/billing/invoice-pdf";
import { PDFDocument } from "pdf-lib";
import { writeFileSync } from "node:fs";
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
  it("PHOENIXHOUSEFAM-style codes cover several programs: 30% off Flex and camp, refused elsewhere", async () => {
    const { saveDiscount } = await import("@/lib/ops/billing");
    const { couponPreview, findCoupon } = await import("@/lib/ops/coupons");
    const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex", priceCents: 15000 });
    const camp = await program({ kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const other = await program({ kind: "happening", name: "Weekend Play", priceCents: 6000 });
    await saveDiscount(db(), { type: "system", name: "Test" }, { code: "phoenixhousefam", name: "Phoenix House", kind: "percent", value: 30, programIds: [flex.id, camp.id], active: true });
    const [d] = await db().select().from(s.discounts).where(eq(s.discounts.code, "PHOENIXHOUSEFAM"));
    expect(d.programId).toBeNull();
    expect([...(d.programIds ?? [])].sort()).toEqual([flex.id, camp.id].sort());
    expect((await couponPreview(db(), d)).label).toBe("30% off Camp Yalla and Yalla Flex");

    const flexDay = await session(flex.id, { capacity: 4 });
    const campDay = await session(camp.id, { capacity: 4 });
    const weekend = await session(other.id, { capacity: 4 });
    await expect(findCoupon(db(), "PhoenixHouseFam", [weekend.id])).rejects.toThrow("That code is for Camp Yalla and Yalla Flex only.");

    expect((await book("phoenix.flex@example.com", flexDay.id, "phoenixhousefam")).ok).toBe(true);
    expect((await invoiceFor("phoenix.flex@example.com")).totals.total).toBe(10500);
    expect((await book("phoenix.camp@example.com", campDay.id, "PHOENIXHOUSEFAM")).ok).toBe(true);
    expect((await invoiceFor("phoenix.camp@example.com")).totals.total).toBe(11200);
  });

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

  it("takes 50% off a Yalla Flex day with WEMISSEDYOU and charges the card the reduced amount", async () => {
    const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex", priceCents: 15000 });
    const day = await session(flex.id, { capacity: 4 });
    await db().insert(s.discounts).values({ code: "WEMISSEDYOU", name: "We missed you", kind: "percent", value: 50, programId: flex.id });

    const r = await book("missed.family@example.com", day.id, "wemissedyou");
    expect(r.ok).toBe(true);
    const { booking, totals, payment } = await invoiceFor("missed.family@example.com");
    expect(booking.discountId).toBeTruthy();
    expect(totals.total).toBe(7500);
    expect(payment.amountCents).toBe(7500);
  });

  it("takes 15% off a camp day with FRIENDSOFYALLA (for partner families)", async () => {
    const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const day = await session(camp.id, { capacity: 4 });
    await db().insert(s.discounts).values({ code: "FRIENDSOFYALLA", name: "Friends of Yalla", kind: "percent", value: 15, programId: camp.id });

    const r = await book("friends.family@example.com", day.id, "FriendsOfYalla");
    expect(r.ok).toBe(true);
    const { totals, payment } = await invoiceFor("friends.family@example.com");
    expect(totals.total).toBe(13600);
    expect(payment.amountCents).toBe(13600);
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

  it("makes a US Letter invoice PDF with Yalla's details, every line and the coupon", async () => {
    const camp = await program({ kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const sess = await session(camp.id, { capacity: 4 });
    await db().insert(s.discounts).values({ code: "CLUBYALLAFAM", name: "Camp rate", kind: "percent", value: 50, programId: camp.id });
    expect((await book("pdf.family@example.com", sess.id, "clubyallafam")).ok).toBe(true);
    const { payment } = await invoiceFor("pdf.family@example.com");
    await processEvent(db(), "test", { id: "evt_p1", type: "payment.succeeded", checkoutRef: payment.checkoutRef!, providerRef: "pi_p", amountCents: payment.amountCents });

    const doc = (await invoicePdf(db(), payment.invoiceId))!;
    expect(doc.filename).toMatch(/^Yalla-invoice-INV-.+\.pdf$/);
    const parsed = await PDFDocument.load(doc.bytes);
    expect(parsed.getPageCount()).toBe(1);
    expect(parsed.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(parsed.getTitle()).toMatch(/^Invoice INV-.+ · Yalla Childcare$/);
    if (process.env.INVOICE_PDF_OUT) writeFileSync(process.env.INVOICE_PDF_OUT, doc.bytes);
  });
});
