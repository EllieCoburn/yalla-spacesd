/**
 * Read models for the admin Bookings & Sessions screens.
 * Payment and paperwork status are derived from the ledger and form submissions — never stored.
 */
import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import {
  auditLog,
  bookingEvents,
  bookingItems,
  bookings,
  capacityOverrides,
  children,
  cohorts,
  families,
  guardians,
  invoices,
  locations,
  programs,
  sessions,
  staffUsers,
  waitlistEntries,
  authorizedPickups,
  emergencyContacts,
} from "@/lib/db/schema";
import { invoiceTotals, type InvoiceTotals } from "@/lib/ops/billing";
import { availabilityFor } from "@/lib/ops/capacity";
import { paperworkStatus, type PaperworkItem } from "@/lib/ops/forms";
import { membershipsForCohortDay } from "@/lib/ops/memberships";

export type PaymentState = "none" | "unpaid" | "partial" | "paid" | "free";

export const PAYMENT_STATE: Record<PaymentState, { label: string; tone: "positive" | "warning" | "critical" | "muted" | "neutral"; icon: "check" | "clock" | "alert" | "minus" | "dot" }> = {
  paid: { label: "Paid", tone: "positive", icon: "check" },
  partial: { label: "Partly paid", tone: "warning", icon: "clock" },
  unpaid: { label: "Unpaid", tone: "warning", icon: "clock" },
  none: { label: "No invoice", tone: "muted", icon: "minus" },
  free: { label: "No charge", tone: "neutral", icon: "dot" },
};

/** Derives one payment state from all non-void invoices attached to a booking. */
export function derivePaymentState(totals: Pick<InvoiceTotals, "total" | "paid" | "creditApplied" | "refunded" | "balance">[]): PaymentState {
  if (!totals.length) return "none";
  const total = totals.reduce((s, t) => s + t.total, 0);
  const balance = totals.reduce((s, t) => s + t.balance, 0);
  const received = totals.reduce((s, t) => s + t.paid + t.creditApplied - t.refunded, 0);
  if (total <= 0) return "free";
  if (balance <= 0) return "paid";
  if (received > 0) return "partial";
  return "unpaid";
}

export type BookingFilters = {
  program?: string;
  from?: string;
  to?: string;
  location?: string;
  cohort?: string;
  q?: string;
  status?: string;
  payment?: string;
  paperwork?: string;
};

export type BookingRow = {
  id: string;
  reference: string;
  status: string;
  source: string;
  createdAt: Date;
  familyId: string;
  familyName: string;
  children: string[];
  programs: string[];
  firstSession: { localDate: string; startsAt: Date; endsAt: Date; id: string } | null;
  itemCount: number;
  payment: PaymentState;
  paymentTotals: { total: number; balance: number };
  paperwork: "complete" | "issues" | null;
};

const PAGE = 25;

