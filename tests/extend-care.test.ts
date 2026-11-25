/** Staff extending a child's day after the family asks, on the booking's own invoice, with discounts. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { checkIn, checkOut } from "@/lib/ops/attendance";
import { createHold, startCheckout } from "@/lib/ops/bookings";
import { invoiceTotals } from "@/lib/ops/billing";
import { applyCouponToBooking, extendCare, extensionOptions } from "@/lib/ops/extend-care";
import { invoicePdf } from "@/lib/billing/invoice-pdf";
import { processEvent } from "@/lib/payments/webhooks";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

/** A paid booking; optionally with a coupon used at checkout. */
async function paidBooking(kind: "camp" | "drop_in", opts: { coupon?: string; addons?: string[] } = {}) {
  const p = await program({ kind, slug: kind === "camp" ? `camp-yalla-${Math.random().toString(36).slice(2, 6)}` : `flex-${Math.random().toString(36).slice(2, 6)}`, name: kind === "camp" ? "Camp Yalla" : "Yalla Flex", priceCents: 16000 });
  const sess = await session(p.id, kind === "drop_in" ? { minAgeMonths: 36, maxAgeMonths: 59, capacity: 6 } : { capacity: 6 }, 3, kind === "camp" ? "09:00" : "08:30", kind === "camp" ? "15:00" : "16:30");
  const f = await family("Rivera");
  let discountId: string | null = null;
  if (opts.coupon) [{ id: discountId }] = await db().insert(s.discounts).values({ code: opts.coupon, name: opts.coupon, kind: "percent", value: 15 }).returning({ id: s.discounts.id });
  const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: sess.id, childId: f.children[0].id, addons: opts.addons ?? [] }], source: "public", acknowledgePaperwork: true });
  if (discountId) await db().update(s.bookings).set({ discountId }).where(eq(s.bookings.id, hold.booking.id));
  await startCheckout(db(), owner, hold.booking.id, { base: "http://test" });
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
  const [card] = await db().select().from(s.payments).where(and(eq(s.payments.invoiceId, inv.id), eq(s.payments.method, "card")));
  await processEvent(db(), "test", { id: `evt_${Math.random()}`, type: "payment.succeeded", checkoutRef: card.checkoutRef!, providerRef: "tpi", amountCents: card.amountCents });
  return { f, sess, booking: hold.booking, invoice: inv };
}

