/**
 * The enrollment calendar: every session in a month with how many children are booked, so staff
 * can see at a glance who is coming to camp (or Flex, or a Happening) and open any day's rosters.
 */
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import type { Permission } from "@/lib/auth/permissions";
import { bookingItems, bookings, invoiceLines, invoices, programPrices, programs, sessions, waitlistEntries } from "@/lib/db/schema";
import { addonsFor } from "@/lib/booking/addons";
import { flexGroupFor } from "@/lib/booking/flex";
import { roster } from "@/lib/ops/attendance";
import { availabilityFor } from "@/lib/ops/capacity";

export const CALENDAR_PROGRAMS = [
  { key: "camp", label: "Camp Yalla" },
  { key: "flex", label: "Yalla Flex" },
  { key: "happenings", label: "Happenings" },
  { key: "all", label: "Everything" },
] as const;
export type CalendarProgram = (typeof CALENDAR_PROGRAMS)[number]["key"];

const programFilter = (key: CalendarProgram) =>
  key === "camp"
    ? eq(programs.kind, "camp")
    : key === "flex"
      ? eq(programs.slug, "yalla-flex")
      : key === "happenings"
        ? inArray(programs.kind, ["happening", "parents_night", "nature"])
        : // Club Yalla's daily cohort days are memberships, not bookings: they'd fill every weekday.
          ne(programs.kind, "membership");

export type CalendarSession = {
  id: string;
  date: string;
  programName: string;
  programKind: string;
  title: string;
  /** "18 months – 3 years" for an age group, else the session title. */
  group: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  /** Children with a confirmed booking. */
  booked: number;
  /** Spots held by a checkout in progress or a request awaiting approval. */
  held: number;
  /** Spots taken by everything (bookings, holds, members, staff reservations), out of `effectiveCapacity`. */
  used: number;
  effectiveCapacity: number;
  /** Spots still open to book (also limited by a shared room's capacity). */
  remaining: number;
  waiting: number;
  status: string;
  /** Yalla is closed this day (e.g. "Fall Family Break"): nothing can be booked, so it's never shown as open. */
  closure: string | null;
  /** Revenue (only for staff who can see reports; see sessionRevenue). */
  money?: SessionMoney;
};

export type SessionMoney = {
  /** What the booked spots actually bring in, after each one's share of any coupon or sibling discount. */
  capturedCents: number;
  /** The part of captured still owed on an open invoice. */
  unpaidCents: number;
  /** Spots not yet captured: open, plus any held at checkout. */
  openSpots: number;
  /** One open spot at its lowest rate (e.g. a Flex half day) and at its full rate. */
  spotMinCents: number;
  spotMaxCents: number;
  /** No price is set for this session, so its open spots can't be valued. */
  unpriced: boolean;
};

