/**
 * Reports. Each report returns labelled columns and rows (shared by the screen and CSV export).
 * Metric names say exactly what they measure: "payments collected" is money received, while
 * "value of care booked" is the price of confirmed bookings — they're never mixed.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { cohorts, families, invoices, memberships, payments, programs, refunds, sessions, waitlistEntries } from "@/lib/db/schema";
import { WEEKDAY } from "./memberships";
import { addDaysISO, fmtDate, fmtTime, todayLA, zonedDateTime } from "@/lib/time";
import { availabilityFor } from "./capacity";
import { invoiceTotals } from "./billing";

export type ReportFilter = { from: string; to: string; programId?: string };
export type Column = { key: string; label: string; kind?: "money" | "number" | "text" | "percent" };
export type ReportResult = { columns: Column[]; rows: Record<string, string | number | null>[]; totals?: Record<string, number>; note?: string };

export type ReportDef = {
  id: string;
  title: string;
  description: string;
  financial: boolean;
  filters: ("range" | "program" | "asOf")[];
  run: (db: Executor, f: ReportFilter) => Promise<ReportResult>;
};

const n = (v: unknown) => Number(v ?? 0);
const sum = (rows: Record<string, unknown>[], key: string) => rows.reduce((s, r) => s + n(r[key]), 0);
const startOf = (d: string) => zonedDateTime(d, "00:00").toISOString();
const endOf = (d: string) => zonedDateTime(addDaysISO(d, 1), "00:00").toISOString();

async function bookingsByProgram(db: Executor, f: ReportFilter): Promise<ReportResult> {
  const rows = await db.execute<{ program: string; local_date: string; sessions: number; confirmed: number; cancelled: number; value: number }>(sql`
    SELECT p.name AS program, s.local_date::text AS local_date,
      COUNT(DISTINCT s.id)::int AS sessions,
      COALESCE(SUM(bi.spots) FILTER (WHERE bi.status = 'confirmed'), 0)::int AS confirmed,
      COUNT(bi.id) FILTER (WHERE bi.status = 'cancelled')::int AS cancelled,
      COALESCE(SUM(bi.price_cents) FILTER (WHERE bi.status = 'confirmed'), 0)::int AS value
    FROM sessions s
    JOIN programs p ON p.id = s.program_id
    LEFT JOIN booking_items bi ON bi.session_id = s.id
    WHERE s.local_date BETWEEN ${f.from} AND ${f.to}
      AND p.kind <> 'membership'
      ${f.programId ? sql`AND p.id = ${f.programId}` : sql``}
    GROUP BY p.name, s.local_date
    ORDER BY s.local_date, p.name`);
  const out = rows.map((r) => ({ date: fmtDate(r.local_date, "EEE d MMM yyyy"), program: r.program, sessions: n(r.sessions), confirmed: n(r.confirmed), cancelled: n(r.cancelled), value: n(r.value) }));
  return {
    columns: [
      { key: "date", label: "Date" },
      { key: "program", label: "Program" },
      { key: "sessions", label: "Sessions", kind: "number" },
      { key: "confirmed", label: "Confirmed spots", kind: "number" },
      { key: "cancelled", label: "Cancelled items", kind: "number" },
      { key: "value", label: "Value of care booked", kind: "money" },
    ],
    rows: out,
    totals: { sessions: sum(out, "sessions"), confirmed: sum(out, "confirmed"), cancelled: sum(out, "cancelled"), value: sum(out, "value") },
    note: "“Value of care booked” is the price of confirmed bookings on these dates — not money collected. Club Yalla memberships are reported separately.",
  };
}

async function occupancy(db: Executor, f: ReportFilter): Promise<ReportResult> {
  const rows = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(gte(sessions.localDate, f.from), lte(sessions.localDate, f.to), eq(sessions.status, "scheduled"), f.programId ? eq(sessions.programId, f.programId) : undefined))
    .orderBy(asc(sessions.startsAt));
  const avail = await availabilityFor(
    db,
    rows.map((r) => r.s.id),
  );
  const out = rows.map(({ s, p }) => {
    const a = avail.get(s.id)!;
    return {
      id: s.id,
      date: fmtDate(s.localDate, "EEE d MMM yyyy"),
      time: `${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)}`,
      program: s.title ?? p.name,
      capacity: a.effectiveCapacity,
      booked: a.occupancy.booked,
      members: a.occupancy.members,
      held: a.occupancy.held,
      reserved: a.occupancy.reserved,
      remaining: a.remaining,
      occupancy: a.effectiveCapacity ? Math.round((a.occupancy.used / a.effectiveCapacity) * 100) : 0,
    };
  });
  return {
    columns: [
      { key: "date", label: "Date" },
      { key: "time", label: "Time" },
      { key: "program", label: "Session" },
      { key: "capacity", label: "Capacity", kind: "number" },
      { key: "booked", label: "Booked", kind: "number" },
      { key: "members", label: "Club Yalla members", kind: "number" },
      { key: "held", label: "In checkout", kind: "number" },
      { key: "reserved", label: "Staff-reserved", kind: "number" },
      { key: "remaining", label: "Remaining (incl. shared space)", kind: "number" },
      { key: "occupancy", label: "Occupancy", kind: "percent" },
    ],
    rows: out,
    totals: { capacity: sum(out, "capacity"), booked: sum(out, "booked"), members: sum(out, "members"), remaining: sum(out, "remaining") },
    note: "Remaining spots account for shared capacity pools, so they can be lower than capacity minus bookings.",
  };
}

async function attendance(db: Executor, f: ReportFilter): Promise<ReportResult> {
  const rows = await db.execute<{ id: string; local_date: string; title: string; checked_in: number; checked_out: number; absent: number; recorded: number }>(sql`
    SELECT s.id, s.local_date::text AS local_date, COALESCE(s.title, p.name) AS title,
      COUNT(a.id) FILTER (WHERE a.status IN ('checked_in','checked_out'))::int AS checked_in,
      COUNT(a.id) FILTER (WHERE a.status = 'checked_out')::int AS checked_out,
      COUNT(a.id) FILTER (WHERE a.status = 'absent')::int AS absent,
      COUNT(a.id)::int AS recorded
    FROM sessions s JOIN programs p ON p.id = s.program_id
    LEFT JOIN attendance_records a ON a.session_id = s.id
    WHERE s.local_date BETWEEN ${f.from} AND ${f.to} AND s.status = 'scheduled'
      ${f.programId ? sql`AND p.id = ${f.programId}` : sql``}
    GROUP BY s.id, s.local_date, s.title, p.name, s.starts_at
    ORDER BY s.starts_at`);
  const occ = await occupancy(db, f);
  const occById = new Map(occ.rows.map((o) => [o.id as string, o]));
  const out = rows.map((r) => {
    const o = occById.get(r.id);
    const expected = o ? n(o.booked) + n(o.members) : 0;
    return { date: fmtDate(r.local_date, "EEE d MMM yyyy"), session: r.title, expected, attended: n(r.checked_in), absent: n(r.absent), unrecorded: Math.max(expected - n(r.recorded), 0) };
  });
  return {
    columns: [
      { key: "date", label: "Date" },
      { key: "session", label: "Session" },
      { key: "expected", label: "Expected", kind: "number" },
      { key: "attended", label: "Checked in", kind: "number" },
      { key: "absent", label: "Marked absent", kind: "number" },
      { key: "unrecorded", label: "Not recorded", kind: "number" },
    ],
    rows: out,
    totals: { expected: sum(out, "expected"), attended: sum(out, "attended"), absent: sum(out, "absent"), unrecorded: sum(out, "unrecorded") },
  };
}

async function cancellations(db: Executor, f: ReportFilter): Promise<ReportResult> {
  const rows = await db.execute<{ program: string; cancelled: number; no_show: number; absent: number }>(sql`
    SELECT p.name AS program,
      COUNT(bi.id) FILTER (WHERE bi.status = 'cancelled')::int AS cancelled,
      COUNT(bi.id) FILTER (WHERE bi.attendance = 'no_show')::int AS no_show,
      COUNT(bi.id) FILTER (WHERE bi.attendance = 'absent' AND bi.status = 'confirmed')::int AS absent
    FROM booking_items bi
    JOIN sessions s ON s.id = bi.session_id
    JOIN programs p ON p.id = s.program_id
    WHERE s.local_date BETWEEN ${f.from} AND ${f.to}
      ${f.programId ? sql`AND p.id = ${f.programId}` : sql``}
    GROUP BY p.name ORDER BY p.name`);
  const out = rows.map((r) => ({ program: r.program, cancelled: n(r.cancelled), absent: n(r.absent), no_show: n(r.no_show) }));
  return {
    columns: [
      { key: "program", label: "Program" },
      { key: "cancelled", label: "Cancelled booking items", kind: "number" },
      { key: "absent", label: "Absent (still booked)", kind: "number" },
      { key: "no_show", label: "No-shows", kind: "number" },
    ],
    rows: out,
    totals: { cancelled: sum(out, "cancelled"), absent: sum(out, "absent"), no_show: sum(out, "no_show") },
    note: "Counted by the date of care. Cancellations don’t imply refunds.",
  };
}

async function waitlistDemand(db: Executor, f: ReportFilter): Promise<ReportResult> {
  const rows = await db
    .select({ e: waitlistEntries, p: programs, s: sessions })
    .from(waitlistEntries)
    .innerJoin(programs, eq(programs.id, waitlistEntries.programId))
    .leftJoin(sessions, eq(sessions.id, waitlistEntries.sessionId))
    .where(and(gte(waitlistEntries.createdAt, new Date(startOf(f.from))), lte(waitlistEntries.createdAt, new Date(endOf(f.to))), f.programId ? eq(waitlistEntries.programId, f.programId) : undefined));
  const groups = new Map<string, { program: string; session: string; families: number; children: number; waiting: number; offered: number; accepted: number; expired: number }>();
  for (const r of rows) {
    const key = `${r.p.id}:${r.s?.id ?? "program"}`;
    const g = groups.get(key) ?? { program: r.p.name, session: r.s ? `${fmtDate(r.s.localDate, "EEE d MMM")} ${fmtTime(r.s.startsAt)}` : "Any date", families: 0, children: 0, waiting: 0, offered: 0, accepted: 0, expired: 0 };
    g.families++;
    g.children += r.e.partySize;
    if (r.e.status === "waiting") g.waiting++;
    if (r.e.status === "offered") g.offered++;
    if (r.e.status === "accepted") g.accepted++;
    if (r.e.status === "expired") g.expired++;
    groups.set(key, g);
  }
  const out = [...groups.values()];
  return {
    columns: [
      { key: "program", label: "Program" },
      { key: "session", label: "Session" },
      { key: "families", label: "Families joined", kind: "number" },
      { key: "children", label: "Children", kind: "number" },
      { key: "waiting", label: "Still waiting", kind: "number" },
      { key: "offered", label: "Offer open", kind: "number" },
      { key: "accepted", label: "Accepted", kind: "number" },
      { key: "expired", label: "Offer expired", kind: "number" },
    ],
    rows: out,
    totals: { families: sum(out, "families"), children: sum(out, "children") },
    note: "Counted by the date families joined the waitlist.",
  };
}

async function activeMemberships(db: Executor, f: ReportFilter): Promise<ReportResult> {
  const asOf = f.to;
  const rows = await db
    .select({ m: memberships, c: cohorts })
    .from(memberships)
    .innerJoin(cohorts, eq(cohorts.id, memberships.cohortId))
    .where(and(inArray(memberships.status, ["active", "upcoming", "paused"]), lte(memberships.startsOn, asOf), sql`(${memberships.endsOn} IS NULL OR ${memberships.endsOn} >= ${asOf})`));
  const groups = new Map<string, { cohort: string; members: number; full: number; half: number; days: number; monthly: number }>();
  for (const { m, c } of rows) {
    const g = groups.get(c.id) ?? { cohort: c.name, members: 0, full: 0, half: 0, days: 0, monthly: 0 };
    g.members++;
    if (m.dayLength === "half") g.half++;
    else g.full++;
    g.days += m.weekdays.length;
    if (m.billingFrequency === "monthly") g.monthly += m.priceCents;
    groups.set(c.id, g);
  }
  const out = [...groups.values()];
  const dayCounts = WEEKDAY.map((d, i) => `${d} ${rows.filter((r) => r.m.weekdays.includes(i)).length}`).slice(1, 6).join(" · ");
  return {
    columns: [
      { key: "cohort", label: "Cohort" },
      { key: "members", label: "Active members", kind: "number" },
      { key: "full", label: "Full-day", kind: "number" },
      { key: "half", label: "Half-day", kind: "number" },
      { key: "days", label: "Member-days per week", kind: "number" },
      { key: "monthly", label: "Monthly membership pricing", kind: "money" },
    ],
    rows: out,
    totals: { members: sum(out, "members"), days: sum(out, "days"), monthly: sum(out, "monthly") },
    note: `As of ${fmtDate(asOf)}. Members per weekday: ${dayCounts}. “Monthly membership pricing” is the agreed price, not money collected.`,
  };
}

async function newVsReturning(db: Executor, f: ReportFilter): Promise<ReportResult> {
  // A family's first activity = earliest confirmed booking or membership.
  const rows = await db.execute<{ family_id: string; name: string; first_at: string; in_range: boolean }>(sql`
    WITH activity AS (
      SELECT b.family_id, b.created_at AS at FROM bookings b WHERE b.status = 'confirmed'
      UNION ALL
      SELECT m.family_id, m.created_at FROM memberships m
    ), firsts AS (
      SELECT family_id, MIN(at) AS first_at FROM activity GROUP BY family_id
    ), active AS (
      SELECT DISTINCT family_id FROM activity WHERE at >= ${startOf(f.from)}::timestamptz AND at < ${endOf(f.to)}::timestamptz
    )
    SELECT f.id AS family_id, f.name, fi.first_at::text AS first_at,
      (fi.first_at >= ${startOf(f.from)}::timestamptz) AS in_range
    FROM active a JOIN firsts fi ON fi.family_id = a.family_id JOIN families f ON f.id = a.family_id
    ORDER BY fi.first_at DESC`);
  const out = rows.map((r) => ({ family: r.name, type: r.in_range ? "New" : "Returning", first: fmtDate(String(r.first_at).slice(0, 10)) }));
  const newCount = out.filter((r) => r.type === "New").length;
  return {
    columns: [
      { key: "family", label: "Family" },
      { key: "type", label: "New or returning" },
      { key: "first", label: "First booking or membership" },
    ],
    rows: out,
    totals: { new: newCount, returning: out.length - newCount },
    note: `${newCount} new and ${out.length - newCount} returning families made a booking or started a membership in this period.`,
  };
}

async function paymentsCollected(db: Executor, f: ReportFilter): Promise<ReportResult> {
  const rows = await db
    .select({ p: payments, i: invoices, fam: families })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(families, eq(families.id, payments.familyId))
    .where(and(eq(payments.status, "succeeded"), sql`${payments.method} <> 'credit'`, gte(payments.succeededAt, new Date(startOf(f.from))), lte(payments.succeededAt, new Date(endOf(f.to)))))
    .orderBy(asc(payments.succeededAt));
  const out = rows.map(({ p, i, fam }) => ({
    date: fmtDate(p.succeededAt!.toISOString().slice(0, 10)),
    family: fam.name,
    invoice: i.number,
    method: p.method === "card" ? `Card (${p.provider})` : p.method.replace("offline_", "Offline · "),
    reference: p.providerRef ?? "",
    amount: p.amountCents,
  }));
  return {
    columns: [
      { key: "date", label: "Received" },
      { key: "family", label: "Family" },
      { key: "invoice", label: "Invoice" },
      { key: "method", label: "Method" },
      { key: "reference", label: "Provider reference" },
      { key: "amount", label: "Payments collected", kind: "money" },
    ],
    rows: out,
    totals: { amount: sum(out, "amount") },
    note: "Money actually received in the period (card and approved offline payments). Account credit applications and refunds are excluded — see the Refunds report.",
  };
}

async function refundsReport(db: Executor, f: ReportFilter): Promise<ReportResult> {
  const rows = await db
    .select({ r: refunds, i: invoices, fam: families })
    .from(refunds)
    .innerJoin(invoices, eq(invoices.id, refunds.invoiceId))
    .innerJoin(families, eq(families.id, invoices.familyId))
    .where(and(gte(refunds.createdAt, new Date(startOf(f.from))), lte(refunds.createdAt, new Date(endOf(f.to)))))
    .orderBy(asc(refunds.createdAt));
  const out = rows.map(({ r, i, fam }) => ({ date: fmtDate(r.createdAt.toISOString().slice(0, 10)), family: fam.name, invoice: i.number, reason: r.reason, status: r.status, by: r.requestedBy ?? "", amount: r.amountCents }));
  return {
    columns: [
      { key: "date", label: "Requested" },
      { key: "family", label: "Family" },
      { key: "invoice", label: "Invoice" },
      { key: "reason", label: "Reason" },
      { key: "status", label: "Status" },
      { key: "by", label: "Requested by" },
      { key: "amount", label: "Amount", kind: "money" },
    ],
    rows: out,
    totals: { amount: out.filter((o) => o.status === "succeeded").reduce((s, o) => s + o.amount, 0) },
    note: "Total counts completed refunds only. Failed and pending refunds are listed for follow-up.",
  };
}

async function outstandingInvoices(db: Executor, f: ReportFilter): Promise<ReportResult> {
  const open = await db.select({ i: invoices, fam: families }).from(invoices).innerJoin(families, eq(families.id, invoices.familyId)).where(eq(invoices.status, "open"));
  const totals = await invoiceTotals(
    db,
    open.map((o) => o.i.id),
  );
  const today = f.to || todayLA();
  const out = open
    .map(({ i, fam }) => {
      const t = totals.get(i.id)!;
      const ref = i.dueOn ?? i.issuedAt.toISOString().slice(0, 10);
      const age = Math.max(0, Math.round((new Date(today).getTime() - new Date(ref).getTime()) / 86400000));
      return { invoice: i.number, family: fam.name, description: i.description ?? "", due: i.dueOn ? fmtDate(i.dueOn) : "On receipt", age, total: t.total, paid: t.paid + t.creditApplied - t.refunded, balance: t.balance };
    })
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.age - a.age);
  return {
    columns: [
      { key: "invoice", label: "Invoice" },
      { key: "family", label: "Family" },
      { key: "description", label: "For" },
      { key: "due", label: "Due" },
      { key: "age", label: "Days outstanding", kind: "number" },
      { key: "total", label: "Total", kind: "money" },
      { key: "paid", label: "Paid (net)", kind: "money" },
      { key: "balance", label: "Balance owed", kind: "money" },
    ],
    rows: out,
    totals: { total: sum(out, "total"), balance: sum(out, "balance") },
    note: "Open invoices with a remaining balance, oldest first.",
  };
}

export const REPORTS: ReportDef[] = [
  { id: "bookings", title: "Bookings by program & date", description: "Confirmed spots, cancellations and value of care booked.", financial: false, filters: ["range", "program"], run: bookingsByProgram },
  { id: "occupancy", title: "Occupancy & remaining capacity", description: "Capacity, bookings, members and live remaining spots per session.", financial: false, filters: ["range", "program"], run: occupancy },
  { id: "attendance", title: "Attendance", description: "Expected children against check-ins and absences.", financial: false, filters: ["range", "program"], run: attendance },
  { id: "cancellations", title: "Cancellations & no-shows", description: "By program, counted on the date of care.", financial: false, filters: ["range", "program"], run: cancellations },
  { id: "waitlist", title: "Waitlist demand", description: "Who joined, what was offered and accepted.", financial: false, filters: ["range", "program"], run: waitlistDemand },
  { id: "memberships", title: "Active memberships", description: "Club Yalla members by cohort as of the end date.", financial: false, filters: ["asOf"], run: activeMemberships },
  { id: "families", title: "New & returning families", description: "Families active in the period, and whether it was their first time.", financial: false, filters: ["range"], run: newVsReturning },
  { id: "payments", title: "Payments collected", description: "Money received by card and approved offline payments.", financial: true, filters: ["range"], run: paymentsCollected },
  { id: "refunds", title: "Refunds", description: "Refunds requested, completed and failed.", financial: true, filters: ["range"], run: refundsReport },
  { id: "outstanding", title: "Outstanding invoices", description: "Unpaid balances, oldest first.", financial: true, filters: ["asOf"], run: outstandingInvoices },
];

export function reportById(id: string) {
  return REPORTS.find((r) => r.id === id);
}

export function toCsv(result: ReportResult) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Neutralize spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = result.columns.map((c) => esc(c.kind === "money" ? `${c.label} (USD)` : c.label)).join(",");
  const lines = result.rows.map((r) => result.columns.map((c) => esc(c.kind === "money" ? (n(r[c.key]) / 100).toFixed(2) : r[c.key])).join(","));
  return [header, ...lines].join("\n");
}