export async function listBookings(db: Executor, f: BookingFilters, page = 1, opts: { paperwork: boolean } = { paperwork: true }) {
  const sessionFilters = [
    f.program ? eq(sessions.programId, f.program) : undefined,
    f.from ? gte(sessions.localDate, f.from) : undefined,
    f.to ? lte(sessions.localDate, f.to) : undefined,
    f.location ? eq(sessions.locationId, f.location) : undefined,
    f.cohort ? or(eq(sessions.cohortId, f.cohort), eq(children.cohortId, f.cohort)) : undefined,
  ].filter(Boolean);

  const term = f.q?.trim() ? `%${f.q.trim()}%` : null;
  const where = and(
    f.status ? eq(bookings.status, f.status) : ne(bookings.status, "expired"),
    term
      ? or(
          ilike(bookings.reference, term),
          ilike(families.name, term),
          sql`EXISTS (SELECT 1 FROM booking_items bi JOIN children c ON c.id = bi.child_id WHERE bi.booking_id = ${bookings.id} AND (c.first_name ILIKE ${term} OR c.last_name ILIKE ${term} OR c.preferred_name ILIKE ${term}))`,
          sql`EXISTS (SELECT 1 FROM guardians g WHERE g.family_id = ${bookings.familyId} AND (g.first_name ILIKE ${term} OR g.last_name ILIKE ${term} OR g.email ILIKE ${term}))`,
        )
      : undefined,
    sessionFilters.length
      ? inArray(
          bookings.id,
          db
            .select({ id: bookingItems.bookingId })
            .from(bookingItems)
            .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
            .leftJoin(children, eq(children.id, bookingItems.childId))
            .where(and(...sessionFilters)),
        )
      : undefined,
  );

  const base = await db
    .select({ b: bookings, familyName: families.name })
    .from(bookings)
    .innerJoin(families, eq(families.id, bookings.familyId))
    .where(where)
    .orderBy(desc(bookings.createdAt))
    .limit(2000);

  const ids = base.map((r) => r.b.id);
  const payments = await paymentStates(db, ids);
  let rows = base;
  if (f.payment) rows = rows.filter((r) => payments.get(r.b.id)!.state === f.payment);

  // Paperwork is expensive; compute for the filtered set only when filtering by it, else just for the page.
  let paperwork = new Map<string, "complete" | "issues">();
  if (f.paperwork && opts.paperwork) {
    paperwork = await paperworkStates(db, rows.map((r) => r.b.id));
    rows = rows.filter((r) => paperwork.get(r.b.id) === f.paperwork);
  }

  const total = rows.length;
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const pageIds = pageRows.map((r) => r.b.id);
  if (!f.paperwork && opts.paperwork) paperwork = await paperworkStates(db, pageIds);

  const items = pageIds.length
    ? await db
        .select({ bookingId: bookingItems.bookingId, status: bookingItems.status, s: sessions, programName: programs.name, child: children })
        .from(bookingItems)
        .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
        .innerJoin(programs, eq(programs.id, sessions.programId))
        .leftJoin(children, eq(children.id, bookingItems.childId))
        .where(inArray(bookingItems.bookingId, pageIds))
        .orderBy(asc(sessions.startsAt))
    : [];

  const out: BookingRow[] = pageRows.map(({ b, familyName }) => {
    const its = items.filter((i) => i.bookingId === b.id);
    const live = its.filter((i) => i.status !== "moved");
    const first = (live.find((i) => i.status !== "cancelled") ?? live[0])?.s;
    const p = payments.get(b.id)!;
    return {
      id: b.id,
      reference: b.reference,
      status: b.status,
      source: b.source,
      createdAt: b.createdAt,
      familyId: b.familyId,
      familyName,
      children: [...new Set(live.map((i) => (i.child ? i.child.preferredName || i.child.firstName : null)).filter(Boolean) as string[])],
      programs: [...new Set(live.map((i) => i.programName))],
      firstSession: first ? { id: first.id, localDate: first.localDate, startsAt: first.startsAt, endsAt: first.endsAt } : null,
      itemCount: live.filter((i) => i.status !== "cancelled").length,
      payment: p.state,
      paymentTotals: { total: p.total, balance: p.balance },
      paperwork: opts.paperwork ? (paperwork.get(b.id) ?? null) : null,
    };
  });
  return { rows: out, total, page, pages: Math.max(1, Math.ceil(total / PAGE)) };
}

export async function paymentStates(db: Executor, bookingIds: string[]) {
  const out = new Map<string, { state: PaymentState; total: number; balance: number; invoices: { id: string; number: string; status: string; totals: InvoiceTotals }[] }>();
  for (const id of bookingIds) out.set(id, { state: "none", total: 0, balance: 0, invoices: [] });
  if (!bookingIds.length) return out;
  const invs = await db
    .select()
    .from(invoices)
    .where(and(inArray(invoices.bookingId, bookingIds), ne(invoices.status, "void")));
  const totals = await invoiceTotals(
    db,
    invs.map((i) => i.id),
  );
  for (const inv of invs) {
    const e = out.get(inv.bookingId!)!;
    e.invoices.push({ id: inv.id, number: inv.number, status: inv.status, totals: totals.get(inv.id)! });
  }
  for (const e of out.values()) {
    const ts = e.invoices.map((i) => i.totals);
    e.state = derivePaymentState(ts);
    e.total = ts.reduce((s, t) => s + t.total, 0);
    e.balance = ts.reduce((s, t) => s + t.balance, 0);
  }
  return out;
}