/** Sessions between two dates (inclusive) for the chosen programs, with booked and waitlist counts. */
export async function calendarSessions(db: Executor, from: string, to: string, program: CalendarProgram, opts: { money?: boolean } = {}): Promise<CalendarSession[]> {
  const rows = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(gte(sessions.localDate, from), lte(sessions.localDate, to), ne(sessions.status, "cancelled"), sql`${programs.status} <> 'archived'`, programFilter(program)))
    .orderBy(sessions.localDate, sessions.startsAt, sessions.minAgeMonths);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.s.id);
  const booked = await db
    .select({ sessionId: bookingItems.sessionId, n: sql<number>`count(*)::int` })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .where(and(inArray(bookingItems.sessionId, ids), eq(bookingItems.status, "confirmed"), eq(bookings.status, "confirmed")))
    .groupBy(bookingItems.sessionId);
  const waiting = await db
    .select({ sessionId: waitlistEntries.sessionId, n: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(and(inArray(waitlistEntries.sessionId, ids), eq(waitlistEntries.status, "waiting")))
    .groupBy(waitlistEntries.sessionId);
  const avail = await availabilityFor(db, ids);
  const bookedBy = new Map(booked.map((b) => [b.sessionId, b.n]));
  const waitingBy = new Map(waiting.map((w) => [w.sessionId, w.n]));
  const money = opts.money ? await sessionRevenue(db, rows) : null;
  return rows.map(({ s, p }) => {
    const closure = s.status === "closed" ? (s.notes?.startsWith("Closed: ") ? s.notes.slice("Closed: ".length) : "Closed") : null;
    // "Camp Yalla · 4 – 7 years" → "4 – 7 years"
    const title = s.title ?? p.name;
    const group = title.includes(" · ") ? title.split(" · ").slice(1).join(" · ") : title;
    return {
      id: s.id,
      date: s.localDate,
      programName: p.name,
      programKind: p.kind,
      title,
      group,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      capacity: s.capacity,
      booked: bookedBy.get(s.id) ?? 0,
      held: avail.get(s.id)?.occupancy.held ?? 0,
      used: avail.get(s.id)?.occupancy.used ?? bookedBy.get(s.id) ?? 0,
      effectiveCapacity: avail.get(s.id)?.effectiveCapacity ?? s.capacity,
      remaining: avail.get(s.id)?.remaining ?? Math.max(0, s.capacity - (bookedBy.get(s.id) ?? 0)),
      waiting: waitingBy.get(s.id ?? "") ?? 0,
      status: s.status,
      closure,
      // A closed day has no places to book.
      ...(closure ? { remaining: 0, effectiveCapacity: 0, capacity: 0 } : {}),
      ...(money
        ? {
            money: {
              ...money.get(s.id)!,
              openSpots: closure ? 0 : (avail.get(s.id)?.remaining ?? 0) + (avail.get(s.id)?.occupancy.held ?? 0),
            },
          }
        : {}),
    };
  });
}

/**
 * Revenue per session, for the calendar's revenue panel.
 *
 * Captured: each confirmed booked spot's charges on its invoice, scaled by that invoice's discounts
 * (coupons, sibling and family rates), so a $160 camp day with 50% off counts as $80. A spot booked
 * without an invoice counts at the price on the booking. Open spots are valued at the session's
 * lowest rate (a Flex half day) and its full rate; extras like Early Bird aren't counted.
 */
async function sessionRevenue(db: Executor, rows: { s: typeof sessions.$inferSelect; p: typeof programs.$inferSelect }[]) {
  const ids = rows.map((r) => r.s.id);
  const out = new Map<string, Omit<SessionMoney, "openSpots">>();
  const items = await db
    .select({ id: bookingItems.id, sessionId: bookingItems.sessionId, priceCents: bookingItems.priceCents })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .where(and(inArray(bookingItems.sessionId, ids), eq(bookingItems.status, "confirmed"), eq(bookings.status, "confirmed")));
  const itemLines = items.length
    ? await db
        .select({ itemId: invoiceLines.bookingItemId, invoiceId: invoiceLines.invoiceId, amount: invoiceLines.amountCents })
        .from(invoiceLines)
        .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
        .where(and(inArray(invoiceLines.bookingItemId, items.map((i) => i.id)), eq(invoiceLines.kind, "charge"), ne(invoices.status, "void")))
    : [];
  const invIds = [...new Set(itemLines.map((l) => l.invoiceId))];
  const [allLines, invRows] = invIds.length
    ? await Promise.all([
        db.select({ invoiceId: invoiceLines.invoiceId, kind: invoiceLines.kind, amount: invoiceLines.amountCents }).from(invoiceLines).where(inArray(invoiceLines.invoiceId, invIds)),
        db.select({ id: invoices.id, status: invoices.status }).from(invoices).where(inArray(invoices.id, invIds)),
      ])
    : [[], []];
  // Each invoice's discounts are shared across its charges in proportion: net ÷ gross.
  const ratio = new Map<string, number>();
  for (const id of invIds) {
    const charges = allLines.filter((l) => l.invoiceId === id && l.kind === "charge").reduce((n, l) => n + l.amount, 0);
    const discounts = allLines.filter((l) => l.invoiceId === id && l.kind === "discount").reduce((n, l) => n + l.amount, 0);
    ratio.set(id, charges > 0 ? Math.max(0, (charges + discounts) / charges) : 0);
  }
  const open = new Set(invRows.filter((i) => i.status === "open").map((i) => i.id));
  const captured = new Map<string, { cents: number; unpaid: number }>();
  for (const it of items) {
    const lines = itemLines.filter((l) => l.itemId === it.id);
    let cents = 0;
    let unpaid = 0;
    if (lines.length)
      for (const l of lines) {
        const v = Math.round(l.amount * (ratio.get(l.invoiceId) ?? 1));
        cents += v;
        if (open.has(l.invoiceId)) unpaid += v;
      }
    else cents = it.priceCents ?? 0;
    const c = captured.get(it.sessionId) ?? { cents: 0, unpaid: 0 };
    captured.set(it.sessionId, { cents: c.cents + cents, unpaid: c.unpaid + unpaid });
  }
  // What one more spot would cost: the lowest and the full rate.
  const programIds = [...new Set(rows.map((r) => r.p.id))];
  const table = await db.select().from(programPrices).where(and(inArray(programPrices.programId, programIds), eq(programPrices.unit, "session"), eq(programPrices.active, true)));
  for (const { s, p } of rows) {
    let min: number | null;
    let max: number | null;
    const group = p.kind === "drop_in" ? flexGroupFor(s.minAgeMonths) : null;
    if (group) {
      max = s.priceCents ?? group.fullCents;
      min = addonsFor(p.kind, p.slug).some((a) => a.dayLength === "half") ? Math.min(group.halfCents, max) : max;
    } else {
      const mine = table.filter((t) => t.programId === p.id);
      const hours = (s.endsAt.getTime() - s.startsAt.getTime()) / 3600_000;
      const day = hours > 5 ? "full" : "half";
      const pick = (len: string) =>
        mine.find((t) => t.cohortId === s.cohortId && t.dayLength === len) ??
        mine.find((t) => t.cohortId === s.cohortId && !t.dayLength) ??
        mine.find((t) => !t.cohortId && t.dayLength === len) ??
        mine.find((t) => !t.cohortId && !t.dayLength);
      max = s.priceCents ?? pick(day)?.amountCents ?? p.priceCents ?? null;
      min = max;
    }
    const c = captured.get(s.id) ?? { cents: 0, unpaid: 0 };
    out.set(s.id, { capturedCents: c.cents, unpaidCents: c.unpaid, spotMinCents: min ?? 0, spotMaxCents: max ?? 0, unpriced: max == null });
  }
  return out;
}

export type CalendarChild = {
  childId: string;
  familyId: string;
  name: string;
  age: string;
  extras: string[];
  allergies: string | null;
  formsMissing: number;
  member: boolean;
  attendance: string;
};

export type CalendarDaySession = CalendarSession & { children: CalendarChild[]; notComing: { name: string; reason: string }[] };

/** One day's sessions for the chosen programs, each with who's coming (for the calendar's day panel). */
export async function calendarDay(db: Executor, date: string, program: CalendarProgram, perms: readonly Permission[]): Promise<CalendarDaySession[]> {
  const list = await calendarSessions(db, date, date, program);
  return Promise.all(
    list.map(async (s) => {
      if (s.closure) return { ...s, children: [], notComing: [] };
      const r = await roster(db, s.id, perms);
      const coming = r.children.filter((c) => c.expected || c.attendance?.status === "checked_in" || c.attendance?.status === "checked_out");
      const display = (c: (typeof r.children)[number]) => (c.preferredName ? `${c.preferredName} ${c.name.split(" ").slice(1).join(" ")}` : c.name);
      return {
        ...s,
        children: coming
          .map((c) => ({
            childId: c.childId,
            familyId: c.familyId,
            name: display(c),
            age: c.age,
            extras: c.extras.map((x) => x.replace(/ \(.*\)$/, "")),
            allergies: c.care?.allergies?.trim() || null,
            formsMissing: c.paperwork?.length ?? 0,
            member: c.source === "membership",
            attendance: c.attendance?.status ?? "expected",
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        notComing: r.children.filter((c) => !coming.includes(c)).map((c) => ({ name: display(c), reason: (c.notExpectedReason ?? "Cancelled").toLowerCase() })),
      };
    }),
  );
}
