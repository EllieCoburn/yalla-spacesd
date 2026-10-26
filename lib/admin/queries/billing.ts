import "server-only";
import { and, desc, eq, gte, ilike, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { bookings, credits, discounts, families, guardians, invoiceLines, invoices, memberships, children, payments, programs, refunds, scheduledCharges } from "@/lib/db/schema";
import { creditBalance, invoiceTotals } from "@/lib/ops/billing";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";

export type Period = { from: string; to: string };

export function periodFrom(sp: { from?: string; to?: string; period?: string }): Period {
  const today = todayLA();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (sp.from && iso.test(sp.from) && sp.to && iso.test(sp.to)) return { from: sp.from, to: sp.to };
  if (sp.period === "30d") return { from: addDaysISO(today, -29), to: today };
  if (sp.period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

const start = (d: string) => zonedDateTime(d, "00:00");
const end = (d: string) => zonedDateTime(addDaysISO(d, 1), "00:00");

export async function billingOverview(db: Executor, p: Period) {
  const [collected] = await db
    .select({ n: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), sql`${payments.method} <> 'credit'`, gte(payments.succeededAt, start(p.from)), lte(payments.succeededAt, end(p.to))));
  const [offline] = await db
    .select({ n: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), eq(payments.provider, "offline"), gte(payments.succeededAt, start(p.from)), lte(payments.succeededAt, end(p.to))));
  const [refunded] = await db
    .select({ n: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(refunds)
    .where(and(eq(refunds.status, "succeeded"), gte(refunds.completedAt, start(p.from)), lte(refunds.completedAt, end(p.to))));
  const [refundIssues] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(refunds)
    .where(inArray(refunds.status, ["pending", "failed"]));
  const open = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.status, "open"));
  const totals = await invoiceTotals(
    db,
    open.map((o) => o.id),
  );
  const withBalance = [...totals.values()].filter((t) => t.balance > 0);
  const [creditsOut] = await db.execute<{ n: number; families: number }>(sql`
    SELECT coalesce(sum(bal), 0)::int AS n, count(*)::int AS families FROM (
      SELECT family_id, sum(amount_cents) AS bal FROM credits GROUP BY family_id HAVING sum(amount_cents) > 0
    ) t`);
  const today = todayLA();
  const [scheduled] = await db
    .select({ n: sql<number>`coalesce(sum(${scheduledCharges.amountCents}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(scheduledCharges)
    .where(and(eq(scheduledCharges.status, "scheduled"), gte(scheduledCharges.scheduledFor, today), lte(scheduledCharges.scheduledFor, addDaysISO(today, 30))));
  const [due] = await db
    .select({ n: sql<number>`coalesce(sum(${scheduledCharges.amountCents}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(scheduledCharges)
    .where(and(eq(scheduledCharges.status, "scheduled"), lte(scheduledCharges.scheduledFor, today)));
  const [failed] = await db
    .select({ count: sql<number>`count(*)::int`, n: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.status, "failed"), eq(invoices.status, "open")));
  const [disputes] = await db.select({ count: sql<number>`count(*)::int`, n: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` }).from(payments).where(isNotNull(payments.disputeStatus));
  return {
    collected: collected.n,
    collectedCount: collected.count,
    offline: offline.n,
    refunded: refunded.n,
    refundedCount: refunded.count,
    refundIssues: refundIssues.count,
    unpaid: withBalance.reduce((s, t) => s + t.balance, 0),
    unpaidCount: withBalance.length,
    credits: creditsOut.n,
    creditFamilies: creditsOut.families,
    scheduled: scheduled.n,
    scheduledCount: scheduled.count,
    dueNow: due.n,
    dueNowCount: due.count,
    failed: failed.n,
    failedCount: failed.count,
    disputes: disputes.count,
    disputeAmount: disputes.n,
  };
}

export async function listInvoices(db: Executor, f: { status?: string; q?: string; from?: string; to?: string; familyId?: string; limit?: number }) {
  const rows = await db
    .select({ i: invoices, f: families })
    .from(invoices)
    .innerJoin(families, eq(families.id, invoices.familyId))
    .where(
      and(
        f.status && f.status !== "all" ? eq(invoices.status, f.status) : undefined,
        f.familyId ? eq(invoices.familyId, f.familyId) : undefined,
        f.q ? or(ilike(families.name, `%${f.q}%`), ilike(invoices.number, `%${f.q}%`), ilike(invoices.description, `%${f.q}%`)) : undefined,
        f.from ? gte(invoices.issuedAt, start(f.from)) : undefined,
        f.to ? lte(invoices.issuedAt, end(f.to)) : undefined,
      ),
    )
    .orderBy(desc(invoices.issuedAt))
    .limit(f.limit ?? 200);
  const totals = await invoiceTotals(
    db,
    rows.map((r) => r.i.id),
  );
  return rows.map((r) => ({ ...r, t: totals.get(r.i.id)! }));
}

export async function invoiceDetail(db: Executor, id: string) {
  const [row] = await db.select({ i: invoices, f: families }).from(invoices).innerJoin(families, eq(families.id, invoices.familyId)).where(eq(invoices.id, id));
  if (!row) return null;
  const [lines, pays, refs, guards, t, credit] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(invoiceLines.createdAt),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(desc(payments.createdAt)),
    db.select().from(refunds).where(eq(refunds.invoiceId, id)).orderBy(desc(refunds.createdAt)),
    db.select().from(guardians).where(eq(guardians.familyId, row.i.familyId)),
    invoiceTotals(db, [id]),
    creditBalance(db, row.i.familyId),
  ]);
  const booking = row.i.bookingId ? (await db.select().from(bookings).where(eq(bookings.id, row.i.bookingId)))[0] : null;
  const membership = row.i.membershipId
    ? (await db.select({ m: memberships, c: children }).from(memberships).innerJoin(children, eq(children.id, memberships.childId)).where(eq(memberships.id, row.i.membershipId)))[0]
    : null;
  return { invoice: row.i, family: row.f, lines, payments: pays, refunds: refs, guardians: guards, totals: t.get(id)!, credit, booking, membership };
}

export async function listPayments(db: Executor, f: { status?: string; period: Period; method?: string }) {
  return db
    .select({ p: payments, i: invoices, f: families })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(families, eq(families.id, payments.familyId))
    .where(
      and(
        f.status && f.status !== "all" ? eq(payments.status, f.status) : undefined,
        f.method ? eq(payments.method, f.method) : undefined,
        gte(payments.createdAt, start(f.period.from)),
        lte(payments.createdAt, end(f.period.to)),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(300);
}

export async function listRefunds(db: Executor, period: Period, status?: string) {
  return db
    .select({ r: refunds, i: invoices, f: families })
    .from(refunds)
    .innerJoin(invoices, eq(invoices.id, refunds.invoiceId))
    .innerJoin(families, eq(families.id, invoices.familyId))
    .where(and(status && status !== "all" ? eq(refunds.status, status) : undefined, gte(refunds.createdAt, start(period.from)), lte(refunds.createdAt, end(period.to))))
    .orderBy(desc(refunds.createdAt))
    .limit(300);
}

export async function creditLedger(db: Executor) {
  const balances = await db.execute<{ family_id: string; name: string; balance: number }>(sql`
    SELECT c.family_id, f.name, sum(c.amount_cents)::int AS balance FROM credits c JOIN families f ON f.id = c.family_id
    GROUP BY c.family_id, f.name HAVING sum(c.amount_cents) <> 0 ORDER BY f.name`);
  const recent = await db.select({ c: credits, f: families }).from(credits).innerJoin(families, eq(families.id, credits.familyId)).orderBy(desc(credits.createdAt)).limit(100);
  return { balances, recent };
}

export async function listScheduled(db: Executor, status = "scheduled") {
  return db
    .select({ c: scheduledCharges, f: families })
    .from(scheduledCharges)
    .innerJoin(families, eq(families.id, scheduledCharges.familyId))
    .where(status === "all" ? undefined : eq(scheduledCharges.status, status))
    .orderBy(scheduledCharges.scheduledFor)
    .limit(400);
}

export async function listDiscounts(db: Executor) {
  return db.select({ d: discounts, p: programs }).from(discounts).leftJoin(programs, eq(programs.id, discounts.programId)).orderBy(desc(discounts.createdAt));
}

export async function familyOptions(db: Executor) {
  return db.select({ id: families.id, name: families.name }).from(families).where(eq(families.status, "active")).orderBy(families.name);
}
