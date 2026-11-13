/**
 * Yalla Play Passes: membership billing, the wallet ledger, and wallet payments in booking checkout.
 * Each test maps to a scenario from the Play Pass brief (numbers in the test names).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { GuardianContext } from "@/lib/family-auth";
import { createHold, expireHolds, startCheckout } from "@/lib/ops/bookings";
import { invoiceTotals } from "@/lib/ops/billing";
import { familyCancelItem } from "@/lib/ops/public-booking";
import { processEvent } from "@/lib/payments/webhooks";
import { changePlan, proration, setRenewal, startSignup } from "@/lib/playpass/membership";
import { adjustWallet, walletSummary } from "@/lib/playpass/wallet";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

let evtN = 0;
const evtId = () => `evt_pp_${++evtN}_${Math.random().toString(36).slice(2, 6)}`;

async function plans() {
  const rows = await db()
    .insert(s.playPassPlans)
    .values([
      { tier: "play", name: "Play", priceCents: 12000, allocationCents: 13500, minExperiences: 2, sortOrder: 1 },
      { tier: "gather", name: "Gather", priceCents: 18000, allocationCents: 20000, minExperiences: 3, sortOrder: 2 },
      { tier: "belong", name: "Belong", priceCents: 24000, allocationCents: 27000, minExperiences: 4, sortOrder: 3 },
    ])
    .returning();
  return Object.fromEntries(rows.map((r) => [r.tier, r]));
}

function guardianCtx(f: Awaited<ReturnType<typeof family>>): GuardianContext {
  return {
    sessionId: "test",
    guardianId: f.guardian.id,
    familyId: f.family.id,
    familyName: f.family.name,
    firstName: f.guardian.firstName,
    lastName: f.guardian.lastName,
    email: f.guardian.email,
    canBook: true,
    canViewBilling: true,
    canViewSensitive: true,
  };
}

/** Join through the real signup and a verified (test) webhook. Returns the subscription. */
async function join(f: Awaited<ReturnType<typeof family>>, tier = "gather") {
  const g = guardianCtx(f);
  const { subscriptionId } = await startSignup(db(), g, { tier, acceptTerms: true, baseUrl: "http://test" });
  const [sub] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, subscriptionId));
  await processEvent(db(), "test", { id: evtId(), type: "membership.checkout_completed", checkoutRef: sub.checkoutRef!, customerRef: "tcus_1", subscriptionRef: `tsubref_${sub.id}`, localId: sub.id });
  await processEvent(db(), "test", { id: evtId(), type: "membership.invoice_paid", invoiceRef: `tin_init_${sub.id}`, subscriptionRef: `tsubref_${sub.id}`, localId: sub.id, amountCents: sub.initialChargeCents, reason: "initial", chargeRef: `tpi_init_${sub.id}` });
  const [after] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, subscriptionId));
  return after;
}

/** Give a family an exact balance with a documented adjustment (keeps tests independent of today's date). */
async function fund(familyId: string, cents: number) {
  await adjustWallet(db(), owner, { familyId, amountCents: cents, note: "Test funding", idempotencyKey: `fund-${familyId}-${cents}-${Math.random()}` });
}

async function eligibleProgram(overrides: Partial<typeof s.programs.$inferInsert> = {}) {
  return program({ kind: "happening", priceCents: 6500, playPassEligible: true, walletRedemptionAllowed: true, cancellationDeadlineHours: 24, ...overrides });
}

async function book(familyId: string, items: { sessionId: string; childId: string }[]) {
  const hold = await createHold(db(), owner, { familyId, items, source: "public", acknowledgePaperwork: true });
  const out = await startCheckout(db(), owner, hold.booking.id, { base: "http://test" });
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
  const [card] = await db()
    .select()
    .from(s.payments)
    .where(and(eq(s.payments.invoiceId, inv.id), eq(s.payments.method, "card")));
  return { booking: hold.booking, invoice: inv, card: card ?? null, free: out.free };
}

const bookingStatus = async (id: string) => (await db().select().from(s.bookings).where(eq(s.bookings.id, id)))[0].status;
const totals = async (invoiceId: string) => (await invoiceTotals(db(), [invoiceId])).get(invoiceId)!;

