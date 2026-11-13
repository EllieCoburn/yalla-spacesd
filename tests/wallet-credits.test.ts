/**
 * Policies & Terms in the system: the 12-hour hold after a failed payment, cancellation credits in
 * the Yalla Wallet (24-hour rule, 24-month expiry, no cash refunds) and Yalla-initiated
 * cancellations (credit plus 5%, or a full refund).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { GuardianContext } from "@/lib/family-auth";
import { createHold, startCheckout } from "@/lib/ops/bookings";
import { familyCancelItem } from "@/lib/ops/public-booking";
import { resolveOffer, staffCancelBooking } from "@/lib/ops/yalla-cancellations";
import { processEvent } from "@/lib/payments/webhooks";
import { adjustWallet, creditExpiry, expireCredits, issueCredit, walletSummary } from "@/lib/playpass/wallet";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

let n = 0;
const evt = () => `evt_wc_${++n}_${Math.random().toString(36).slice(2, 6)}`;

const ctx = (f: Awaited<ReturnType<typeof family>>): GuardianContext => ({
  sessionId: "t",
  guardianId: f.guardian.id,
  familyId: f.family.id,
  familyName: f.family.name,
  firstName: f.guardian.firstName,
  lastName: f.guardian.lastName,
  email: f.guardian.email,
  canBook: true,
  canViewBilling: true,
  canViewSensitive: true,
});

/** Hold, check out and (optionally) pay by card through a verified test webhook. */
async function book(familyId: string, items: { sessionId: string; childId: string }[], pay = true) {
  const hold = await createHold(db(), owner, { familyId, items, source: "public", acknowledgePaperwork: true });
  await startCheckout(db(), owner, hold.booking.id, { base: "http://test" });
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
  const [card] = await db()
    .select()
    .from(s.payments)
    .where(and(eq(s.payments.invoiceId, inv.id), eq(s.payments.method, "card")));
  if (pay && card) await processEvent(db(), "test", { id: evt(), type: "payment.succeeded", checkoutRef: card.checkoutRef!, providerRef: `tpi_${card.id}`, amountCents: card.amountCents });
  const [item] = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, hold.booking.id));
  return { booking: hold.booking, invoice: inv, card, item };
}

describe("Failed payments", () => {
  it("hold the spots for 12 hours from booking so the family can try again", async () => {
    const p = await program({ kind: "drop_in", priceCents: 15000 });
    const sess = await session(p.id);
    const f = await family("Declined");
    const { booking, card } = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }], false);
    const before = (await db().select().from(s.bookings).where(eq(s.bookings.id, booking.id)))[0];
    expect(before.holdExpiresAt!.getTime() - before.createdAt.getTime()).toBeLessThanOrEqual(20 * 60_000);
    await processEvent(db(), "test", { id: evt(), type: "payment.failed", checkoutRef: card!.checkoutRef!, reason: "Card declined" });
    const after = (await db().select().from(s.bookings).where(eq(s.bookings.id, booking.id)))[0];
    expect(after.status).toBe("held");
    expect(after.holdExpiresAt!.getTime() - after.createdAt.getTime()).toBe(12 * 3600_000);
  });
});