/** "issues" when any non-informational requirement for the booked children/programs is incomplete. */
export async function paperworkStates(db: Executor, bookingIds: string[]) {
  const out = new Map<string, "complete" | "issues">();
  if (!bookingIds.length) return out;
  const rows = await db
    .select({ bookingId: bookingItems.bookingId, familyId: bookings.familyId, childId: bookingItems.childId, programId: sessions.programId, sessionId: sessions.id, localDate: sessions.localDate })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .where(and(inArray(bookingItems.bookingId, bookingIds), inArray(bookingItems.status, ["held", "confirmed"])));
  const byBooking = new Map<string, typeof rows>();
  for (const r of rows) byBooking.set(r.bookingId, [...(byBooking.get(r.bookingId) ?? []), r]);
  for (const id of bookingIds) {
    const rs = byBooking.get(id);
    if (!rs?.length) {
      out.set(id, "complete");
      continue;
    }
    const status = await paperworkStatus(db, {
      familyId: rs[0].familyId,
      childIds: [...new Set(rs.map((r) => r.childId).filter(Boolean) as string[])],
      programIds: [...new Set(rs.map((r) => r.programId))],
      sessionIds: [...new Set(rs.map((r) => r.sessionId))],
      bookingId: id,
      onDate: rs.map((r) => r.localDate).sort()[0],
    });
    const issues = [...status.values()].flat().some((i) => i.state !== "complete" && i.enforcement !== "informational");
    out.set(id, issues ? "issues" : "complete");
  }
  return out;
}

export async function filterOptions(db: Executor) {
  const [progs, locs, cohs] = await Promise.all([
    db.select({ id: programs.id, name: programs.name, status: programs.status }).from(programs).orderBy(asc(programs.name)),
    db.select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.active, true)),
    db.select({ id: cohorts.id, name: cohorts.name }).from(cohorts).orderBy(asc(cohorts.sortOrder)),
  ]);
  return { programs: progs, locations: locs, cohorts: cohs };
}

/* ── Booking detail ── */

export async function bookingDetail(db: Executor, id: string) {
  const [row] = await db.select({ b: bookings, f: families }).from(bookings).innerJoin(families, eq(families.id, bookings.familyId)).where(eq(bookings.id, id));
  if (!row) return null;
  const items = await db
    .select({ item: bookingItems, session: sessions, program: programs, child: children, location: locations, cohort: cohorts })
    .from(bookingItems)
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .leftJoin(children, eq(children.id, bookingItems.childId))
    .leftJoin(locations, eq(locations.id, sessions.locationId))
    .leftJoin(cohorts, eq(cohorts.id, sessions.cohortId))
    .where(eq(bookingItems.bookingId, id))
    .orderBy(asc(sessions.startsAt), asc(bookingItems.createdAt));
  const guardianRows = await db.select().from(guardians).where(eq(guardians.familyId, row.f.id)).orderBy(desc(guardians.isPrimary));
  const familyChildren = await db.select().from(children).where(and(eq(children.familyId, row.f.id), eq(children.status, "active"))).orderBy(asc(children.birthDate));
  const events = await db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, id)).orderBy(desc(bookingEvents.at));
  const auditRows = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "booking"), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.at))
    .limit(50);
  const overrides = await db.select().from(capacityOverrides).where(eq(capacityOverrides.bookingId, id));
  const pay = (await paymentStates(db, [id])).get(id)!;
  const pickups = await db.select().from(authorizedPickups).where(eq(authorizedPickups.familyId, row.f.id));
  const emergency = await db.select().from(emergencyContacts).where(eq(emergencyContacts.familyId, row.f.id));
  const active = items.filter((i) => i.item.status === "held" || i.item.status === "confirmed");
  const childIds = [...new Set(items.map((i) => i.item.childId).filter(Boolean) as string[])];
  const paperwork = await paperworkStatus(db, {
    familyId: row.f.id,
    childIds,
    programIds: [...new Set(active.map((i) => i.program.id))],
    sessionIds: [...new Set(active.map((i) => i.session.id))],
    bookingId: id,
    onDate: (active[0] ?? items[0])?.session.localDate,
  });
  const staffIds = [...new Set(overrides.map((o) => o.staffId).concat(row.b.createdByStaffId ? [row.b.createdByStaffId] : []))];
  const staffNames = new Map(
    (staffIds.length ? await db.select({ id: staffUsers.id, name: staffUsers.name }).from(staffUsers).where(inArray(staffUsers.id, staffIds)) : []).map((s) => [s.id, s.name]),
  );
  return { booking: row.b, family: row.f, items, guardians: guardianRows, familyChildren, events, audit: auditRows, overrides, payment: pay, pickups, emergency, paperwork, staffNames };
}

