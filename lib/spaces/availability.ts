/**
 * What families see: workspaces, opening hours and busy intervals for one day. Busy intervals carry
 * only a workspace id, times and "reserved" / "unavailable" — never who booked, why a space is
 * closed, or any id that could be used to look a reservation up.
 */
import { and, asc, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { invoices, spaceReservationGroups, spaceReservations, workspaceBlocks, workspaces } from "@/lib/db/schema";
import { invoiceTotals } from "@/lib/ops/billing";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { getSpaceConfig, type BookingType, type Category, type PaidBookingType, type SpaceConfig } from "./config";
import { allowanceFor, closedDates, hoursOn, paymentStatusOf, rateFor, weekDates, type Allowance } from "./engine";

export type PublicWorkspace = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  summary: string;
  description: string | null;
  amenities: string[];
  photos: string[];
  capacity: number;
  bookingTypes: BookingType[];
  complimentary: boolean;
  hours: [string, string] | null;
  /** The lowest paid price in force that day, for "From $30 / half-day". */
  fromPrice: { bookingType: PaidBookingType; cents: number } | null;
  /** Paid booking types that currently have a price. */
  pricedTypes: { bookingType: PaidBookingType; cents: number }[];
};

export type BusyInterval = { workspaceId: string; start: string; end: string; status: "reserved" | "unavailable" };

export type DayView = {
  date: string;
  today: string;
  now: string;
  open: boolean;
  config: Pick<SpaceConfig, "slotMinutes" | "halfDay" | "fullDay" | "week" | "complimentary" | "hourly"> & {
    paidFamilyCancel: SpaceConfig["cancellation"]["paidFamilyCancel"];
    paidCutoffHours: number;
    complimentaryCutoffMinutes: number;
    /** Weekdays (0 = Sunday) with house hours, for the date picker. */
    openWeekdays: number[];
  };
  workspaces: PublicWorkspace[];
  busy: BusyInterval[];
  /** For week bookings: the dates a week starting on this date would cover. */
  weekDates: string[];
};

const PAID: PaidBookingType[] = ["half_day", "full_day", "week", "hourly"];

