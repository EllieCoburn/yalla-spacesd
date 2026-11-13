/**
 * Play Pass administration: the overview, the member list, plan versions and the financial view.
 *
 * Reporting keeps cash and prepaid value apart. Membership payments are cash received; wallet
 * allocations and redemptions are prepaid value moving between "owed to families" and "earned",
 * not new cash, so they're never added to receipts.
 */
import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { auditLog, families, guardians, invoices, payments, playPassCharges, playPassPlans, playPassSubscriptions, programs, walletAllocations, walletEntries } from "@/lib/db/schema";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { firstOfNextMonth } from "./membership";

const monthRange = (month: string) => {
  const start = `${month}-01`;
  const end = firstOfNextMonth(start);
  return { start, end, from: zonedDateTime(start, "00:00"), to: zonedDateTime(end, "00:00") };
};

export async function overview(db: Executor, month = todayLA().slice(0, 7)) {
  const { from, to } = monthRange(month);
  const subs = await db
    .select({ s: playPassSubscriptions, plan: playPassPlans })
    .from(playPassSubscriptions)
    .innerJoin(playPassPlans, eq(playPassPlans.id, playPassSubscriptions.planId))
    .where(inArray(playPassSubscriptions.status, ["active", "past_due"]));
  const nextPlans = await db.select().from(playPassPlans);
  const byId = new Map(nextPlans.map((p) => [p.id, p]));
  const tiers = new Map<string, number>();
  for (const r of subs) tiers.set(r.plan.name, (tiers.get(r.plan.name) ?? 0) + 1);
  const renewing = subs.filter((r) => !r.s.cancelAtPeriodEnd);
  const [charges] = await db
    .select({
      paidN: sql<number>`count(*) filter (where status in ('paid','refunded','disputed'))::int`,
      paidCents: sql<number>`coalesce(sum(amount_cents) filter (where status in ('paid','refunded','disputed')), 0)::int`,
      failedN: sql<number>`count(*) filter (where status = 'failed')::int`,
    })
    .from(playPassCharges)
    .where(and(gte(playPassCharges.createdAt, from), lt(playPassCharges.createdAt, to)));
  const [liability] = await db.select({ n: sql<number>`coalesce(sum(${walletEntries.amountCents}), 0)::int` }).from(walletEntries);
  const [redeemed] = await db
    .select({ n: sql<number>`coalesce(-sum(${walletEntries.amountCents}) filter (where kind in ('booking_debit','booking_refund')), 0)::int` })
    .from(walletEntries)
    .where(and(gte(walletEntries.createdAt, from), lt(walletEntries.createdAt, to)));
  const [cancelled] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(playPassSubscriptions)
    .where(and(gte(playPassSubscriptions.canceledAt, from), lt(playPassSubscriptions.canceledAt, to)));
  const changes = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(playPassSubscriptions)
    .where(and(inArray(playPassSubscriptions.status, ["active", "past_due"]), sql`${playPassSubscriptions.nextPlanId} is not null`));
  const [changeLog] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.action, "playpass.plan_change"), gte(auditLog.at, from), lt(auditLog.at, to)));
  return {
    active: subs.filter((r) => r.s.status === "active").length,
    pastDue: subs.filter((r) => r.s.status === "past_due").length,
    tiers: [...tiers.entries()],
    mrrCents: renewing.reduce((s, r) => s + r.plan.priceCents, 0),
    upcomingRenewalCents: renewing.reduce((s, r) => s + (r.s.nextPlanId ? (byId.get(r.s.nextPlanId)?.priceCents ?? r.plan.priceCents) : r.plan.priceCents), 0),
    endingN: subs.filter((r) => r.s.cancelAtPeriodEnd).length,
    paymentsN: charges.paidN,
    paymentsCents: charges.paidCents,
    failedN: charges.failedN,
    liabilityCents: liability.n,
    redeemedCents: redeemed.n,
    cancelledN: cancelled.n,
    pendingChangesN: changes[0].n,
    changesThisMonthN: changeLog?.n ?? 0,
  };
}