/** Sessions a booked item could move to: same program, upcoming, scheduled, with live remaining spots. */
export async function moveTargets(db: Executor, programId: string, excludeSessionId: string, from: string) {
  const rows = await db
    .select({ s: sessions, cohortName: cohorts.name })
    .from(sessions)
    .leftJoin(cohorts, eq(cohorts.id, sessions.cohortId))
    .where(and(eq(sessions.programId, programId), ne(sessions.id, excludeSessionId), gte(sessions.localDate, from), eq(sessions.status, "scheduled")))
    .orderBy(asc(sessions.startsAt))
    .limit(60);
  const avail = await availabilityFor(
    db,
    rows.map((r) => r.s.id),
  );
  return rows.map((r) => ({ ...r.s, cohortName: r.cohortName, remaining: avail.get(r.s.id)!.remaining }));
}

/* ── Session detail ── */

export async function sessionDetail(db: Executor, id: string) {
  const [row] = await db
    .select({ s: sessions, p: programs, location: locations, cohort: cohorts })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .leftJoin(locations, eq(locations.id, sessions.locationId))
    .leftJoin(cohorts, eq(cohorts.id, sessions.cohortId))
    .where(eq(sessions.id, id));
  if (!row) return null;
  const avail = (await availabilityFor(db, [id])).get(id)!;
  const pool = row.s.capacityPoolId ? (await db.execute<{ name: string; capacity: number }>(sql`SELECT name, capacity FROM capacity_pools WHERE id = ${row.s.capacityPoolId}`))[0] : null;
  const overrides = await db
    .select({ o: capacityOverrides, staffName: staffUsers.name, reference: bookings.reference })
    .from(capacityOverrides)
    .leftJoin(staffUsers, eq(staffUsers.id, capacityOverrides.staffId))
    .leftJoin(bookings, eq(bookings.id, capacityOverrides.bookingId))
    .where(eq(capacityOverrides.sessionId, id))
    .orderBy(desc(capacityOverrides.createdAt));
  const attendees = await db
    .select({ item: bookingItems, b: bookings, child: children, familyName: families.name })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(families, eq(families.id, bookings.familyId))
    .leftJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookingItems.sessionId, id), inArray(bookingItems.status, ["held", "confirmed", "cancelled"])))
    .orderBy(asc(families.name));
  const members = row.s.cohortId ? await membershipsForCohortDay(db, row.s.cohortId, row.s.programId, row.s.localDate) : [];
  const memberFamilies = members.length
    ? new Map((await db.select({ id: families.id, name: families.name }).from(families).where(inArray(families.id, [...new Set(members.map((m) => m.m.familyId))]))).map((f) => [f.id, f.name]))
    : new Map<string, string>();
  const waitlist = await db
    .select({ w: waitlistEntries, familyName: families.name })
    .from(waitlistEntries)
    .innerJoin(families, eq(families.id, waitlistEntries.familyId))
    .where(and(eq(waitlistEntries.sessionId, id), inArray(waitlistEntries.status, ["waiting", "offered"])))
    .orderBy(asc(waitlistEntries.createdAt));
  const series = row.s.seriesId ? (await db.execute<{ title: string | null; starts_on: string; ends_on: string; weekdays: number[] }>(sql`SELECT title, starts_on, ends_on, weekdays FROM schedule_series WHERE id = ${row.s.seriesId}`))[0] : null;
  return { ...row, availability: avail, pool, overrides, attendees, members, memberFamilies, waitlist, series };
}

/* ── Week calendar ── */

export async function weekSessions(db: Executor, from: string, to: string, f: Pick<BookingFilters, "program" | "location" | "cohort">) {
  const rows = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(
      and(
        gte(sessions.localDate, from),
        lte(sessions.localDate, to),
        f.program ? eq(sessions.programId, f.program) : undefined,
        f.location ? eq(sessions.locationId, f.location) : undefined,
        f.cohort ? eq(sessions.cohortId, f.cohort) : undefined,
        ne(programs.status, "archived"),
      ),
    )
    .orderBy(asc(sessions.startsAt));
  const avail = await availabilityFor(
    db,
    rows.map((r) => r.s.id),
  );
  return rows.map((r) => ({ session: r.s, program: r.p, availability: avail.get(r.s.id)! }));
}

export type { PaperworkItem };
