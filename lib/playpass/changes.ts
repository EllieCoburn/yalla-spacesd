/**
 * Changing a Play Pass (Policies & Terms → Memberships):
 *
 * - Cancel: 30 days' notice. Billing continues through the notice period; if it ends partway
 *   through a month, the 1st of that month charges only the days through the end date (monthly
 *   fee ÷ days in the month × days through and including the end date). The month's balance is
 *   prorated the same way.
 * - Upgrade: anytime, at once. The rest of this month's price difference is charged now and the
 *   matching extra balance added once it's paid; the new price applies from the next 1st.
 * - Downgrade: 30 days' notice. The new pass starts with the first renewal after the notice ends.
 * - Pause: up to 60 consecutive days, starting at least 30 days from the request. No renewals while
 *   paused; it reactivates automatically (the 61st day for a full pause), charging the rest of that
 *   month. To end during a pause without reactivating, give notice at least 30 days before the
 *   reactivation date; otherwise it reactivates and billing continues until the notice ends.
 *
 * Dates are calendar days in San Diego. Requests take effect through the daily job
 * (applyPlayPassSchedules) and verified payment events, never from a success page.
 */
import { and, eq, inArray } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB } from "@/lib/db";
import { playPassCharges, playPassPlans, playPassSubscriptions } from "@/lib/db/schema";
import { guardianActor, type GuardianContext } from "@/lib/family-auth";
import { notifyFamily } from "@/lib/notify";
import { processEvent } from "@/lib/payments/webhooks";
import { addDaysISO, fmtDate, todayLA, zonedDateTime } from "@/lib/time";
import { firstOfNextMonth, planById, openSubscription, type Plan, type Subscription } from "./membership";
import { membershipBillingFor } from "./provider";
import { randomToken } from "@/lib/auth/crypto";
import { usd } from "./wallet";

export const NOTICE_DAYS = 30;
export const MAX_PAUSE_DAYS = 60;

const monthDays = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const dayOf = (date: string) => Number(date.slice(8, 10));
const monthEnd = (date: string) => `${date.slice(0, 8)}${String(monthDays(date)).padStart(2, "0")}`;
const firstOfMonth = (date: string) => `${date.slice(0, 8)}01`;
const unix = (date: string) => Math.floor(zonedDateTime(date, "00:00").getTime() / 1000);
/** a × n ÷ d, rounded half up, in whole cents (as for the first month). */
const share = (cents: number, n: number, d: number) => Math.floor((2 * cents * n + d) / (2 * d));

/** The charge and balance for `from`..`to` (inclusive, same month) of a plan. */
export function partMonth(plan: Pick<Plan, "priceCents" | "allocationCents">, from: string, to: string) {
  const md = monthDays(from);
  const days = dayOf(to) - dayOf(from) + 1;
  if (days >= md) return { chargeCents: plan.priceCents, allocationCents: plan.allocationCents, days, monthDays: md };
  return { chargeCents: share(plan.priceCents, days, md), allocationCents: share(plan.allocationCents, days, md), days, monthDays: md };
}

/** The final month's 1st-of-month charge for a membership ending on `endOn`, or null if it ends on a month's last day. */
export function finalMonth(plan: Pick<Plan, "priceCents" | "allocationCents">, endOn: string) {
  if (endOn === monthEnd(endOn)) return null;
  return partMonth(plan, firstOfMonth(endOn), endOn);
}

const paused = (sub: Subscription, on: string) => !!(sub.pauseStartsOn && sub.resumeOn && on >= sub.pauseStartsOn && on < sub.resumeOn);

/** The plan in force at a renewal date (a downgrade starts at the first renewal after its notice). */
async function planAt(db: DB, sub: Subscription, renewalOn: string) {
  if (sub.nextPlanId && (!sub.downgradeEffectiveOn || sub.downgradeEffectiveOn <= renewalOn)) return (await planById(db, sub.nextPlanId))!;
  return (await planById(db, sub.planId))!;
}

async function memberSub(db: DB, g: GuardianContext) {
  if (!g.canViewBilling) throw new OpsError("forbidden", "Only a guardian who manages billing can change the Play Pass.");
  const sub = await openSubscription(db, g.familyId);
  if (!sub || sub.status === "pending" || !sub.subscriptionRef) throw new OpsError("not_found", "There’s no active Play Pass to change.");
  return sub;
}

const tell = (db: DB, sub: Subscription, summary: string) => notifyFamily(db, { key: "playpass_change", familyId: sub.familyId, vars: { change_summary: summary }, related: { type: "family", id: sub.familyId } });