describe("Play Pass proration", () => {
  it("5 · joining on the 1st charges and allocates a full month", () => {
    expect(proration({ priceCents: 18000, allocationCents: 20000 }, "2026-12-01")).toMatchObject({ full: true, chargeCents: 18000, allocationCents: 20000, nextRenewalOn: "2027-01-01" });
  });

  it("6 · joining midmonth uses the same day-based share for charge and allocation", () => {
    // November has 30 days; joining on the 16th leaves 15 (the 16th included).
    expect(proration({ priceCents: 18000, allocationCents: 20000 }, "2026-11-16")).toMatchObject({ remainingDays: 15, monthDays: 30, chargeCents: 9000, allocationCents: 10000, nextRenewalOn: "2026-12-01" });
    // January has 31 days: 16 of 31 remain. $120 × 16/31 = $61.935… → $61.94; $135 × 16/31 = $69.677… → $69.68.
    expect(proration({ priceCents: 12000, allocationCents: 13500 }, "2027-01-16")).toMatchObject({ chargeCents: 6194, allocationCents: 6968 });
    // The last day of a month is one day's worth; December rolls into the next year.
    expect(proration({ priceCents: 24000, allocationCents: 27000 }, "2026-12-31")).toMatchObject({ remainingDays: 1, chargeCents: 774, allocationCents: 871, nextRenewalOn: "2027-01-01" });
  });
});

describe("Play Pass membership billing", () => {
  it("activates and funds the wallet only from the verified first payment", async () => {
    await plans();
    const f = await family("Join");
    const { subscriptionId } = await startSignup(db(), guardianCtx(f), { tier: "gather", acceptTerms: true, baseUrl: "http://test" });
    // Before the provider confirms payment: pending, nothing to spend.
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(0);
    const [pending] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, subscriptionId));
    expect(pending.status).toBe("pending");
    const sub = await join(await family("Join2"));
    expect(sub.status).toBe("active");
    expect((await walletSummary(db(), sub.familyId)).balanceCents).toBe(sub.initialAllocationCents);
  });

  it("refuses a second Play Pass for the same family", async () => {
    await plans();
    const f = await family("Twice");
    await join(f);
    await expect(startSignup(db(), guardianCtx(f), { tier: "play", acceptTerms: true, baseUrl: "http://test" })).rejects.toThrow(/already has a Play Pass/);
  });

  it("requires agreement to the billing terms", async () => {
    await plans();
    const f = await family("Terms");
    await expect(startSignup(db(), guardianCtx(f), { tier: "play", acceptTerms: false, baseUrl: "http://test" })).rejects.toThrow(/agree/);
  });

  it("7 · a renewal charges the monthly price and allocates the monthly amount", async () => {
    await plans();
    const f = await family("Renew");
    const sub = await join(f, "gather");
    const before = (await walletSummary(db(), f.family.id)).balanceCents;
    await processEvent(db(), "test", { id: evtId(), type: "membership.invoice_paid", invoiceRef: "tin_dec", subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: 18000, reason: "renewal", chargeRef: "tpi_dec" });
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(before + 20000);
    const allocations = await db().select().from(s.walletAllocations).where(eq(s.walletAllocations.familyId, f.family.id));
    expect(allocations.map((a) => a.kind).sort()).toEqual(["initial", "renewal"]);
  });

  it("8 · a failed renewal marks the pass past due and adds nothing", async () => {
    await plans();
    const f = await family("Fail");
    const sub = await join(f);
    const before = await walletSummary(db(), f.family.id);
    await processEvent(db(), "test", { id: evtId(), type: "membership.invoice_failed", invoiceRef: "tin_fail", subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: 18000, reason: "Card declined" });
    const [after] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, sub.id));
    expect(after.status).toBe("past_due");
    expect(await walletSummary(db(), f.family.id)).toEqual(before);
    // Stripe's retry succeeds: active again and funded once.
    await processEvent(db(), "test", { id: evtId(), type: "membership.invoice_paid", invoiceRef: "tin_fail", subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: 18000, reason: "renewal" });
    const [recovered] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, sub.id));
    expect(recovered.status).toBe("active");
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(before.balanceCents + 20000);
  });

  it("9 · duplicate payment webhooks never allocate twice", async () => {
    await plans();
    const f = await family("Dup");
    const sub = await join(f);
    const evt = { id: evtId(), type: "membership.invoice_paid" as const, invoiceRef: "tin_dup", subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: 18000, reason: "renewal" as const };
    const before = (await walletSummary(db(), f.family.id)).balanceCents;
    await processEvent(db(), "test", evt);
    await processEvent(db(), "test", evt); // same event id
    await processEvent(db(), "test", { ...evt, id: evtId() }); // same invoice, new event id
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(before + 20000);
  });

  it("13 · cancelling stops renewals and keeps the paid balance", async () => {
    await plans();
    const f = await family("Cancel");
    const sub = await join(f);
    const balance = (await walletSummary(db(), f.family.id)).balanceCents;
    await setRenewal(db(), guardianCtx(f), false);
    const [mid] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, sub.id));
    expect(mid.cancelAtPeriodEnd).toBe(true);
    expect(mid.status).toBe("active");
    await processEvent(db(), "test", { id: evtId(), type: "membership.subscription_updated", subscriptionRef: sub.subscriptionRef!, localId: sub.id, status: "canceled", cancelAtPeriodEnd: true, ended: true });
    const [ended] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, sub.id));
    expect(ended.status).toBe("canceled");
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(balance);
  });

  it("14 · a tier change applies from the next renewal", async () => {
    await plans();
    const f = await family("Change");
    const sub = await join(f, "play");
    await changePlan(db(), guardianCtx(f), "belong");
    const [mid] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, sub.id));
    expect(mid.nextPlanId).not.toBeNull();
    const before = (await walletSummary(db(), f.family.id)).balanceCents;
    await processEvent(db(), "test", { id: evtId(), type: "membership.invoice_paid", invoiceRef: "tin_next", subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: 24000, reason: "renewal" });
    const [after] = await db().select({ sub: s.playPassSubscriptions, plan: s.playPassPlans }).from(s.playPassSubscriptions).innerJoin(s.playPassPlans, eq(s.playPassPlans.id, s.playPassSubscriptions.planId)).where(eq(s.playPassSubscriptions.id, sub.id));
    expect(after.plan.tier).toBe("belong");
    expect(after.sub.nextPlanId).toBeNull();
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(before + 27000);
  });

  it("19 · a refund or lost dispute takes back the matching share of that month's funds, once", async () => {
    await plans();
    const f = await family("Refund");
    const sub = await join(f);
    await processEvent(db(), "test", { id: evtId(), type: "membership.invoice_paid", invoiceRef: "tin_r", subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: 18000, reason: "renewal", chargeRef: "tpi_r" });
    const before = (await walletSummary(db(), f.family.id)).balanceCents;
    // Half the $180 refunded → half the $200 allocation reversed.
    const half = { id: evtId(), type: "membership.charge_refunded" as const, paymentRef: "tpi_r", amountCents: 9000 };
    await processEvent(db(), "test", half);
    await processEvent(db(), "test", { ...half, id: evtId() }); // same cumulative amount again
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(before - 10000);
    // The rest is lost in a dispute.
    await processEvent(db(), "test", { id: evtId(), type: "dispute.updated", paymentRef: "tpi_r", status: "lost", amountCents: 18000 });
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(before - 20000);
    const reversals = await db().select().from(s.walletEntries).where(and(eq(s.walletEntries.familyId, f.family.id), eq(s.walletEntries.kind, "payment_reversal")));
    expect(reversals.reduce((t, e) => t + e.amountCents, 0)).toBe(-20000);
  });
});