describe("Extending care", () => {
  it("adds a camp late stay to the existing invoice with the booking's coupon, then emails a payment link", async () => {
    const { booking, invoice, f } = await paidBooking("camp", { coupon: "FRIENDSOFYALLA" });
    expect((await invoiceTotals(db(), [invoice.id])).get(invoice.id)!.balance).toBe(0);
    const opts = await extensionOptions(db(), booking.id);
    expect(opts.map((o) => [o.label, o.priceCents])).toEqual([
      ["Early Bird", 2000],
      ["Late stay", 3000],
    ]);
    const late = opts.find((o) => o.key === "late")!;
    const r = await extendCare(db(), owner, { bookingId: booking.id, picks: [late.value], coupon: "booking", send: "link", baseUrl: "http://test" });
    expect(r.invoice.id).toBe(invoice.id); // the same invoice, not a new one
    expect(r.balanceCents).toBe(2550); // $30 less 15%
    const lines = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, invoice.id));
    expect(lines.find((l) => l.description.startsWith("Late stay"))).toMatchObject({ kind: "charge", quantity: 1, unitCents: 3000 });
    expect(lines.find((l) => l.description.includes("extended care"))).toMatchObject({ kind: "discount", amountCents: -450 });
    const [item] = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, booking.id));
    expect(item.addons).toContain("late");
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.id, invoice.id));
    expect(inv.status).toBe("open");
    expect(await db().select().from(s.messages).where(and(eq(s.messages.templateKey, "payment_request"), eq(s.messages.familyId, f.family.id)))).toHaveLength(1);
    // It's no longer offered, and the PDF still renders with everything on it.
    expect((await extensionOptions(db(), booking.id)).map((o) => o.key)).toEqual(["early"]);
    const pdf = await invoicePdf(db(), invoice.id);
    expect(pdf?.bytes.length).toBeGreaterThan(1000);
    if (process.env.EXTEND_PDF_OUT) (await import("node:fs")).writeFileSync(process.env.EXTEND_PDF_OUT, pdf!.bytes);
  });

  it("collect later: nothing is emailed; a staff-chosen code works; a 4:20pm sign-out isn't late", async () => {
    const { booking, sess, f } = await paidBooking("camp");
    const late = (await extensionOptions(db(), booking.id)).find((o) => o.key === "late")!;
    await db().insert(s.discounts).values({ code: "WEMISSEDYOU", name: "x", kind: "percent", value: 50, oncePerFamily: true });
    const r = await extendCare(db(), owner, { bookingId: booking.id, picks: [late.value], coupon: "WEMISSEDYOU", send: "account", baseUrl: "http://test" });
    expect(r).toMatchObject({ balanceCents: 1500, linkSent: false, coupon: "WEMISSEDYOU" });
    expect(await db().select().from(s.messages).where(eq(s.messages.templateKey, "payment_request"))).toHaveLength(0);
    await checkIn(db(), owner, { sessionId: sess.id, childId: f.children[0].id, at: sess.startsAt });
    const out = await checkOut(db(), owner, { sessionId: sess.id, childId: f.children[0].id, pickupId: `guardian:${f.guardian.id}`, at: new Date(sess.endsAt.getTime() + 80 * 60_000) });
    expect(out.lateFee).toBeNull();
  });

  it("a Yalla Flex half day becomes a full day for the difference", async () => {
    const { booking } = await paidBooking("drop_in", { addons: ["half"] });
    const opts = await extensionOptions(db(), booking.id);
    const full = opts.find((o) => o.key === "full_day")!;
    expect(full.priceCents).toBeGreaterThan(0);
    const r = await extendCare(db(), owner, { bookingId: booking.id, picks: [full.value], coupon: "none", send: "account", baseUrl: "http://test" });
    expect(r.balanceCents).toBe(full.priceCents);
    const [item] = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, booking.id));
    expect(item.addons).not.toContain("half");
    expect((await extensionOptions(db(), booking.id)).some((o) => o.key === "full_day")).toBe(false);
  });

  it("refuses nothing chosen, unknown codes, and bookings that aren't confirmed", async () => {
    const { booking } = await paidBooking("camp");
    await expect(extendCare(db(), owner, { bookingId: booking.id, picks: [], send: "account", baseUrl: "" })).rejects.toThrow(/Choose/);
    const late = (await extensionOptions(db(), booking.id))[0];
    await expect(extendCare(db(), owner, { bookingId: booking.id, picks: [late.value], coupon: "NOPE", send: "account", baseUrl: "" })).rejects.toThrow(/isn’t active/);
    await db().update(s.bookings).set({ status: "cancelled" }).where(eq(s.bookings.id, booking.id));
    await expect(extendCare(db(), owner, { bookingId: booking.id, picks: [late.value], send: "account", baseUrl: "" })).rejects.toThrow(/confirmed/);
  });
});

describe("Applying a code to a whole booking afterwards", () => {
  it("comes off the paid invoice, shows what they're owed, and only once", async () => {
    const { booking, invoice } = await paidBooking("camp");
    await db().insert(s.discounts).values({ code: "NEWTOYALLA", name: "x", kind: "percent", value: 20, oncePerFamily: true, firstBookingOnly: true });
    const r = await applyCouponToBooking(db(), owner, { bookingId: booking.id, code: "newtoyalla" });
    expect(r).toMatchObject({ code: "NEWTOYALLA", offCents: 3200, balanceCents: -3200 });
    expect(r.invoice.id).toBe(invoice.id);
    await expect(applyCouponToBooking(db(), owner, { bookingId: booking.id, code: "NEWTOYALLA" })).rejects.toThrow(/already has a coupon/);
  });
});