export async function dayView(db: Executor, date: string, now = new Date()): Promise<DayView> {
  const cfg = await getSpaceConfig(db);
  const rows = await db.select().from(workspaces).where(eq(workspaces.active, true)).orderBy(asc(workspaces.displayOrder), asc(workspaces.name));
  const closed = await closedDates(db, date, addDaysISO(date, 14));
  const dayStart = zonedDateTime(date, "00:00");
  const dayEnd = zonedDateTime(addDaysISO(date, 1), "00:00");
  const ids = rows.map((w) => w.id);

  const res = ids.length
    ? await db
        .select({ workspaceId: spaceReservations.workspaceId, startsAt: spaceReservations.startsAt, endsAt: spaceReservations.endsAt })
        .from(spaceReservations)
        .where(
          and(
            inArray(spaceReservations.workspaceId, ids),
            lt(spaceReservations.startsAt, dayEnd),
            gt(spaceReservations.endsAt, dayStart),
            or(eq(spaceReservations.status, "confirmed"), and(eq(spaceReservations.status, "held"), gt(spaceReservations.holdExpiresAt, now))),
          ),
        )
    : [];
  const blocks = await db
    .select({ workspaceId: workspaceBlocks.workspaceId, startsAt: workspaceBlocks.startsAt, endsAt: workspaceBlocks.endsAt })
    .from(workspaceBlocks)
    .where(and(isNull(workspaceBlocks.removedAt), lt(workspaceBlocks.startsAt, dayEnd), gt(workspaceBlocks.endsAt, dayStart)));

  const busy: BusyInterval[] = [
    ...res.map((r) => ({ workspaceId: r.workspaceId, start: r.startsAt.toISOString(), end: r.endsAt.toISOString(), status: "reserved" as const })),
    ...blocks.flatMap((b) =>
      (b.workspaceId ? [b.workspaceId] : ids).map((wid) => ({ workspaceId: wid, start: b.startsAt.toISOString(), end: b.endsAt.toISOString(), status: "unavailable" as const })),
    ),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const list: PublicWorkspace[] = [];
  for (const w of rows) {
    const priced: PublicWorkspace["pricedTypes"] = [];
    for (const t of PAID) {
      if (!w.bookingTypes.includes(t)) continue;
      const r = await rateFor(db, w, t, date);
      if (r) priced.push({ bookingType: t, cents: r.priceCents });
    }
    const from = priced.length ? priced.reduce((m, p) => (p.cents < m.cents ? p : m), priced[0]) : null;
    list.push({
      id: w.id,
      slug: w.slug,
      name: w.name,
      category: w.category as Category,
      summary: w.summary,
      description: w.description,
      amenities: w.amenities,
      photos: w.photos,
      capacity: w.capacity,
      bookingTypes: w.bookingTypes as BookingType[],
      complimentary: w.complimentaryEligible && w.bookingTypes.includes("complimentary"),
      hours: hoursOn(cfg, w, date, closed),
      fromPrice: from,
      pricedTypes: priced,
    });
  }
  return {
    date,
    today: todayLA(now),
    now: now.toISOString(),
    open: list.some((w) => w.hours),
    config: {
      slotMinutes: cfg.slotMinutes,
      halfDay: cfg.halfDay,
      fullDay: cfg.fullDay,
      week: cfg.week,
      complimentary: cfg.complimentary,
      hourly: cfg.hourly,
      paidFamilyCancel: cfg.cancellation.paidFamilyCancel,
      paidCutoffHours: cfg.cancellation.paidCutoffHours,
      complimentaryCutoffMinutes: cfg.cancellation.complimentaryCutoffMinutes,
      openWeekdays: Object.keys(cfg.hours).map(Number),
    },
    workspaces: list,
    busy,
    weekDates: weekDates(cfg, date),
  };
}

/* ── A family's own reservations ── */

export type MyReservation = {
  reference: string;
  workspace: { id: string; name: string; category: Category };
  bookingType: BookingType;
  status: string;
  paymentStatus: string;
  totalCents: number;
  complimentaryMinutes: number;
  intervals: { localDate: string; start: string; end: string }[];
  createdAt: string;
  cancellationReason: string | null;
  invoiceNumber: string | null;
  canCancel: boolean;
  canMove: boolean;
  changeNote: string;
};

export async function myReservations(db: Executor, familyId: string, now = new Date()): Promise<{ upcoming: MyReservation[]; past: MyReservation[]; cancelled: MyReservation[] }> {
  const cfg = await getSpaceConfig(db);
  const groups = await db
    .select()
    .from(spaceReservationGroups)
    .where(and(eq(spaceReservationGroups.familyId, familyId), ne(spaceReservationGroups.status, "expired")))
    .orderBy(asc(spaceReservationGroups.createdAt))
    .limit(300);
  if (!groups.length) return { upcoming: [], past: [], cancelled: [] };
  const gids = groups.map((g) => g.id);
  const rows = await db
    .select()
    .from(spaceReservations)
    .where(and(inArray(spaceReservations.groupId, gids), inArray(spaceReservations.status, ["held", "confirmed", "cancelled", "expired"])))
    .orderBy(asc(spaceReservations.startsAt));
  const ws = await db.select().from(workspaces).where(inArray(workspaces.id, [...new Set(groups.map((g) => g.workspaceId))]));
  const invs = await db.select().from(invoices).where(inArray(invoices.spaceGroupId, gids));
  const totals = invs.length ? await invoiceTotals(db, invs.map((i) => i.id)) : new Map();
  const out = { upcoming: [] as MyReservation[], past: [] as MyReservation[], cancelled: [] as MyReservation[] };
  for (const g of groups) {
    const w = ws.find((x) => x.id === g.workspaceId)!;
    const mine = rows.filter((r) => r.groupId === g.id);
    if (!mine.length) continue;
    const inv = invs.find((i) => i.spaceGroupId === g.id) ?? null;
    const last = mine[mine.length - 1];
    const first = mine[0];
    const minutesAhead = (first.startsAt.getTime() - now.getTime()) / 60000;
    const paid = g.totalCents > 0;
    const confirmed = g.status === "confirmed";
    const canCancel =
      confirmed && minutesAhead > 0 && (paid ? cfg.cancellation.paidFamilyCancel === "cancel" && minutesAhead >= cfg.cancellation.paidCutoffHours * 60 : minutesAhead >= cfg.cancellation.complimentaryCutoffMinutes);
    const canMove = confirmed && !paid && g.bookingType === "complimentary" && minutesAhead >= Math.max(cfg.cancellation.complimentaryCutoffMinutes, 1);
    const item: MyReservation = {
      reference: g.reference,
      workspace: { id: w.id, name: w.name, category: w.category as Category },
      bookingType: g.bookingType as BookingType,
      status: g.status,
      paymentStatus: paymentStatusOf(g, inv, inv ? totals.get(inv.id) ?? null : null),
      totalCents: g.totalCents,
      complimentaryMinutes: g.complimentaryMinutes,
      intervals: mine.map((r) => ({ localDate: r.localDate, start: r.startsAt.toISOString(), end: r.endsAt.toISOString() })),
      createdAt: g.createdAt.toISOString(),
      cancellationReason: g.cancellationReason,
      invoiceNumber: inv?.number ?? null,
      canCancel,
      canMove,
      changeNote: paid
        ? cfg.cancellation.paidFamilyCancel === "contact"
          ? "To change or cancel a paid reservation, please contact Yalla."
          : `Paid reservations can be cancelled online until ${cfg.cancellation.paidCutoffHours} hours before they start. Yalla confirms any refund or credit.`
        : cfg.cancellation.complimentaryCutoffMinutes
          ? `Free to change or cancel until ${cfg.cancellation.complimentaryCutoffMinutes} minutes before it starts.`
          : "Free to change or cancel until it starts.",
    };
    if (g.status === "cancelled" || g.status === "needs_attention") out.cancelled.push(item);
    else if (last.endsAt <= now) out.past.push(item);
    else out.upcoming.push(item);
  }
  out.past.reverse();
  out.cancelled.reverse();
  return out;
}

/** The signed-in family's allowance and their own reservations on a date (their own, so ids are fine). */
export async function myDay(db: Executor, familyId: string, date: string, now = new Date()): Promise<{ allowance: Allowance; mine: { workspaceId: string; start: string; end: string; reference: string }[] }> {
  const allowance = await allowanceFor(db, familyId, date, { now });
  const mine = await db
    .select({ workspaceId: spaceReservations.workspaceId, startsAt: spaceReservations.startsAt, endsAt: spaceReservations.endsAt, reference: spaceReservationGroups.reference })
    .from(spaceReservations)
    .innerJoin(spaceReservationGroups, eq(spaceReservationGroups.id, spaceReservations.groupId))
    .where(
      and(
        eq(spaceReservations.familyId, familyId),
        eq(spaceReservations.localDate, date),
        or(eq(spaceReservations.status, "confirmed"), and(eq(spaceReservations.status, "held"), gt(spaceReservations.holdExpiresAt, now))),
      ),
    );
  return { allowance, mine: mine.map((m) => ({ workspaceId: m.workspaceId, start: m.startsAt.toISOString(), end: m.endsAt.toISOString(), reference: m.reference })) };
}

/** A family's reservation by reference, or null if it isn't theirs. */
export async function myReservation(db: Executor, familyId: string, reference: string) {
  const all = await myReservations(db, familyId);
  return [...all.upcoming, ...all.past, ...all.cancelled].find((r) => r.reference === reference) ?? null;
}
