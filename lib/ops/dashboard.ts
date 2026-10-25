/**
 * Dashboard queries. Every number here is computed from live records and links to the records
 * behind it. Money figures are kept separate: collected, refunded, unpaid and scheduled.
 */
import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { auditLog, bookingItems, bookings, children, families, invoices, payments, programs, refunds, scheduledCharges, sessions, waitlistEntries, attendanceRecords } from "@/lib/db/schema";
import { addDaysISO, zonedDateTime } from "@/lib/time";
import { availabilityFor } from "./capacity";
import { invoiceTotals } from "./billing";
import { outstandingForChildren } from "./forms";
import { membershipsForCohortDay } from "./memberships";

export type DashboardFilter = { date: string; programId?: string; locationId?: string };

export async function daySessions(db: Executor, f: DashboardFilter) {
  const rows = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(
      and(
        eq(sessions.localDate, f.date),
        f.programId ? eq(sessions.programId, f.programId) : undefined,
        f.locationId ? eq(sessions.locationId, f.locationId) : undefined,
        sql`${programs.status} <> 'archived'`,
      ),
    )
    .orderBy(sessions.startsAt);
  const avail = await availabilityFor(
    db,
    rows.map((r) => r.s.id),
  );
  const att = rows.length
    ? await db
        .select({ sessionId: attendanceRecords.sessionId, status: attendanceRecords.status, n: sql<number>`count(*)::int` })
        .from(attendanceRecords)
        .where(
          inArray(
            attendanceRecords.sessionId,
            rows.map((r) => r.s.id),
          ),
        )
        .groupBy(attendanceRecords.sessionId, attendanceRecords.status)
    : [];
  return rows.map((r) => {
    const a = avail.get(r.s.id)!;
    const checkedIn = att.filter((x) => x.sessionId === r.s.id && (x.status === "checked_in" || x.status === "checked_out")).reduce((s, x) => s + x.n, 0);
    const absent = att.filter((x) => x.sessionId === r.s.id && x.status === "absent").reduce((s, x) => s + x.n, 0);
    return { session: r.s, program: r.p, availability: a, expected: a.occupancy.booked + a.occupancy.members, checkedIn, absent };
  });
}