describe("Play Pass in booking checkout", () => {
  it("1 · a nonmember pays the published price by card", async () => {
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 4 });
    const f = await family("Guest");
    const r = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    expect(r.card?.amountCents).toBe(6500);
    await processEvent(db(), "test", { id: evtId(), type: "payment.succeeded", checkoutRef: r.card!.checkoutRef!, providerRef: "pi_g", amountCents: 6500 });
    expect(await bookingStatus(r.booking.id)).toBe("confirmed");
    expect((await totals(r.invoice.id)).balance).toBe(0);
  });

  it("2 · a member's booking fully covered by the wallet confirms with nothing due", async () => {
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 4 });
    const f = await family("Member");
    await fund(f.family.id, 20000);
    const r = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    expect(r.free).toBe(true);
    expect(r.card).toBeNull();
    expect(await bookingStatus(r.booking.id)).toBe("confirmed");
    const t = await totals(r.invoice.id);
    expect(t).toMatchObject({ total: 6500, walletApplied: 6500, balance: 0 });
    expect(await walletSummary(db(), f.family.id)).toMatchObject({ balanceCents: 13500, reservedCents: 0, availableCents: 13500 });
  });

  it("3 · partial wallet funds plus a card payment ($40 + $25 for $65)", async () => {
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 4 });
    const f = await family("Partial");
    await fund(f.family.id, 4000);
    const r = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    expect(r.card?.amountCents).toBe(2500);
    // Reserved, not yet spent, and not available for anything else.
    expect(await walletSummary(db(), f.family.id)).toMatchObject({ balanceCents: 4000, reservedCents: 4000, availableCents: 0 });
    await processEvent(db(), "test", { id: evtId(), type: "payment.succeeded", checkoutRef: r.card!.checkoutRef!, providerRef: "pi_p", amountCents: 2500 });
    expect(await bookingStatus(r.booking.id)).toBe("confirmed");
    expect(await totals(r.invoice.id)).toMatchObject({ total: 6500, paid: 2500, walletApplied: 4000, balance: 0 });
    expect(await walletSummary(db(), f.family.id)).toMatchObject({ balanceCents: 0, reservedCents: 0, availableCents: 0 });
  });

  it("4 · two children in one event share the family balance", async () => {
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 4 });
    const f = await family("Two", [
      { first: "A", birth: "2021-01-01" },
      { first: "B", birth: "2022-01-01" },
    ]);
    await fund(f.family.id, 20000);
    const r = await book(f.family.id, [
      { sessionId: sess.id, childId: f.children[0].id },
      { sessionId: sess.id, childId: f.children[1].id },
    ]);
    expect(r.free).toBe(true);
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(20000 - 13000);
  });

  it("10 · two checkouts at once can't spend the same funds", async () => {
    const p = await eligibleProgram();
    const a = await session(p.id, { capacity: 4 }, 7);
    const b = await session(p.id, { capacity: 4 }, 8);
    const f = await family("Race");
    await fund(f.family.id, 6500);
    const holdA = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: a.id, childId: f.children[0].id }], source: "public", acknowledgePaperwork: true });
    const holdB = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: b.id, childId: f.children[0].id }], source: "public", acknowledgePaperwork: true });
    const results = await Promise.all([startCheckout(db(), owner, holdA.booking.id, { base: "http://test" }), startCheckout(db(), owner, holdB.booking.id, { base: "http://test" })]);
    expect(results.filter((r) => r.free)).toHaveLength(1);
    const res = await db().select().from(s.walletReservations).where(eq(s.walletReservations.familyId, f.family.id));
    expect(res.reduce((t, r) => t + r.amountCents, 0)).toBe(6500);
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(0);
  });

  it("11 · two families can't both take the last space", async () => {
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 1, hardCapacity: 1 });
    const f1 = await family("One");
    const f2 = await family("Two");
    const attempts = await Promise.allSettled([
      createHold(db(), owner, { familyId: f1.family.id, items: [{ sessionId: sess.id, childId: f1.children[0].id }], source: "public", acknowledgePaperwork: true }),
      createHold(db(), owner, { familyId: f2.family.id, items: [{ sessionId: sess.id, childId: f2.children[0].id }], source: "public", acknowledgePaperwork: true }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
  });

  it("12 · a family's online cancellation returns the Play Pass funds", async () => {
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 4 }, 10);
    const f = await family("Undo");
    await fund(f.family.id, 6500);
    const r = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(0);
    const [item] = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, r.booking.id));
    await familyCancelItem(db(), guardianCtx(f), item.id);
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(6500);
    const refunds = await db().select().from(s.walletEntries).where(and(eq(s.walletEntries.familyId, f.family.id), eq(s.walletEntries.kind, "booking_refund")));
    expect(refunds).toHaveLength(1);
    // Nothing is owed on the cancelled booking.
    expect((await totals(r.invoice.id)).balance).toBe(0);
  });

  it("15 · an administrator can correct a balance, with a reason and an audit record", async () => {
    const f = await family("Adjust");
    await adjustWallet(db(), owner, { familyId: f.family.id, amountCents: 2500, note: "Goodwill credit", idempotencyKey: "adj-1" });
    await adjustWallet(db(), owner, { familyId: f.family.id, amountCents: 2500, note: "Goodwill credit", idempotencyKey: "adj-1" }); // repeated submit
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(2500);
    await adjustWallet(db(), owner, { familyId: f.family.id, amountCents: -1000, note: "Correction", idempotencyKey: "adj-2" });
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(1500);
    await expect(adjustWallet(db(), owner, { familyId: f.family.id, amountCents: -5000, note: "Too much", idempotencyKey: "adj-3" })).rejects.toThrow(/available to remove/);
    await expect(adjustWallet(db(), owner, { familyId: f.family.id, amountCents: 500, note: " ", idempotencyKey: "adj-4" })).rejects.toThrow(/why/);
    const log = await db().select().from(s.auditLog).where(eq(s.auditLog.action, "playpass.wallet_adjusted"));
    expect(log).toHaveLength(2);
  });

  it("16 · an ineligible program can't use Play Pass funds", async () => {
    const p = await program({ kind: "camp", priceCents: 16000 });
    const sess = await session(p.id, { capacity: 4 });
    const f = await family("Camp");
    await fund(f.family.id, 27000);
    const r = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    expect(r.card?.amountCents).toBe(16000);
    expect((await walletSummary(db(), f.family.id)).reservedCents).toBe(0);
  });

  it("17 · a failed card payment doesn't confirm the booking or spend the wallet", async () => {
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 4 });
    const f = await family("Declined");
    await fund(f.family.id, 4000);
    const r = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    await processEvent(db(), "test", { id: evtId(), type: "payment.failed", checkoutRef: r.card!.checkoutRef!, reason: "Card declined" });
    expect(await bookingStatus(r.booking.id)).not.toBe("confirmed");
    expect(await walletSummary(db(), f.family.id)).toMatchObject({ balanceCents: 4000, reservedCents: 4000, availableCents: 0 });
  });

  it("18 · an abandoned checkout releases both the space and the reserved funds", async () => {
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 4 });
    const f = await family("Gone");
    await fund(f.family.id, 4000);
    const r = await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    await expireHolds(db(), new Date(Date.now() + 2 * 3600_000));
    expect(await bookingStatus(r.booking.id)).toBe("expired");
    expect(await walletSummary(db(), f.family.id)).toMatchObject({ balanceCents: 4000, reservedCents: 0, availableCents: 4000 });
  });

  it("20 · a family can't touch another family's bookings or wallet", async () => {
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 4 }, 10);
    const owner1 = await family("Owner");
    const other = await family("Other");
    await fund(owner1.family.id, 6500);
    const r = await book(owner1.family.id, [{ sessionId: sess.id, childId: owner1.children[0].id }]);
    const [item] = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, r.booking.id));
    await expect(familyCancelItem(db(), guardianCtx(other), item.id)).rejects.toThrow(/not found/i);
    expect((await walletSummary(db(), other.family.id)).balanceCents).toBe(0);
    // A booking only ever draws on its own family's wallet.
    await fund(other.family.id, 20000);
    const r2 = await book(owner1.family.id, [{ sessionId: (await session(p.id, { capacity: 4 }, 11)).id, childId: owner1.children[0].id }]);
    expect(r2.card?.amountCents).toBe(6500);
    expect((await walletSummary(db(), other.family.id)).balanceCents).toBe(20000);
  });
});