/** Cash and prepaid value for a month, kept separate (see file note). */
export async function financialReport(db: Executor, month = todayLA().slice(0, 7)) {
  const { start, end, from, to } = monthRange(month);
  const [cash] = await db
    .select({
      collected: sql<number>`coalesce(sum(amount_cents) filter (where status in ('paid','refunded','disputed')), 0)::int`,
      refunded: sql<number>`coalesce(sum(refunded_cents), 0)::int`,
    })
    .from(playPassCharges)
    .where(and(gte(playPassCharges.createdAt, from), lt(playPassCharges.createdAt, to)));
  const [alloc] = await db
    .select({ n: sql<number>`coalesce(sum(${walletAllocations.amountCents}), 0)::int` })
    .from(walletAllocations)
    .where(and(gte(walletAllocations.createdAt, from), lt(walletAllocations.createdAt, to)));
  const [moves] = await db
    .select({
      redeemed: sql<number>`coalesce(-sum(amount_cents) filter (where kind = 'booking_debit'), 0)::int`,
      restored: sql<number>`coalesce(sum(amount_cents) filter (where kind = 'booking_refund'), 0)::int`,
      reversed: sql<number>`coalesce(-sum(amount_cents) filter (where kind = 'payment_reversal'), 0)::int`,
      adjusted: sql<number>`coalesce(sum(amount_cents) filter (where kind = 'adjustment'), 0)::int`,
    })
    .from(walletEntries)
    .where(and(gte(walletEntries.createdAt, from), lt(walletEntries.createdAt, to)));
  const [closing] = await db
    .select({ n: sql<number>`coalesce(sum(${walletEntries.amountCents}), 0)::int` })
    .from(walletEntries)
    .where(lt(walletEntries.createdAt, to));
  // Card payments on booking invoices: with Play Pass funds on the same invoice (members' top-ups) or without.
  const cardRows = await db
    .select({
      amount: payments.amountCents,
      withWallet: sql<boolean>`exists (select 1 from payments w where w.invoice_id = ${payments.invoiceId} and w.method = 'wallet' and w.status = 'succeeded')`,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.status, "succeeded"), eq(payments.method, "card"), sql`${invoices.bookingId} is not null`, gte(payments.succeededAt, from), lt(payments.succeededAt, to)));
  return {
    month,
    periodStart: start,
    periodEnd: addDaysISO(end, -1),
    membershipCashCents: cash.collected - cash.refunded,
    membershipRefundsCents: cash.refunded,
    allocatedCents: alloc.n,
    redeemedCents: moves.redeemed - moves.restored,
    reversedCents: moves.reversed,
    adjustedCents: moves.adjusted,
    unredeemedCents: closing.n,
    directBookingCents: cardRows.filter((r) => !r.withWallet).reduce((s, r) => s + r.amount, 0),
    memberCardCents: cardRows.filter((r) => r.withWallet).reduce((s, r) => s + r.amount, 0),
  };
}