export async function expectedChildIds(db: Executor, date: string, endDate = date) {
  const rows = await db
    .selectDistinct({ childId: bookingItems.childId })
    .from(bookingItems)
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .where(and(eq(bookingItems.status, "confirmed"), gte(sessions.localDate, date), lte(sessions.localDate, endDate)));
  const ids = new Set(rows.map((r) => r.childId).filter(Boolean) as string[]);
  // Members expected on Club Yalla sessions in the range.
  const clubSessions = await db
    .select({ s: sessions })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(programs.kind, "membership"), gte(sessions.localDate, date), lte(sessions.localDate, endDate), eq(sessions.status, "scheduled")));
  const seen = new Set<string>();
  for (const { s } of clubSessions) {
    if (!s.cohortId) continue;
    const key = `${s.cohortId}:${s.localDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const m of await membershipsForCohortDay(db, s.cohortId, s.programId, s.localDate)) ids.add(m.c.id);
  }
  return [...ids];
}

export async function dashboard(db: Executor, f: DashboardFilter, opts: { money: boolean; paperwork: boolean }) {
  const today = await daySessions(db, f);
  const expectedFamilies = new Set<string>();
  const expectedIds = await expectedChildIds(db, f.date);
  if (expectedIds.length) for (const r of await db.select({ familyId: children.familyId }).from(children).where(inArray(children.id, expectedIds))) expectedFamilies.add(r.familyId);

  // Nearly full in the next 14 days.
  const upcoming = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(
      and(
        gte(sessions.localDate, f.date),
        lte(sessions.localDate, addDaysISO(f.date, 14)),
        eq(sessions.status, "scheduled"),
        eq(programs.status, "published"),
        f.programId ? eq(sessions.programId, f.programId) : undefined,
        f.locationId ? eq(sessions.locationId, f.locationId) : undefined,
      ),
    )
    .orderBy(sessions.startsAt);
  const upAvail = await availabilityFor(
    db,
    upcoming.map((u) => u.s.id),
  );
  const nearlyFull = upcoming
    .map((u) => ({ ...u, a: upAvail.get(u.s.id)! }))
    .filter((u) => u.p.kind !== "membership" && u.a.remaining <= u.p.lowAvailabilityThreshold)
    .slice(0, 8);

  const since = zonedDateTime(addDaysISO(f.date, -7), "00:00");
  const recentBookings = await db
    .select({ b: bookings, f: families })
    .from(bookings)
    .innerJoin(families, eq(families.id, bookings.familyId))
    .where(and(gte(bookings.createdAt, since), inArray(bookings.status, ["confirmed", "pending_payment", "requested", "needs_attention"])))
    .orderBy(desc(bookings.createdAt))
    .limit(8);
  const recentCancellations = await db
    .select({ b: bookings, f: families })
    .from(bookings)
    .innerJoin(families, eq(families.id, bookings.familyId))
    .where(and(gte(bookings.cancelledAt, since), eq(bookings.status, "cancelled")))
    .orderBy(desc(bookings.cancelledAt))
    .limit(6);
  const [{ waiting }] = await db
    .select({ waiting: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(inArray(waitlistEntries.status, ["waiting", "offered"]));
  const pendingRequests = await db.select({ b: bookings, f: families }).from(bookings).innerJoin(families, eq(families.id, bookings.familyId)).where(eq(bookings.status, "requested"));
  const needsAttention = await db.select({ b: bookings, f: families }).from(bookings).innerJoin(families, eq(families.id, bookings.familyId)).where(eq(bookings.status, "needs_attention"));

  let paperwork: Awaited<ReturnType<typeof outstandingForChildren>> = [];
  if (opts.paperwork) paperwork = await outstandingForChildren(db, await expectedChildIds(db, f.date, addDaysISO(f.date, 7)), f.date);

  let money: null | { collected: number; refunded: number; unpaid: number; unpaidCount: number; scheduled: number; failed: { count: number; amount: number } } = null;
  if (opts.money) {
    const monthStart = zonedDateTime(f.date.slice(0, 8) + "01", "00:00");
    const [col] = await db
      .select({ n: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
      .from(payments)
      .where(and(eq(payments.status, "succeeded"), sql`${payments.method} <> 'credit'`, gte(payments.succeededAt, monthStart)));
    const [ref] = await db
      .select({ n: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
      .from(refunds)
      .where(and(eq(refunds.status, "succeeded"), gte(refunds.completedAt, monthStart)));
    const open = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.status, "open"));
    const totals = await invoiceTotals(
      db,
      open.map((o) => o.id),
    );
    const unpaid = [...totals.values()].reduce((s, t) => s + Math.max(t.balance, 0), 0);
    const [sch] = await db
      .select({ n: sql<number>`coalesce(sum(${scheduledCharges.amountCents}), 0)::int` })
      .from(scheduledCharges)
      .where(and(eq(scheduledCharges.status, "scheduled"), gte(scheduledCharges.scheduledFor, f.date), lt(scheduledCharges.scheduledFor, addDaysISO(f.date, 31))));
    const [failed] = await db
      .select({ count: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.status, "failed"), eq(invoices.status, "open")));
    money = { collected: col.n, refunded: ref.n, unpaid, unpaidCount: [...totals.values()].filter((t) => t.balance > 0).length, scheduled: sch.n, failed };
  }

  const activity = await db.select().from(auditLog).where(eq(auditLog.actorType, "staff")).orderBy(desc(auditLog.at)).limit(10);

  return {
    today,
    expectedChildren: expectedIds.length,
    expectedFamilies: expectedFamilies.size,
    nearlyFull,
    recentBookings,
    recentCancellations,
    waiting,
    pendingRequests,
    needsAttention,
    paperwork,
    money,
    activity,
  };
}
