/**
 * Yalla Play Passes: monthly family memberships that fund a prepaid wallet.
 *
 * - Renewals happen on the 1st of every month (America/Los_Angeles). A family joining partway
 *   through a month pays, and receives, the same share of the month: remaining days ÷ days in the
 *   month, counting the day they join. Both amounts are rounded to the cent the same way.
 * - Wallet funds are allocated only from verified provider events (invoice paid), once per paid
 *   invoice. A success page never changes anything.
 * - Plan changes take effect at the next renewal; cancelling stops future renewals. Funds already
 *   paid for stay in the wallet (see Settings → Play Passes for the unused-balance policy).
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { families, guardians, playPassCharges, playPassPlans, playPassSubscriptions, walletAllocations, walletEntries } from "@/lib/db/schema";
import { guardianActor, type GuardianContext } from "@/lib/family-auth";
import { notifyFamily } from "@/lib/notify";
import type { NormalizedEvent } from "@/lib/payments/provider";
import { fmtDate, todayLA, zonedDateTime } from "@/lib/time";
import { activeMembershipBilling, membershipBillingFor } from "./provider";
import { allocate, lockFamily, usd, walletSummary } from "./wallet";
import { finalMonth } from "./changes";

/** Bump when the recurring-billing summary families agree to changes. */
export const TERMS_VERSION = "2026-11-notice";
const WEBHOOK: Actor = { type: "webhook", name: "Payment provider" };

export type Plan = typeof playPassPlans.$inferSelect;
export type Subscription = typeof playPassSubscriptions.$inferSelect;

/* ── Plans & proration ── */

export async function offeredPlans(db: Executor) {
  return db.select().from(playPassPlans).where(eq(playPassPlans.active, true)).orderBy(playPassPlans.sortOrder);
}

export async function planById(db: Executor, id: string) {
  const [p] = await db.select().from(playPassPlans).where(eq(playPassPlans.id, id));
  return p ?? null;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const firstOfNextMonth = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};
/** a × n ÷ d, rounded half up, in whole cents (deterministic integer arithmetic). */
const share = (cents: number, n: number, d: number) => Math.floor((2 * cents * n + d) / (2 * d));

/** The first month for someone joining on `date`: the same fraction for the charge and the allocation. */
export function proration(plan: { priceCents: number; allocationCents: number }, date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const monthDays = daysInMonth(y, m);
  const remainingDays = monthDays - d + 1;
  const full = remainingDays === monthDays;
  return {
    startDate: date,
    remainingDays,
    monthDays,
    full,
    chargeCents: full ? plan.priceCents : share(plan.priceCents, remainingDays, monthDays),
    allocationCents: full ? plan.allocationCents : share(plan.allocationCents, remainingDays, monthDays),
    nextRenewalOn: firstOfNextMonth(date),
  };
}

/* ── Reading ── */

export async function openSubscription(db: Executor, familyId: string) {
  const [s] = await db
    .select()
    .from(playPassSubscriptions)
    .where(and(eq(playPassSubscriptions.familyId, familyId), inArray(playPassSubscriptions.status, ["pending", "active", "past_due"])));
  return s ?? null;
}

/** Everything a family's Play Pass page shows. */
export async function familyPlayPass(db: Executor, familyId: string) {
  const [sub] = await db
    .select()
    .from(playPassSubscriptions)
    .where(and(eq(playPassSubscriptions.familyId, familyId), ne(playPassSubscriptions.status, "abandoned")))
    .orderBy(desc(playPassSubscriptions.createdAt))
    .limit(1);
  const plan = sub ? await planById(db, sub.planId) : null;
  const nextPlan = sub?.nextPlanId ? await planById(db, sub.nextPlanId) : null;
  const wallet = await walletSummary(db, familyId);
  const activity = await db.select().from(walletEntries).where(eq(walletEntries.familyId, familyId)).orderBy(desc(walletEntries.createdAt)).limit(30);
  const charges = sub ? await db.select().from(playPassCharges).where(eq(playPassCharges.familyId, familyId)).orderBy(desc(playPassCharges.createdAt)).limit(24) : [];
  return { sub: sub ?? null, plan, nextPlan, wallet, activity, charges };
}