/** Families with a Play Pass, or with a wallet balance, newest first. */
export async function memberList(db: Executor, q?: string) {
  const subs = await db
    .select({ s: playPassSubscriptions, plan: playPassPlans, f: families })
    .from(playPassSubscriptions)
    .innerJoin(playPassPlans, eq(playPassPlans.id, playPassSubscriptions.planId))
    .innerJoin(families, eq(families.id, playPassSubscriptions.familyId))
    .where(
      and(
        sql`${playPassSubscriptions.status} <> 'abandoned'`,
        q
          ? or(
              ilike(families.name, `%${q}%`),
              sql`exists (select 1 from guardians g where g.family_id = ${families.id} and (g.email ilike ${`%${q}%`} or (g.first_name || ' ' || g.last_name) ilike ${`%${q}%`}))`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(playPassSubscriptions.createdAt));
  // Keep each family's latest subscription.
  const seen = new Set<string>();
  const latest = subs.filter((r) => (seen.has(r.f.id) ? false : (seen.add(r.f.id), true)));
  const balances = latest.length
    ? await db
        .select({ familyId: walletEntries.familyId, n: sql<number>`sum(${walletEntries.amountCents})::int` })
        .from(walletEntries)
        .where(
          inArray(
            walletEntries.familyId,
            latest.map((r) => r.f.id),
          ),
        )
        .groupBy(walletEntries.familyId)
    : [];
  const bal = new Map(balances.map((b) => [b.familyId, b.n]));
  return latest.map((r) => ({ ...r, balanceCents: bal.get(r.f.id) ?? 0 }));
}

export async function familyEmail(db: Executor, familyId: string) {
  const [g] = await db.select().from(guardians).where(and(eq(guardians.familyId, familyId), eq(guardians.isPrimary, true)));
  return g ?? null;
}

/**
 * A new price or allocation for a tier. Creates a new plan version for new members and retires the
 * old one from sale; existing members stay on the version they joined (their Stripe price is
 * unchanged), so nobody's price changes silently.
 */
export async function newPlanVersion(db: DB, actor: Actor, input: { tier: string; name: string; priceCents: number; allocationCents: number; minExperiences: number }) {
  if (input.priceCents <= 0 || input.allocationCents <= 0) throw new OpsError("invalid", "Enter a price and a monthly amount above zero.");
  if (!Number.isInteger(input.minExperiences) || input.minExperiences < 1) throw new OpsError("invalid", "Enter how many experiences the pass covers, at least 1.");
  if (!input.name.trim()) throw new OpsError("invalid", "Give the pass a name.");
  return db.transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(playPassPlans)
      .where(and(eq(playPassPlans.tier, input.tier), eq(playPassPlans.active, true)));
    if (old) await tx.update(playPassPlans).set({ active: false, retiredAt: new Date() }).where(eq(playPassPlans.id, old.id));
    const [p] = await tx
      .insert(playPassPlans)
      .values({ tier: input.tier, name: input.name.trim(), priceCents: input.priceCents, allocationCents: input.allocationCents, minExperiences: input.minExperiences, sortOrder: old?.sortOrder ?? 9, createdBy: actor.name })
      .returning();
    await audit(tx, actor, {
      action: "playpass.plan_version",
      entityType: "setting",
      entityId: p.id,
      summary: `${p.name} for new members: $${p.priceCents / 100}/month with $${p.allocationCents / 100} to spend${old ? ` (was $${old.priceCents / 100} with $${old.allocationCents / 100})` : ""}`,
    });
    return p;
  });
}

/** Which programs accept Play Pass funds. */
export async function setProgramEligibility(db: Executor, actor: Actor, programId: string, flags: { eligible: boolean; redemption: boolean }) {
  const [p] = await db
    .update(programs)
    .set({ playPassEligible: flags.eligible, walletRedemptionAllowed: flags.redemption, updatedAt: new Date() })
    .where(eq(programs.id, programId))
    .returning();
  if (!p) throw new OpsError("not_found", "Program not found.");
  await audit(db, actor, {
    action: "playpass.eligibility",
    entityType: "program",
    entityId: p.id,
    summary: `${p.name}: Play Pass eligible ${flags.eligible ? "yes" : "no"}, wallet redemption ${flags.redemption ? "allowed" : "not allowed"}`,
  });
}

/** Each family's balance, oldest unused funds first (for reviewing rollover before any policy applies). */
export async function outstandingBalances(db: Executor) {
  return db
    .select({ familyId: walletEntries.familyId, name: families.name, n: sql<number>`sum(${walletEntries.amountCents})::int`, oldest: sql<string>`min(${walletEntries.createdAt})` })
    .from(walletEntries)
    .innerJoin(families, eq(families.id, walletEntries.familyId))
    .groupBy(walletEntries.familyId, families.name)
    .having(sql`sum(${walletEntries.amountCents}) <> 0`)
    .orderBy(sql`min(${walletEntries.createdAt})`);
}