/* ── What a family would see before deciding ── */

export async function changeOptions(db: DB, sub: Subscription, today = todayLA()) {
  const plan = (await planById(db, sub.planId))!;
  const plans = await db.select().from(playPassPlans).where(eq(playPassPlans.active, true)).orderBy(playPassPlans.sortOrder);
  const notice = addDaysISO(today, NOTICE_DAYS);
  // Ending during a scheduled pause (with enough notice) means it never reactivates.
  const endOn = sub.pauseStartsOn && sub.resumeOn && sub.pauseStartsOn <= notice && notice < sub.resumeOn ? addDaysISO(sub.resumeOn, -1) : notice;
  const finalPlan = await planAt(db, sub, firstOfMonth(endOn));
  const final = paused(sub, endOn) ? null : finalMonth(finalPlan, endOn);
  return {
    plan,
    cancel: { endOn, final, duringPause: endOn !== notice },
    upgrades: plans
      .filter((p) => p.priceCents > plan.priceCents)
      .map((p) => ({ plan: p, ...partMonth({ priceCents: p.priceCents - plan.priceCents, allocationCents: p.allocationCents - plan.allocationCents }, today, monthEnd(today)) })),
    downgrades: plans.filter((p) => p.priceCents < plan.priceCents).map((p) => ({ plan: p, startsOn: firstRenewalOnOrAfter(notice) })),
    pause: { earliestStart: notice, maxDays: MAX_PAUSE_DAYS },
  };
}

const firstRenewalOnOrAfter = (date: string) => (dayOf(date) === 1 ? date : firstOfNextMonth(date));

/* ── Cancel ── */

export async function requestCancel(db: DB, g: GuardianContext, today = todayLA()) {
  const sub = await memberSub(db, g);
  if (sub.cancelEffectiveOn) throw new OpsError("exists", `Your Play Pass is already set to end on ${fmtDate(sub.cancelEffectiveOn, "MMMM d")}.`);
  const o = await changeOptions(db, sub, today);
  const endOn = o.cancel.endOn;
  // A pause that would start after the end date no longer applies.
  const keepPause = sub.pauseStartsOn && sub.pauseStartsOn <= endOn;
  await membershipBillingFor(sub.provider).scheduleEnd(sub.subscriptionRef!, unix(addDaysISO(endOn, 1)));
  await db
    .update(playPassSubscriptions)
    .set({
      cancelEffectiveOn: endOn,
      cancelRequestedAt: new Date(),
      finalChargeCents: o.cancel.final?.chargeCents ?? 0,
      finalPriceSet: false,
      cancelAtPeriodEnd: false,
      ...(keepPause ? {} : { pauseStartsOn: null, resumeOn: null }),
      updatedAt: new Date(),
    })
    .where(eq(playPassSubscriptions.id, sub.id));
  await audit(db, guardianActor(g), { action: "playpass.cancel_requested", entityType: "family", entityId: sub.familyId, summary: `Play Pass cancellation: ends ${endOn}${o.cancel.final ? `, final payment ${usd(o.cancel.final.chargeCents)}` : ""}` });
  await tell(
    db,
    sub,
    o.cancel.duringPause
      ? `We’ve received your notice. Your Play Pass won’t reactivate after your pause; it ends on ${fmtDate(endOn, "EEEE, MMMM d")}. Your remaining balance stays in your wallet.`
      : `We’ve received your 30 days’ notice. Your Play Pass stays active until ${fmtDate(endOn, "EEEE, MMMM d")}, and regular billing continues until then.${
          o.cancel.final ? ` On ${fmtDate(firstOfMonth(endOn), "MMMM d")} we’ll charge a prorated final payment of ${usd(o.cancel.final.chargeCents)} for ${o.cancel.final.days} days, and add ${usd(o.cancel.final.allocationCents)} to your balance.` : ""
        } Your remaining balance stays in your wallet.`,
  );
  return { endOn, final: o.cancel.final };
}