/* ── Signup ── */

export async function startSignup(db: DB, g: GuardianContext, input: { tier: string; acceptTerms: boolean; baseUrl: string }) {
  if (!g.canViewBilling) throw new OpsError("forbidden", "Only a guardian who manages billing can start a Play Pass.");
  if (!input.acceptTerms) throw new OpsError("terms", "Please confirm you agree to the monthly billing terms.");
  const [plan] = await db
    .select()
    .from(playPassPlans)
    .where(and(eq(playPassPlans.tier, input.tier), eq(playPassPlans.active, true)));
  if (!plan) throw new OpsError("not_found", "That Play Pass isn’t offered right now.");
  const billing = activeMembershipBilling();

  // One Play Pass per family. A checkout that was started and left is closed so it can't complete later.
  const open = await openSubscription(db, g.familyId);
  if (open && open.status !== "pending") throw new OpsError("exists", "Your family already has a Play Pass. You can change it under My Play Pass.");
  if (open) {
    if (open.checkoutRef) await membershipBillingFor(open.provider).expireCheckout?.(open.checkoutRef);
    await db.update(playPassSubscriptions).set({ status: "abandoned", updatedAt: new Date() }).where(eq(playPassSubscriptions.id, open.id));
  }

  const p = proration(plan, todayLA());
  const price = await billing.ensurePrice(plan);
  if (price.save) await db.update(playPassPlans).set(price.save).where(eq(playPassPlans.id, plan.id));
  const [prev] = await db
    .select({ customerRef: playPassSubscriptions.customerRef })
    .from(playPassSubscriptions)
    .where(and(eq(playPassSubscriptions.familyId, g.familyId), eq(playPassSubscriptions.provider, billing.name), sql`${playPassSubscriptions.customerRef} is not null`))
    .limit(1);

  let sub: Subscription;
  try {
    [sub] = await db
      .insert(playPassSubscriptions)
      .values({
        familyId: g.familyId,
        planId: plan.id,
        status: "pending",
        provider: billing.name,
        startDate: p.startDate,
        prorationDays: p.remainingDays,
        monthDays: p.monthDays,
        initialChargeCents: p.chargeCents,
        initialAllocationCents: p.allocationCents,
        nextRenewalOn: p.nextRenewalOn,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
        termsAcceptedBy: g.guardianId,
        customerRef: prev?.customerRef ?? null,
      })
      .returning();
  } catch {
    throw new OpsError("exists", "A Play Pass is already being set up for your family. Please refresh the page.");
  }
  const checkout = await billing.createCheckout({
    subscriptionId: sub.id,
    familyId: g.familyId,
    plan,
    priceRef: price.priceRef,
    firstChargeCents: p.full ? null : p.chargeCents,
    anchor: p.full ? null : Math.floor(zonedDateTime(p.nextRenewalOn, "00:00").getTime() / 1000),
    customerEmail: g.email,
    customerRef: prev?.customerRef ?? null,
    successUrl: `${input.baseUrl}/play-passes/welcome?ref=${sub.id}`,
    cancelUrl: `${input.baseUrl}/play-passes/join?plan=${plan.tier}&cancelled=1`,
    idempotencyKey: `playpass-checkout:${sub.id}`,
  });
  await db.update(playPassSubscriptions).set({ checkoutRef: checkout.checkoutRef, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
  await audit(db, guardianActor(g), { action: "playpass.signup_started", entityType: "family", entityId: g.familyId, summary: `Started a ${plan.name} Play Pass (${usd(p.chargeCents)} today)` });
  return { url: billing.name === "test" ? `${input.baseUrl}${checkout.url}` : checkout.url, subscriptionId: sub.id };
}

/* ── Member changes (all take effect from the next renewal) ── */

async function memberSub(db: Executor, g: GuardianContext) {
  if (!g.canViewBilling) throw new OpsError("forbidden", "Only a guardian who manages billing can change the Play Pass.");
  const sub = await openSubscription(db, g.familyId);
  if (!sub || sub.status === "pending" || !sub.subscriptionRef) throw new OpsError("not_found", "There’s no active Play Pass to change.");
  return sub;
}

export async function setRenewal(db: DB, g: GuardianContext, renew: boolean) {
  const sub = await memberSub(db, g);
  await membershipBillingFor(sub.provider).setCancelAtPeriodEnd(sub.subscriptionRef!, !renew);
  await db.update(playPassSubscriptions).set({ cancelAtPeriodEnd: !renew, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
  const plan = await planById(db, sub.planId);
  await audit(db, guardianActor(g), { action: renew ? "playpass.renewal_resumed" : "playpass.renewal_cancelled", entityType: "family", entityId: sub.familyId, summary: renew ? "Play Pass will renew again" : `Play Pass set to end after ${fmtDate(sub.nextRenewalOn ?? todayLA(), "d MMMM")}` });
  await notifyFamily(db, {
    key: "playpass_change",
    familyId: sub.familyId,
    vars: {
      change_summary: renew
        ? `Your ${plan?.name} Play Pass will keep renewing on the 1st of each month.`
        : `Your ${plan?.name} Play Pass won’t renew. It stays active until ${fmtDate(addMonthEnd(sub.nextRenewalOn), "EEEE d MMMM")}, and your remaining balance stays in your wallet.`,
    },
    related: { type: "family", id: sub.familyId },
  });
}

const addMonthEnd = (renewOn: string | null) => {
  const d = new Date(`${renewOn ?? todayLA()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export async function changePlan(db: DB, g: GuardianContext, tier: string) {
  const sub = await memberSub(db, g);
  const [plan] = await db
    .select()
    .from(playPassPlans)
    .where(and(eq(playPassPlans.tier, tier), eq(playPassPlans.active, true)));
  if (!plan) throw new OpsError("not_found", "That Play Pass isn’t offered right now.");
  const current = await planById(db, sub.planId);
  const billing = membershipBillingFor(sub.provider);
  const next = plan.id === sub.planId ? null : plan;
  const price = await billing.ensurePrice(next ?? current!);
  if (price.save) await db.update(playPassPlans).set(price.save).where(eq(playPassPlans.id, (next ?? current!).id));
  await billing.changePrice(sub.subscriptionRef!, price.priceRef);
  await db.update(playPassSubscriptions).set({ nextPlanId: next?.id ?? null, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
  await audit(db, guardianActor(g), { action: "playpass.plan_change", entityType: "family", entityId: sub.familyId, summary: next ? `Play Pass changes from ${current?.name} to ${next.name} on ${sub.nextRenewalOn}` : `Kept ${current?.name}` });
  await notifyFamily(db, {
    key: "playpass_change",
    familyId: sub.familyId,
    vars: {
      change_summary: next
        ? `From ${fmtDate(sub.nextRenewalOn ?? todayLA(), "EEEE d MMMM")}, your Play Pass will be ${next.name}: ${usd(next.priceCents)} a month with ${usd(next.allocationCents)} to spend. Nothing changes before then.`
        : `Your Play Pass stays ${current?.name}: ${usd(current!.priceCents)} a month with ${usd(current!.allocationCents)} to spend.`,
    },
    related: { type: "family", id: sub.familyId },
  });
}

export async function billingPortalUrl(db: Executor, g: GuardianContext, returnUrl: string) {
  const sub = await memberSub(db, g);
  if (!sub.customerRef) return null;
  return membershipBillingFor(sub.provider).portalUrl(sub.customerRef, returnUrl);
}

/* ── Verified provider events ── */

async function findSub(db: Executor, by: { localId?: string; subscriptionRef?: string | null; checkoutRef?: string }) {
  if (by.localId) {
    const [s] = await db.select().from(playPassSubscriptions).where(eq(playPassSubscriptions.id, by.localId));
    if (s) return s;
  }
  if (by.subscriptionRef) {
    const [s] = await db.select().from(playPassSubscriptions).where(eq(playPassSubscriptions.subscriptionRef, by.subscriptionRef));
    if (s) return s;
  }
  if (by.checkoutRef) {
    const [s] = await db.select().from(playPassSubscriptions).where(eq(playPassSubscriptions.checkoutRef, by.checkoutRef));
    if (s) return s;
  }
  return null;
}

type MembershipEvent = Extract<NormalizedEvent, { type: `membership.${string}` }>;

export async function applyMembershipEvent(db: DB, evt: MembershipEvent): Promise<string> {
  switch (evt.type) {
    case "membership.checkout_completed": {
      const sub = await findSub(db, { localId: evt.localId, checkoutRef: evt.checkoutRef });
      if (!sub) throw new Error(`Unknown Play Pass checkout ${evt.checkoutRef}`);
      let status = sub.status;
      if (sub.status === "abandoned") {
        // Paid after starting a newer checkout: keep it only if nothing else is open; otherwise staff resolve it.
        const other = await openSubscription(db, sub.familyId);
        if (other) {
          await audit(db, WEBHOOK, { action: "playpass.duplicate_checkout", entityType: "family", entityId: sub.familyId, summary: "A second Play Pass checkout completed. Cancel and refund one of them in Stripe." });
          return "duplicate checkout flagged";
        }
        status = "pending";
      }
      await db
        .update(playPassSubscriptions)
        .set({ customerRef: evt.customerRef ?? sub.customerRef, subscriptionRef: evt.subscriptionRef ?? sub.subscriptionRef, status, updatedAt: new Date() })
        .where(eq(playPassSubscriptions.id, sub.id));
      return "checkout recorded";
    }

    case "membership.invoice_paid": {
      const sub0 = await findSub(db, { localId: evt.localId, subscriptionRef: evt.subscriptionRef });
      if (!sub0) throw new Error(`Unknown Play Pass subscription ${evt.subscriptionRef ?? evt.localId}`);
      const res = await db.transaction(async (tx) => {
        await lockFamily(tx, sub0.familyId);
        const [sub] = await tx.select().from(playPassSubscriptions).where(eq(playPassSubscriptions.id, sub0.id)).for("update");
        const [already] = await tx.select().from(playPassCharges).where(eq(playPassCharges.invoiceRef, evt.invoiceRef));
        if (already?.status === "paid" || already?.status === "refunded" || already?.status === "disputed") return null;
        const today = todayLA();
        // Renewal: a downgrade whose 30-day notice has ended takes effect now. An upgrade or a
        // reactivation after a pause pays for the plan recorded with its charge.
        let planId = sub.planId;
        const downgradeDue = !sub.downgradeEffectiveOn || sub.downgradeEffectiveOn <= today;
        const switched = evt.reason === "renewal" && !!sub.nextPlanId && downgradeDue;
        if (switched) planId = sub.nextPlanId!;
        const special = (evt.reason === "upgrade" || evt.reason === "resume") && already?.planId ? already : null;
        if (special) planId = special.planId!;
        const plan = (await planById(tx, planId))!;
        const initial = evt.reason === "initial";
        // The final month after 30 days' notice is prorated through the end date; renewals that
        // fall in a pause add nothing.
        const final = evt.reason === "renewal" && sub.cancelEffectiveOn && sub.cancelEffectiveOn.slice(0, 7) === today.slice(0, 7) ? finalMonth(plan, sub.cancelEffectiveOn) : null;
        const inPause = evt.reason === "renewal" && !!sub.pauseStartsOn && !!sub.resumeOn && today >= sub.pauseStartsOn && today < sub.resumeOn;
        const allocation = initial
          ? sub.initialAllocationCents
          : special
            ? (special.allocationCents ?? 0)
            : evt.reason === "renewal" && !inPause
              ? (final?.allocationCents ?? plan.allocationCents)
              : 0;
        const expected = initial ? sub.initialChargeCents : special ? special.amountCents : (final?.chargeCents ?? plan.priceCents);
        if (evt.reason !== "other" && evt.amountCents !== expected)
          await audit(tx, WEBHOOK, { action: "playpass.amount_mismatch", entityType: "family", entityId: sub.familyId, summary: `Provider collected ${usd(evt.amountCents)} for a ${usd(expected)} Play Pass charge` });
        if (already) await tx.update(playPassCharges).set({ status: "paid", amountCents: evt.amountCents, failureReason: null, updatedAt: new Date() }).where(eq(playPassCharges.id, already.id));
        else
          await tx.insert(playPassCharges).values({
            subscriptionId: sub.id,
            familyId: sub.familyId,
            invoiceRef: evt.invoiceRef,
            chargeRef: evt.chargeRef ?? null,
            reason: initial ? "initial" : evt.reason === "other" ? "other" : evt.reason,
            amountCents: evt.amountCents,
            status: "paid",
            periodStart: initial ? sub.startDate : today.slice(0, 8) + "01",
          });
        if (allocation > 0)
          await allocate(tx, {
            familyId: sub.familyId,
            subscriptionId: sub.id,
            planId,
            kind: initial ? "initial" : "renewal",
            periodStart: initial ? sub.startDate : special ? today : today.slice(0, 8) + "01",
            amountCents: allocation,
            sourceRef: `invoice:${evt.invoiceRef}`,
            createdBy: "Play Pass billing",
            note: initial
              ? `${plan.name} Play Pass · ${sub.prorationDays === sub.monthDays ? "first month" : `first ${sub.prorationDays} days`}`
              : evt.reason === "upgrade"
                ? `Upgrade to ${plan.name} · rest of ${fmtDate(today, "MMMM")}`
                : evt.reason === "resume"
                  ? `${plan.name} Play Pass · back from your pause`
                  : final
                    ? `${plan.name} Play Pass · final ${final.days} days`
                    : `${plan.name} Play Pass · ${fmtDate(today, "MMMM yyyy")}`,
          });
        await tx
          .update(playPassSubscriptions)
          .set({
            planId,
            nextPlanId: switched || evt.reason === "upgrade" ? null : sub.nextPlanId,
            downgradeEffectiveOn: evt.reason === "upgrade" ? null : sub.downgradeEffectiveOn,
            status: "active",
            nextRenewalOn: firstOfNextMonth(today),
            lastPaymentFailedAt: null,
            lastFailureReason: null,
            updatedAt: new Date(),
          })
          .where(eq(playPassSubscriptions.id, sub.id));
        await audit(tx, WEBHOOK, { action: initial ? "playpass.activated" : "playpass.renewed", entityType: "family", entityId: sub.familyId, summary: `${plan.name} Play Pass: ${usd(evt.amountCents)} paid, ${usd(allocation)} added to the wallet` });
        return { sub, plan, allocation, initial, upgraded: evt.reason === "upgrade" && planId !== sub.planId };
      });
      if (!res) return "already processed";
      // An upgrade is paid: bill the new price from the next 1st.
      if (res.upgraded && res.sub.subscriptionRef) {
        const billing = membershipBillingFor(res.sub.provider);
        const price = await billing.ensurePrice(res.plan);
        if (price.save) await db.update(playPassPlans).set(price.save).where(eq(playPassPlans.id, res.plan.id));
        await billing.changePrice(res.sub.subscriptionRef, price.priceRef);
      }
      // Remember which card payment this was, so a later refund or dispute can be matched.
      if (!evt.chargeRef) {
        const ref = await membershipBillingFor(res.sub.provider).paymentRefForInvoice(evt.invoiceRef).catch(() => null);
        if (ref) await db.update(playPassCharges).set({ chargeRef: ref }).where(eq(playPassCharges.invoiceRef, evt.invoiceRef));
      }
      const w = await walletSummary(db, res.sub.familyId);
      await notifyFamily(db, {
        key: res.initial ? "playpass_welcome" : "playpass_renewal",
        familyId: res.sub.familyId,
        vars: {
          plan: res.plan.name,
          amount: usd(evt.amountCents),
          added: usd(res.allocation),
          balance: usd(w.availableCents),
          monthly_price: usd(res.plan.priceCents),
          monthly_allocation: usd(res.plan.allocationCents),
          next_renewal: fmtDate(firstOfNextMonth(todayLA()), "EEEE d MMMM"),
        },
        related: { type: "family", id: res.sub.familyId },
      });
      return "membership payment recorded";
    }

    case "membership.invoice_failed": {
      const sub = await findSub(db, { localId: evt.localId, subscriptionRef: evt.subscriptionRef });
      if (!sub) throw new Error(`Unknown Play Pass subscription ${evt.subscriptionRef ?? evt.localId}`);
      const [already] = await db.select().from(playPassCharges).where(eq(playPassCharges.invoiceRef, evt.invoiceRef));
      if (already?.status === "paid") return "already paid";
      if (already) await db.update(playPassCharges).set({ status: "failed", failureReason: evt.reason, updatedAt: new Date() }).where(eq(playPassCharges.id, already.id));
      else
        await db.insert(playPassCharges).values({ subscriptionId: sub.id, familyId: sub.familyId, invoiceRef: evt.invoiceRef, reason: sub.status === "pending" ? "initial" : "renewal", amountCents: evt.amountCents, status: "failed", failureReason: evt.reason });
      // A first payment that fails never activates; a renewal that fails leaves funds already paid untouched.
      if (sub.status === "active") await db.update(playPassSubscriptions).set({ status: "past_due", updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
      await db.update(playPassSubscriptions).set({ lastPaymentFailedAt: new Date(), lastFailureReason: evt.reason }).where(eq(playPassSubscriptions.id, sub.id));
      await audit(db, WEBHOOK, { action: "playpass.payment_failed", entityType: "family", entityId: sub.familyId, summary: `Play Pass payment of ${usd(evt.amountCents)} failed: ${evt.reason}` });
      if (sub.status !== "pending")
        await notifyFamily(db, { key: "playpass_payment_failed", familyId: sub.familyId, vars: { amount: usd(evt.amountCents), reason: evt.reason }, related: { type: "family", id: sub.familyId } });
      return "membership failure recorded";
    }

    case "membership.subscription_updated": {
      const sub = await findSub(db, { localId: evt.localId, subscriptionRef: evt.subscriptionRef });
      if (!sub) return "ignored";
      const status = evt.ended
        ? sub.status === "pending" || sub.status === "abandoned"
          ? "abandoned"
          : "canceled"
        : evt.status === "active" || evt.status === "trialing"
          ? sub.status === "pending"
            ? "pending" // activates when its first invoice is paid
            : "active"
          : evt.status === "past_due" || evt.status === "unpaid"
            ? "past_due"
            : evt.status === "canceled"
              ? "canceled"
              : evt.status === "incomplete_expired"
                ? "abandoned"
                : sub.status;
      await db
        .update(playPassSubscriptions)
        .set({ status, cancelAtPeriodEnd: evt.cancelAtPeriodEnd, subscriptionRef: sub.subscriptionRef ?? evt.subscriptionRef, canceledAt: status === "canceled" ? (sub.canceledAt ?? new Date()) : sub.canceledAt, updatedAt: new Date() })
        .where(eq(playPassSubscriptions.id, sub.id));
      if (status === "canceled" && sub.status !== "canceled") {
        await audit(db, WEBHOOK, { action: "playpass.ended", entityType: "family", entityId: sub.familyId, summary: "Play Pass ended. Remaining wallet funds are kept." });
        await notifyFamily(db, {
          key: "playpass_change",
          familyId: sub.familyId,
          vars: { change_summary: "Your Play Pass has ended and won’t renew. Any remaining balance stays in your wallet for Yalla experiences." },
          related: { type: "family", id: sub.familyId },
        });
      }
      return "membership status synced";
    }

    case "membership.charge_refunded":
      return reverseMembershipCharge(db, { paymentRef: evt.paymentRef, refundedTotalCents: evt.amountCents, kind: "refund" });
  }
}

/**
 * A refunded or lost-dispute membership payment takes back the matching share of the wallet
 * allocation it funded (once, however many times the event arrives). If the funds were already
 * spent, the balance can go below zero; that's shown to staff rather than hidden.
 */
export async function reverseMembershipCharge(db: DB, input: { paymentRef: string; refundedTotalCents: number; kind: "refund" | "dispute" }) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(playPassCharges).where(eq(playPassCharges.chargeRef, input.paymentRef)).for("update");
    if (!c) return "ignored";
    const newly = Math.min(input.refundedTotalCents, c.amountCents) - c.refundedCents;
    if (newly <= 0) return "already reversed";
    await lockFamily(tx, c.familyId);
    const [alloc] = await tx.select().from(walletAllocations).where(eq(walletAllocations.sourceRef, `invoice:${c.invoiceRef}`));
    const total = Math.min(input.refundedTotalCents, c.amountCents);
    if (alloc) {
      // Share of the allocation matching the share of the payment returned (same rounding as proration).
      const shouldBeReversed = share(alloc.amountCents, total, c.amountCents);
      const [done] = await tx
        .select({ n: sql<number>`coalesce(-sum(${walletEntries.amountCents}), 0)::int` })
        .from(walletEntries)
        .where(and(eq(walletEntries.allocationId, alloc.id), eq(walletEntries.kind, "payment_reversal")));
      const take = shouldBeReversed - done.n;
      if (take > 0)
        await tx.insert(walletEntries).values({
          familyId: c.familyId,
          allocationId: alloc.id,
          kind: "payment_reversal",
          amountCents: -take,
          note: `${input.kind === "refund" ? "Membership payment refunded" : "Membership payment disputed"} (${usd(total)} of ${usd(c.amountCents)})`,
          createdBy: "Play Pass billing",
          idempotencyKey: `reversal:${c.id}:${total}`,
        });
      if (total >= c.amountCents) await tx.update(walletAllocations).set({ reversedAt: new Date() }).where(eq(walletAllocations.id, alloc.id));
    }
    await tx
      .update(playPassCharges)
      .set({ refundedCents: total, status: input.kind === "dispute" ? "disputed" : "refunded", updatedAt: new Date() })
      .where(eq(playPassCharges.id, c.id));
    const w = await walletSummary(tx, c.familyId);
    await audit(tx, WEBHOOK, {
      action: "playpass.payment_reversed",
      entityType: "family",
      entityId: c.familyId,
      summary: `Membership payment ${input.kind === "refund" ? "refunded" : "lost in a dispute"}: ${usd(newly)}. Wallet adjusted to match${w.balanceCents < 0 ? `; balance is now ${usd(w.balanceCents)}` : ""}.`,
    });
    return "membership reversal recorded";
  });
}

/** A dispute on a membership payment: flagged when opened, reversed only if lost. */
export async function membershipDispute(db: DB, input: { paymentRef: string; status: string; amountCents?: number }) {
  const [c] = await db.select().from(playPassCharges).where(eq(playPassCharges.chargeRef, input.paymentRef));
  if (!c) return "ignored";
  if (input.status === "lost") return reverseMembershipCharge(db, { paymentRef: input.paymentRef, refundedTotalCents: input.amountCents ?? c.amountCents, kind: "dispute" });
  await db.update(playPassCharges).set({ status: input.status === "won" ? "paid" : "disputed", updatedAt: new Date() }).where(eq(playPassCharges.id, c.id));
  await audit(db, WEBHOOK, { action: "playpass.dispute", entityType: "family", entityId: c.familyId, summary: `Membership payment dispute: ${input.status}` });
  return "membership dispute recorded";
}

/** Family name and primary guardian (admin lists). */
export async function familyLabel(db: Executor, familyId: string) {
  const [f] = await db.select().from(families).where(eq(families.id, familyId));
  const [g] = await db.select().from(guardians).where(and(eq(guardians.familyId, familyId), eq(guardians.isPrimary, true)));
  return { name: f?.name ?? "", email: g?.email ?? "" };
}