describe("Cancellation credits", () => {
  it("returns a card payment to the Yalla Wallet as credit for 24 months when cancelled 24+ hours ahead, with no cash refund", async () => {
    const p = await program({ kind: "drop_in", priceCents: 15000 });
    const sess = await session(p.id, {}, 5);
    const f = await family("Planner");
    const { item, card } = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    const r = await familyCancelItem(db(), ctx(f), item.id);
    expect(r).toMatchObject({ credited: 15000, late: false });
    const w = await walletSummary(db(), f.family.id);
    expect(w).toMatchObject({ creditCents: 15000, passCents: 0, nextCreditExpiry: creditExpiry(todayLA()) });
    const [refund] = await db().select().from(s.refunds).where(eq(s.refunds.paymentId, card!.id));
    expect(refund).toMatchObject({ status: "succeeded", providerRef: "yalla_wallet", amountCents: 15000 });
  });

  it("gives no credit for a cancellation less than 24 hours ahead", async () => {
    const p = await program({ kind: "drop_in", priceCents: 15000 });
    const start = new Date(Date.now() + 10 * 3600_000);
    const sess = await session(p.id, { localDate: todayLA(start), startsAt: start, endsAt: new Date(start.getTime() + 3 * 3600_000) });
    const f = await family("Late");
    const { item } = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    const r = await familyCancelItem(db(), ctx(f), item.id);
    expect(r).toMatchObject({ credited: 0, late: true });
    expect((await walletSummary(db(), f.family.id)).availableCents).toBe(0);
  });

  it("spends credits on any booking, but Play Pass balance only on eligible experiences", async () => {
    const flex = await program({ kind: "drop_in", priceCents: 15000 });
    const sess = await session(flex.id);
    const f = await family("Spender");
    await adjustWallet(db(), owner, { familyId: f.family.id, amountCents: 5000, note: "Play Pass test funds", idempotencyKey: "pp" });
    await db().transaction((tx) => issueCredit(tx, { familyId: f.family.id, amountCents: 4000, sourceRef: "test-credit", note: "Test credit", createdBy: "test" }));
    const { invoice, booking } = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    const wallet = await db().select().from(s.payments).where(and(eq(s.payments.invoiceId, invoice.id), eq(s.payments.method, "wallet")));
    expect(wallet.reduce((t, p) => t + p.amountCents, 0)).toBe(4000); // credit only: Flex isn't Play Pass eligible
    expect((await db().select().from(s.bookings).where(eq(s.bookings.id, booking.id)))[0].status).toBe("confirmed");
    expect(await walletSummary(db(), f.family.id)).toMatchObject({ passCents: 5000, creditCents: 0 });
  });

  it("expires credits after 24 months, leaving Play Pass balance alone", async () => {
    const f = await family("Old");
    await adjustWallet(db(), owner, { familyId: f.family.id, amountCents: 2500, note: "Play Pass", idempotencyKey: "pp2" });
    const issued = addDaysISO(todayLA(), -800);
    await db().transaction((tx) => issueCredit(tx, { familyId: f.family.id, amountCents: 3000, sourceRef: "old-credit", note: "Old credit", createdBy: "test", issuedOn: issued }));
    expect(await walletSummary(db(), f.family.id)).toMatchObject({ creditCents: 0, passCents: 2500, availableCents: 2500 });
    expect(await expireCredits(db())).toBe(1);
    expect(await expireCredits(db())).toBe(0);
    const ledger = await db().select().from(s.walletEntries).where(and(eq(s.walletEntries.familyId, f.family.id), eq(s.walletEntries.kind, "expiration")));
    expect(ledger.map((e) => e.amountCents)).toEqual([-3000]);
  });

  it("lets staff give a courtesy credit when a family cancels late because their child is unwell", async () => {
    const p = await program({ kind: "drop_in", priceCents: 15000 });
    const start = new Date(Date.now() + 6 * 3600_000);
    const sess = await session(p.id, { localDate: todayLA(start), startsAt: start, endsAt: new Date(start.getTime() + 3 * 3600_000) });
    const f = await family("Unwell");
    const { booking } = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    const r = await staffCancelBooking(db(), owner, { bookingId: booking.id, reason: "Child has a fever", notify: false, mode: "family_courtesy" });
    expect(r.credited).toBe(15000);
    expect((await walletSummary(db(), f.family.id)).creditCents).toBe(15000);
  });
});

describe("When Yalla cancels", () => {
  async function cancelledByYalla(name: string) {
    const p = await program({ kind: "drop_in", priceCents: 18000 });
    const sess = await session(p.id);
    const f = await family(name);
    const b = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    const r = await staffCancelBooking(db(), owner, { bookingId: b.booking.id, reason: "Burst pipe", notify: false, mode: "yalla" });
    expect(r.offered).toBe(18000);
    const [offer] = await db().select().from(s.cancellationOffers).where(eq(s.cancellationOffers.familyId, f.family.id));
    return { f, offer, card: b.card! };
  }

  it("offers credit plus 5%: a $180 reservation becomes $189, once", async () => {
    const { f, offer } = await cancelledByYalla("Credit");
    const done = await resolveOffer(db(), owner, { offerId: offer.id, familyId: f.family.id, choice: "credit" });
    expect(done).toMatchObject({ status: "credited", creditedCents: 18900 });
    expect((await walletSummary(db(), f.family.id)).creditCents).toBe(18900);
    await resolveOffer(db(), owner, { offerId: offer.id, familyId: f.family.id, choice: "refund" });
    expect((await walletSummary(db(), f.family.id)).creditCents).toBe(18900);
  });

  it("or a full refund to the original payment method", async () => {
    const { f, offer, card } = await cancelledByYalla("Refund");
    const done = await resolveOffer(db(), owner, { offerId: offer.id, familyId: f.family.id, choice: "refund" });
    expect(done).toMatchObject({ status: "refunded", refundedCents: 18000 });
    const [refund] = await db().select().from(s.refunds).where(eq(s.refunds.paymentId, card.id));
    expect(refund.providerRef).not.toBe("yalla_wallet");
    expect(refund.status).toBe("succeeded");
    expect((await walletSummary(db(), f.family.id)).creditCents).toBe(0);
  });

  it("never lets another family make the choice", async () => {
    const { offer } = await cancelledByYalla("Mine");
    const other = await family("Other");
    await expect(resolveOffer(db(), owner, { offerId: offer.id, familyId: other.family.id, choice: "credit" })).rejects.toThrow(/couldn’t find/);
  });
});