/** Changed your mind before the end date: keep the Play Pass. */
export async function withdrawCancel(db: DB, g: GuardianContext, today = todayLA()) {
  const sub = await memberSub(db, g);
  if (!sub.cancelEffectiveOn || sub.cancelEffectiveOn < today) throw new OpsError("invalid", "There’s no cancellation to undo.");
  const billing = membershipBillingFor(sub.provider);
  await billing.scheduleEnd(sub.subscriptionRef!, null);
  if (sub.finalPriceSet) {
    const plan = await planAt(db, sub, sub.nextRenewalOn ?? today);
    const price = await billing.ensurePrice(plan);
    await billing.changePrice(sub.subscriptionRef!, price.priceRef);
  }
  await db.update(playPassSubscriptions).set({ cancelEffectiveOn: null, cancelRequestedAt: null, finalChargeCents: null, finalPriceSet: false, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
  await audit(db, guardianActor(g), { action: "playpass.cancel_withdrawn", entityType: "family", entityId: sub.familyId, summary: "Play Pass cancellation withdrawn" });
  await tell(db, sub, "Your Play Pass will keep going. It renews on the 1st of each month as usual.");
}

/* ── Upgrade / downgrade ── */

export async function changeTier(db: DB, g: GuardianContext, tier: string, today = todayLA()) {
  const sub = await memberSub(db, g);
  const [target] = await db
    .select()
    .from(playPassPlans)
    .where(and(eq(playPassPlans.tier, tier), eq(playPassPlans.active, true)));
  if (!target) throw new OpsError("not_found", "That Play Pass isn’t offered right now.");
  const plan = (await planById(db, sub.planId))!;
  const billing = membershipBillingFor(sub.provider);
  const actor = guardianActor(g);

  if (target.id === plan.id) {
    // Keep the current pass: undo a pending downgrade.
    if (sub.nextPlanId) {
      if (!sub.downgradeEffectiveOn) {
        const price = await billing.ensurePrice(plan);
        await billing.changePrice(sub.subscriptionRef!, price.priceRef);
      }
      await db.update(playPassSubscriptions).set({ nextPlanId: null, downgradeEffectiveOn: null, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
      await tell(db, sub, `Your Play Pass stays ${plan.name}: ${usd(plan.priceCents)} a month with ${usd(plan.allocationCents)} to spend.`);
    }
    return { kind: "kept" as const };
  }
  if (sub.cancelEffectiveOn) throw new OpsError("invalid", "Your Play Pass is set to end. Undo the cancellation first to change your pass.");
  if (paused(sub, today)) throw new OpsError("invalid", "Your Play Pass is paused. You can change it once it reactivates.");

  if (target.priceCents > plan.priceCents) {
    // Upgrade now: this month's difference, charged and added once paid.
    const diff = partMonth({ priceCents: target.priceCents - plan.priceCents, allocationCents: target.allocationCents - plan.allocationCents }, today, monthEnd(today));
    const key = `upgrade:${sub.id}:${target.id}:${today}:${randomToken(4)}`;
    const { invoiceRef } = await billing.chargeNow({
      subscriptionRef: sub.subscriptionRef!,
      customerRef: sub.customerRef,
      localId: sub.id,
      amountCents: diff.chargeCents,
      description: `Upgrade to ${target.name} Play Pass · rest of ${fmtDate(today, "MMMM")}`,
      reason: "upgrade",
      idempotencyKey: key,
    });
    await db
      .insert(playPassCharges)
      .values({ subscriptionId: sub.id, familyId: sub.familyId, invoiceRef, reason: "upgrade", amountCents: diff.chargeCents, status: "pending", planId: target.id, allocationCents: diff.allocationCents, periodStart: today })
      .onConflictDoNothing({ target: playPassCharges.invoiceRef });
    await db.update(playPassSubscriptions).set({ nextPlanId: null, downgradeEffectiveOn: null, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
    await audit(db, actor, { action: "playpass.upgrade", entityType: "family", entityId: sub.familyId, summary: `Upgrade ${plan.name} → ${target.name}: ${usd(diff.chargeCents)} now, ${usd(diff.allocationCents)} added once paid` });
    if (sub.provider === "test")
      await processEvent(db, "test", { id: `evt_${invoiceRef}`, type: "membership.invoice_paid", invoiceRef, subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: diff.chargeCents, reason: "upgrade", chargeRef: `tpi_${invoiceRef}` });
    return { kind: "upgrade" as const, ...diff };
  }

  // Downgrade with 30 days' notice.
  const startsOn = firstRenewalOnOrAfter(addDaysISO(today, NOTICE_DAYS));
  await db.update(playPassSubscriptions).set({ nextPlanId: target.id, downgradeEffectiveOn: addDaysISO(today, NOTICE_DAYS), updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
  await audit(db, actor, { action: "playpass.downgrade_requested", entityType: "family", entityId: sub.familyId, summary: `Downgrade ${plan.name} → ${target.name} from ${startsOn}` });
  await tell(db, sub, `We’ve received your 30 days’ notice. From ${fmtDate(startsOn, "EEEE, MMMM d")}, your Play Pass will be ${target.name}: ${usd(target.priceCents)} a month with ${usd(target.allocationCents)} to spend. Nothing changes before then.`);
  return { kind: "downgrade" as const, startsOn };
}

/* ── Pause ── */

export async function requestPause(db: DB, g: GuardianContext, input: { startOn: string; days: number }, today = todayLA()) {
  const sub = await memberSub(db, g);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startOn)) throw new OpsError("invalid", "Choose the first day of your pause.");
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_PAUSE_DAYS) throw new OpsError("invalid", `A pause can last up to ${MAX_PAUSE_DAYS} days.`);
  const earliest = addDaysISO(today, NOTICE_DAYS);
  if (input.startOn < earliest) throw new OpsError("invalid", `Pauses need 30 days’ notice, so the earliest start is ${fmtDate(earliest, "MMMM d")}.`);
  if (sub.pauseStartsOn) throw new OpsError("exists", "You already have a pause scheduled.");
  if (sub.cancelEffectiveOn) throw new OpsError("invalid", "Your Play Pass is set to end, so it can’t be paused.");
  const resumeOn = addDaysISO(input.startOn, input.days);
  await db.update(playPassSubscriptions).set({ pauseStartsOn: input.startOn, resumeOn, pauseAppliedAt: null, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
  await audit(db, guardianActor(g), { action: "playpass.pause_requested", entityType: "family", entityId: sub.familyId, summary: `Play Pass paused ${input.startOn} to ${addDaysISO(resumeOn, -1)}` });
  await tell(
    db,
    sub,
    `Your Play Pass is paused from ${fmtDate(input.startOn, "EEEE, MMMM d")} through ${fmtDate(addDaysISO(resumeOn, -1), "EEEE, MMMM d")}. There are no renewals while it’s paused. It reactivates automatically on ${fmtDate(resumeOn, "EEEE, MMMM d")}, when we’ll charge for the rest of that month and add the matching balance. To end your Play Pass instead, give notice by ${fmtDate(addDaysISO(resumeOn, -NOTICE_DAYS), "MMMM d")}.`,
  );
  return { resumeOn };
}

export async function withdrawPause(db: DB, g: GuardianContext, today = todayLA()) {
  const sub = await memberSub(db, g);
  if (!sub.pauseStartsOn) throw new OpsError("invalid", "There’s no pause to undo.");
  if (sub.pauseStartsOn <= today) throw new OpsError("invalid", "Your pause has already begun. It ends automatically on the date shown.");
  await db.update(playPassSubscriptions).set({ pauseStartsOn: null, resumeOn: null, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
  await audit(db, guardianActor(g), { action: "playpass.pause_withdrawn", entityType: "family", entityId: sub.familyId, summary: "Play Pass pause withdrawn" });
  await tell(db, sub, "Your pause has been cancelled. Your Play Pass keeps renewing as usual.");
}

/** What a renewal on `on` (a 1st) bills, for the test sandbox's simulated renewals. Null while paused. */
export async function renewalAmount(db: DB, sub: Subscription, on = todayLA()) {
  if (paused(sub, on)) return null;
  const plan = await planAt(db, sub, on);
  const final = sub.cancelEffectiveOn && sub.cancelEffectiveOn.slice(0, 7) === on.slice(0, 7) ? finalMonth(plan, sub.cancelEffectiveOn) : null;
  return final?.chargeCents ?? plan.priceCents;
}

/* ── Daily job ── */

const SYSTEM: Actor = { type: "system", name: "Play Pass schedule" };

/**
 * Carry out scheduled changes: switch the billed price for a downgrade, set the prorated final
 * month, start and end pauses (charging the rest of the month on reactivation) and end
 * memberships after their notice. Safe to run more than once a day.
 */
export async function applyPlayPassSchedules(db: DB, today = todayLA()) {
  const subs = await db.select().from(playPassSubscriptions).where(inArray(playPassSubscriptions.status, ["active", "past_due"]));
  let changed = 0;
  for (let sub of subs) {
    const billing = membershipBillingFor(sub.provider);
    const ref = sub.subscriptionRef;
    if (!ref) continue;

    // A downgrade's notice has ended: bill the new price from the next renewal.
    if (sub.nextPlanId && sub.downgradeEffectiveOn && sub.downgradeEffectiveOn <= today) {
      const next = (await planById(db, sub.nextPlanId))!;
      const price = await billing.ensurePrice(next);
      if (price.save) await db.update(playPassPlans).set(price.save).where(eq(playPassPlans.id, next.id));
      await billing.changePrice(ref, price.priceRef);
      [sub] = await db.update(playPassSubscriptions).set({ downgradeEffectiveOn: null, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id)).returning();
      changed++;
    }

    // The next renewal is the final, prorated month.
    if (sub.cancelEffectiveOn && !sub.finalPriceSet && sub.nextRenewalOn === firstOfMonth(sub.cancelEffectiveOn)) {
      const plan = await planAt(db, sub, sub.nextRenewalOn);
      const final = paused(sub, sub.cancelEffectiveOn) ? null : finalMonth(plan, sub.cancelEffectiveOn);
      if (final) await billing.setFinalPrice(ref, plan, final.chargeCents);
      [sub] = await db
        .update(playPassSubscriptions)
        .set({ finalPriceSet: true, finalChargeCents: final?.chargeCents ?? 0, updatedAt: new Date() })
        .where(eq(playPassSubscriptions.id, sub.id))
        .returning();
      changed++;
    }

    // A pause begins.
    if (sub.pauseStartsOn && sub.resumeOn && !sub.pauseAppliedAt && sub.pauseStartsOn <= today && today < sub.resumeOn) {
      await billing.pause(ref, unix(sub.resumeOn));
      [sub] = await db.update(playPassSubscriptions).set({ pauseAppliedAt: new Date(), updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id)).returning();
      await audit(db, SYSTEM, { action: "playpass.paused", entityType: "family", entityId: sub.familyId, summary: `Play Pass paused until ${sub.resumeOn}` });
      changed++;
    }

    // Reactivation: charge the rest of the month (or through the end date), unless it ends instead.
    if (sub.resumeOn && sub.resumeOn <= today) {
      const resumeOn = sub.resumeOn;
      if (sub.pauseAppliedAt) await billing.resume(ref);
      const endsFirst = sub.cancelEffectiveOn && sub.cancelEffectiveOn < resumeOn;
      [sub] = await db.update(playPassSubscriptions).set({ pauseStartsOn: null, resumeOn: null, pauseAppliedAt: null, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id)).returning();
      if (!endsFirst) {
        const plan = await planAt(db, sub, resumeOn);
        const to = sub.cancelEffectiveOn && sub.cancelEffectiveOn < monthEnd(resumeOn) ? sub.cancelEffectiveOn : monthEnd(resumeOn);
        const part = partMonth(plan, resumeOn, to);
        const { invoiceRef } = await billing.chargeNow({
          subscriptionRef: ref,
          customerRef: sub.customerRef,
          localId: sub.id,
          amountCents: part.chargeCents,
          description: `${plan.name} Play Pass · ${part.days} days after your pause`,
          reason: "resume",
          idempotencyKey: `resume:${sub.id}:${resumeOn}`,
        });
        await db
          .insert(playPassCharges)
          .values({ subscriptionId: sub.id, familyId: sub.familyId, invoiceRef, reason: "resume", amountCents: part.chargeCents, status: "pending", planId: plan.id, allocationCents: part.allocationCents, periodStart: resumeOn })
          .onConflictDoNothing({ target: playPassCharges.invoiceRef });
        if (sub.provider === "test")
          await processEvent(db, "test", { id: `evt_${invoiceRef}`, type: "membership.invoice_paid", invoiceRef, subscriptionRef: ref, localId: sub.id, amountCents: part.chargeCents, reason: "resume", chargeRef: `tpi_${invoiceRef}` });
        await tell(db, sub, `Welcome back! Your ${plan.name} Play Pass has reactivated. We’ve charged ${usd(part.chargeCents)} for the rest of ${fmtDate(resumeOn, "MMMM")} and added ${usd(part.allocationCents)} to your balance.`);
      }
      changed++;
    }

    // Notice period over: the membership ends.
    if (sub.cancelEffectiveOn && sub.cancelEffectiveOn < today) {
      await db.update(playPassSubscriptions).set({ status: "canceled", canceledAt: new Date(), nextRenewalOn: null, updatedAt: new Date() }).where(eq(playPassSubscriptions.id, sub.id));
      await audit(db, SYSTEM, { action: "playpass.ended", entityType: "family", entityId: sub.familyId, summary: `Play Pass ended on ${sub.cancelEffectiveOn} after 30 days’ notice. Remaining wallet funds are kept.` });
      await tell(db, sub, "Your Play Pass has ended. Any remaining balance stays in your Yalla Wallet for Yalla experiences. We’d love to have you back anytime.");
      changed++;
    }
  }
  return changed;
}