describe("Play Pass administration", () => {
  it("a new price applies to new members only; existing members renew on their own plan", async () => {
    const { newPlanVersion } = await import("@/lib/playpass/admin");
    await plans();
    const f = await family("Existing");
    const sub = await join(f, "gather");
    await newPlanVersion(db(), owner, { tier: "gather", name: "Gather", priceCents: 19000, allocationCents: 21000, minExperiences: 3 });
    const before = (await walletSummary(db(), f.family.id)).balanceCents;
    await processEvent(db(), "test", { id: evtId(), type: "membership.invoice_paid", invoiceRef: "tin_old", subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: 18000, reason: "renewal" });
    expect((await walletSummary(db(), f.family.id)).balanceCents).toBe(before + 20000);
    const offered = await db().select().from(s.playPassPlans).where(and(eq(s.playPassPlans.tier, "gather"), eq(s.playPassPlans.active, true)));
    expect(offered.map((p) => p.priceCents)).toEqual([19000]);
  });

  it("reports membership cash separately from wallet value", async () => {
    const { financialReport } = await import("@/lib/playpass/admin");
    await plans();
    const f = await family("Report");
    const sub = await join(f, "gather");
    const p = await eligibleProgram();
    const sess = await session(p.id, { capacity: 4 });
    await book(f.family.id, [{ sessionId: sess.id, childId: f.children[0].id }]);
    const r = await financialReport(db());
    expect(r.membershipCashCents).toBe(sub.initialChargeCents);
    expect(r.allocatedCents).toBe(sub.initialAllocationCents);
    expect(r.redeemedCents).toBe(Math.min(6500, sub.initialAllocationCents));
    expect(r.unredeemedCents).toBe(r.allocatedCents - r.redeemedCents);
  });
});
