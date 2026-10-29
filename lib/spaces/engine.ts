/**
 * Book a Space: the reservation engine.
 *
 * Correctness lives here, not in the browser:
 * - Intervals are half-open [start, end), so back-to-back reservations are fine.
 * - Every write locks the workspace rows it touches (and the family row when complimentary
 *   minutes are spent) inside a transaction, so two requests can never both take the same time
 *   or both spend the same allowance.
 * - Paid reservations are held (blocking the time) until the payment provider confirms payment by
 *   webhook. A payment that arrives after the hold lapsed re-checks availability; if the time is
 *   gone the reservation is flagged for staff instead of being double-booked.
 * - Families only ever receive "reserved"/"unavailable" intervals for other people's bookings.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { audit, OpsError, SYSTEM, type Actor } from "@/lib/audit";
import { randomToken } from "@/lib/auth/crypto";
import type { DB, Executor } from "@/lib/db";
import {
  blackoutDates,
  families,
  guardians,
  invoices,
  memberships,
  payments,
  spaceEntitlements,
  spaceReservationGroups,
  spaceReservations,
  workspaceBlocks,
  workspaceRates,
  workspaces,
} from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { createInvoice, invoiceTotals, usd, voidInvoice } from "@/lib/ops/billing";
import { getPolicy } from "@/lib/ops/settings";
import { activeProvider } from "@/lib/payments/provider";
import { addDaysISO, fmtDate, fmtTime, todayLA, weekdayOf, zonedDateTime } from "@/lib/time";
import {
  BOOKING_TYPE_LABEL,
  CATEGORY_LABEL,
  getSpaceConfig,
  RATE_UNIT,
  toMinutes,
  type BookingType,
  type Category,
  type PaidBookingType,
  type SpaceConfig,
} from "./config";

export type Workspace = typeof workspaces.$inferSelect;
export type Interval = { localDate: string; startsAt: Date; endsAt: Date };
export type ReserveInput = {
  workspaceId: string;
  bookingType: BookingType;
  date: string;
  /** HH:MM, for complimentary and hourly bookings. */
  start?: string;
  minutes?: number;
  half?: "morning" | "afternoon";
};

const ACTIVE_ROW = (now: Date) =>
  or(eq(spaceReservations.status, "confirmed"), and(eq(spaceReservations.status, "held"), gt(spaceReservations.holdExpiresAt, now)));

export const TAKEN_MESSAGE = "That time was just reserved. Let’s find another opening.";
const newReference = () => `WS-${randomToken(5).toUpperCase().replace(/[^A-Z0-9]/g, "7").slice(0, 6)}`;
const pad = (n: number) => String(n).padStart(2, "0");
export const minutesToHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/* ── Calendar ── */

/** Dates Yalla is closed (program-wide closures in Schedule → Closures). */
export async function closedDates(db: Executor, from: string, to: string): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(blackoutDates)
    .where(and(isNull(blackoutDates.programId), lte(blackoutDates.startsOn, to), gte(blackoutDates.endsOn, from)));
  const out = new Set<string>();
  for (const r of rows) for (let d = r.startsOn < from ? from : r.startsOn; d <= r.endsOn && d <= to; d = addDaysISO(d, 1)) out.add(d);
  return out;
}

/** Opening hours for a workspace on a date, or null when closed. */
export function hoursOn(cfg: SpaceConfig, ws: Pick<Workspace, "hours">, date: string, closed: Set<string>): [string, string] | null {
  if (closed.has(date)) return null;
  const table = (ws.hours as Record<string, [string, string]> | null) ?? cfg.hours;
  return table[String(weekdayOf(date))] ?? null;
}

function within(hours: [string, string], start: number, end: number) {
  return start >= toMinutes(hours[0]) && end <= toMinutes(hours[1]);
}

/** Dates a weekly booking covers, starting from the chosen date. */
export function weekDates(cfg: SpaceConfig, date: string): string[] {
  if (cfg.week.mode === "calendar") {
    const monday = addDaysISO(date, -((weekdayOf(date) + 6) % 7));
    return Array.from({ length: cfg.week.days }, (_, i) => addDaysISO(monday, i));
  }
  const out: string[] = [];
  for (let d = date; out.length < cfg.week.days; d = addDaysISO(d, 1)) if (cfg.hours[String(weekdayOf(d))]) out.push(d);
  return out;
}

/** Turns a request into the exact intervals it would occupy, or explains why it can't. */
export function planIntervals(cfg: SpaceConfig, ws: Workspace, input: ReserveInput, closed: Set<string>): Interval[] {
  const at = (date: string, start: number, end: number): Interval => ({ localDate: date, startsAt: zonedDateTime(date, minutesToHHMM(start)), endsAt: zonedDateTime(date, minutesToHHMM(end)) });
  const dayHours = (date: string) => {
    const h = hoursOn(cfg, ws, date, closed);
    if (!h) throw new OpsError("closed", `${ws.name} isn’t open on ${fmtDate(date, "EEEE, MMMM d")}.`);
    return h;
  };
  switch (input.bookingType) {
    case "complimentary":
    case "hourly": {
      const durations = input.bookingType === "complimentary" ? cfg.complimentary.durations : cfg.hourly.durations;
      if (!input.start || !/^\d\d:\d\d$/.test(input.start)) throw new OpsError("invalid", "Choose a start time.");
      if (!input.minutes || !durations.includes(input.minutes)) throw new OpsError("invalid", `Choose a duration of ${durations.join(", ")} minutes.`);
      const s = toMinutes(input.start);
      if (s % cfg.slotMinutes !== 0) throw new OpsError("invalid", `Start times are every ${cfg.slotMinutes} minutes.`);
      const h = dayHours(input.date);
      if (!within(h, s, s + input.minutes)) throw new OpsError("hours", `${ws.name} is open ${fmtHM(h[0])} – ${fmtHM(h[1])} that day.`);
      return [at(input.date, s, s + input.minutes)];
    }
    case "half_day": {
      const w = input.half ? cfg.halfDay[input.half] : null;
      if (!w) throw new OpsError("invalid", "That half day isn’t offered.");
      const h = dayHours(input.date);
      if (!within(h, toMinutes(w.start), toMinutes(w.end))) throw new OpsError("hours", "That half day falls outside opening hours.");
      return [at(input.date, toMinutes(w.start), toMinutes(w.end))];
    }
    case "full_day": {
      const h = dayHours(input.date);
      const w = cfg.fullDay;
      if (!within(h, toMinutes(w.start), toMinutes(w.end))) throw new OpsError("hours", "A full day falls outside opening hours that day.");
      return [at(input.date, toMinutes(w.start), toMinutes(w.end))];
    }
    case "week": {
      const dates = weekDates(cfg, input.date);
      const w = cfg.fullDay;
      return dates.map((d) => {
        const h = hoursOn(cfg, ws, d, closed);
        if (!h || !within(h, toMinutes(w.start), toMinutes(w.end)))
          throw new OpsError("week_closed", `Yalla is closed on ${fmtDate(d, "EEEE, MMMM d")}, so this week can’t be booked online. Please contact Yalla.`);
        return at(d, toMinutes(w.start), toMinutes(w.end));
      });
    }
    default:
      throw new OpsError("invalid", "Choose how you’d like to book.");
  }
}

export const fmtHM = (hhmm: string) => fmtTime(zonedDateTime("2026-01-05", hhmm));

/* ── Pricing ── */

export type RateRow = typeof workspaceRates.$inferSelect;

/** The rate in force on a date: a workspace-specific rate wins over its category's rate. */
export async function rateFor(db: Executor, ws: Pick<Workspace, "id" | "category">, bookingType: PaidBookingType, onDate: string): Promise<RateRow | null> {
  const rows = await db
    .select()
    .from(workspaceRates)
    .where(
      and(
        eq(workspaceRates.active, true),
        eq(workspaceRates.bookingType, bookingType),
        lte(workspaceRates.effectiveFrom, onDate),
        or(isNull(workspaceRates.effectiveUntil), gte(workspaceRates.effectiveUntil, onDate)),
        or(eq(workspaceRates.workspaceId, ws.id), and(isNull(workspaceRates.workspaceId), eq(workspaceRates.category, ws.category))),
      ),
    )
    .orderBy(desc(workspaceRates.effectiveFrom), desc(workspaceRates.createdAt));
  return rows.find((r) => r.workspaceId === ws.id) ?? rows[0] ?? null;
}

export function priceFor(rate: RateRow, bookingType: PaidBookingType, minutes: number) {
  return bookingType === "hourly" ? Math.round((rate.priceCents * minutes) / 60) : rate.priceCents;
}

/* ── Complimentary allowance ── */

export type Allowance = { eligible: boolean; dailyMinutes: number; usedMinutes: number; remainingMinutes: number; reason: string };

export async function allowanceFor(db: Executor, familyId: string, date: string, opts: { cfg?: SpaceConfig; workspaceId?: string; now?: Date; excludeGroupId?: string } = {}): Promise<Allowance> {
  const cfg = opts.cfg ?? (await getSpaceConfig(db));
  const now = opts.now ?? new Date();
  const exceptions = await db
    .select()
    .from(spaceEntitlements)
    .where(
      and(
        eq(spaceEntitlements.familyId, familyId),
        isNull(spaceEntitlements.archivedAt),
        or(isNull(spaceEntitlements.effectiveFrom), lte(spaceEntitlements.effectiveFrom, date)),
        or(isNull(spaceEntitlements.effectiveUntil), gte(spaceEntitlements.effectiveUntil, date)),
      ),
    )
    .orderBy(desc(spaceEntitlements.createdAt));
  const exception = exceptions[0];
  let eligible: boolean;
  let reason: string;
  if (exception) {
    eligible = exception.mode === "grant";
    reason = eligible ? "Granted by Yalla" : "Not included for this family";
  } else if (cfg.complimentary.eligibility === "all_families") {
    eligible = true;
    reason = "Included for every Yalla family";
  } else if (cfg.complimentary.eligibility === "active_membership") {
    const [m] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.familyId, familyId),
          inArray(memberships.status, ["active", "upcoming"]),
          lte(memberships.startsOn, date),
          or(isNull(memberships.endsOn), gte(memberships.endsOn, date)),
        ),
      )
      .limit(1);
    eligible = !!m;
    reason = eligible ? "Included with tuition" : "Included with an active Club Yalla membership";
  } else {
    eligible = false;
    reason = "Offered by arrangement with Yalla";
  }
  const dailyMinutes = eligible ? (exception?.dailyMinutes ?? cfg.complimentary.dailyMinutes) : 0;
  const [used] = await db
    .select({ n: sql<number>`coalesce(sum(${spaceReservations.complimentaryMinutes}), 0)::int` })
    .from(spaceReservations)
    .where(
      and(
        eq(spaceReservations.familyId, familyId),
        eq(spaceReservations.localDate, date),
        ACTIVE_ROW(now),
        !cfg.complimentary.shared && opts.workspaceId ? eq(spaceReservations.workspaceId, opts.workspaceId) : undefined,
        opts.excludeGroupId ? ne(spaceReservations.groupId, opts.excludeGroupId) : undefined,
      ),
    );
  return { eligible, dailyMinutes, usedMinutes: used.n, remainingMinutes: Math.max(0, dailyMinutes - used.n), reason };
}

/* ── Conflicts ── */

async function conflictsFor(db: Executor, workspaceId: string, intervals: Interval[], now: Date, opts: { excludeGroupId?: string; ignoreBlocks?: boolean } = {}) {
  const from = intervals.reduce((m, i) => (i.startsAt < m ? i.startsAt : m), intervals[0].startsAt);
  const to = intervals.reduce((m, i) => (i.endsAt > m ? i.endsAt : m), intervals[0].endsAt);
  const res = await db
    .select({ startsAt: spaceReservations.startsAt, endsAt: spaceReservations.endsAt })
    .from(spaceReservations)
    .where(
      and(
        eq(spaceReservations.workspaceId, workspaceId),
        lt(spaceReservations.startsAt, to),
        gt(spaceReservations.endsAt, from),
        ACTIVE_ROW(now),
        opts.excludeGroupId ? ne(spaceReservations.groupId, opts.excludeGroupId) : undefined,
      ),
    );
  const blocks = opts.ignoreBlocks
    ? []
    : await db
        .select({ startsAt: workspaceBlocks.startsAt, endsAt: workspaceBlocks.endsAt })
        .from(workspaceBlocks)
        .where(and(isNull(workspaceBlocks.removedAt), or(isNull(workspaceBlocks.workspaceId), eq(workspaceBlocks.workspaceId, workspaceId)), lt(workspaceBlocks.startsAt, to), gt(workspaceBlocks.endsAt, from)));
  const overlaps = (a: { startsAt: Date; endsAt: Date }) => intervals.some((i) => a.startsAt < i.endsAt && a.endsAt > i.startsAt);
  return { reserved: res.some(overlaps), blocked: blocks.some(overlaps) };
}

/* ── Quote (dry run) ── */

export type Quote = {
  workspace: { id: string; name: string; category: Category };
  bookingType: BookingType;
  intervals: { localDate: string; startsAt: string; endsAt: string }[];
  minutes: number;
  priceCents: number;
  rate: { id: string; priceCents: number; unit: string } | null;
  complimentaryMinutes: number;
  allowance: Allowance | null;
  available: boolean;
  problem: string | null;
};

type Ctx = { familyId: string | null; override?: boolean; excludeGroupId?: string; now?: Date };

/**
 * Validates a request and prices it without writing anything. The same checks run again under
 * lock when the reservation is actually created.
 */
export async function quoteSpace(db: Executor, input: ReserveInput, ctx: Ctx): Promise<Quote> {
  const now = ctx.now ?? new Date();
  const cfg = await getSpaceConfig(db);
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId));
  if (!ws || (!ws.active && !ctx.override)) throw new OpsError("not_found", "That workspace isn’t available.");
  if (!ws.bookingTypes.includes(input.bookingType)) {
    if (input.bookingType !== "complimentary" && ws.bookingTypes.includes("complimentary") && !ws.bookingTypes.some((b) => b !== "complimentary"))
      throw new OpsError("no_paid_rate", `Paid time in ${ws.name} isn’t available to book online yet.`);
    throw new OpsError("invalid", `${ws.name} can’t be booked that way.`);
  }
  if (input.bookingType === "complimentary" && !ws.complimentaryEligible) throw new OpsError("invalid", `${ws.name} doesn’t include complimentary time.`);
  const horizon = addDaysISO(input.date, 14);
  const closed = await closedDates(db, input.date, horizon);
  const intervals = planIntervals(cfg, ws, input, closed);
  const minutes = intervals.reduce((s, i) => s + (i.endsAt.getTime() - i.startsAt.getTime()) / 60000, 0);

  if (!ctx.override) {
    const earliest = new Date(now.getTime() + ws.minNoticeMinutes * 60000);
    if (intervals[0].startsAt <= earliest) throw new OpsError("past", ws.minNoticeMinutes ? `Please book at least ${ws.minNoticeMinutes} minutes ahead.` : "That time has already started. Choose a later time.");
    if (intervals[0].localDate > addDaysISO(todayLA(now), ws.maxAdvanceDays)) throw new OpsError("too_far", `${ws.name} can be booked up to ${ws.maxAdvanceDays} days ahead.`);
  }

  let rate: RateRow | null = null;
  let priceCents = 0;
  let complimentaryMinutes = 0;
  let allowance: Allowance | null = null;
  let problem: string | null = null;
  if (input.bookingType === "complimentary") {
    complimentaryMinutes = minutes;
    if (ctx.familyId) {
      allowance = await allowanceFor(db, ctx.familyId, input.date, { cfg, workspaceId: ws.id, now, excludeGroupId: ctx.excludeGroupId });
      if (!ctx.override) {
        if (!allowance.eligible) problem = "Complimentary workspace time isn’t included for your family. Paid options may still be available.";
        else if (allowance.remainingMinutes < minutes)
          problem =
            allowance.remainingMinutes === 0
              ? "You’ve used your complimentary workspace time for today. You can still explore available paid options."
              : `You have ${allowance.remainingMinutes} complimentary minutes left that day.`;
      }
    }
  } else {
    rate = await rateFor(db, ws, input.bookingType, input.date);
    if (!rate) problem = `${BOOKING_TYPE_LABEL[input.bookingType]} reservations for ${ws.name} don’t have a price yet, so they can’t be booked online.`;
    else priceCents = priceFor(rate, input.bookingType, minutes);
  }
  const c = await conflictsFor(db, ws.id, intervals, now, { excludeGroupId: ctx.excludeGroupId, ignoreBlocks: ctx.override });
  if (c.reserved) problem = "Looks like this space is spoken for. Try another time or explore a different workspace.";
  else if (c.blocked) problem = `${ws.name} is unavailable then. Try another time or explore a different workspace.`;
  return {
    workspace: { id: ws.id, name: ws.name, category: ws.category as Category },
    bookingType: input.bookingType,
    intervals: intervals.map((i) => ({ localDate: i.localDate, startsAt: i.startsAt.toISOString(), endsAt: i.endsAt.toISOString() })),
    minutes,
    priceCents,
    rate: rate ? { id: rate.id, priceCents: rate.priceCents, unit: RATE_UNIT[input.bookingType as PaidBookingType] } : null,
    complimentaryMinutes,
    allowance,
    available: !problem,
    problem,
  };
}

/* ── Create ── */

export type CreateOptions = {
  familyId: string;
  guardianId?: string | null;
  source: "portal" | "admin";
  /** Staff override: skips opening hours, notice, blocks and allowance. Never allows overlapping another reservation. */
  override?: boolean;
  /** For paid types: pay_now holds the time until the provider confirms payment; invoice confirms now and bills later; none confirms at no charge. */
  charge?: "pay_now" | "invoice" | "none";
  staffNote?: string | null;
  excludeGroupId?: string;
  now?: Date;
};

/** Creates a reservation inside an existing transaction (so a move can cancel and re-create atomically). */
export async function reserveInTx(tx: Executor, actor: Actor, input: ReserveInput, opts: CreateOptions) {
  const now = opts.now ?? new Date();
  // Lock order is always family, then workspace, everywhere in this module.
  await tx.select({ id: families.id }).from(families).where(eq(families.id, opts.familyId)).for("update");
  const [ws] = await tx.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).for("update");
  if (!ws) throw new OpsError("not_found", "That workspace isn’t available.");
  const q = await quoteSpace(tx, input, { familyId: opts.familyId, override: opts.override, excludeGroupId: opts.excludeGroupId, now });
  if (!q.available) {
    const takenNow = q.problem?.startsWith("Looks like this space is spoken for");
    throw new OpsError(takenNow ? "taken" : "unavailable", takenNow ? TAKEN_MESSAGE : q.problem!);
  }
  const cfg = await getSpaceConfig(tx);
  const paid = input.bookingType !== "complimentary";
  const charge = paid ? (opts.charge ?? "pay_now") : "none";
  const holdMinutes = await getPolicy(tx, "booking.holdMinutes");
  const holdExpiresAt = charge === "pay_now" && q.priceCents > 0 ? new Date(now.getTime() + holdMinutes * 60000) : null;
  const status = holdExpiresAt ? "held" : "confirmed";
  const [group] = await tx
    .insert(spaceReservationGroups)
    .values({
      reference: newReference(),
      familyId: opts.familyId,
      workspaceId: ws.id,
      bookingType: input.bookingType,
      status,
      totalCents: charge === "none" ? 0 : q.priceCents,
      complimentaryMinutes: q.complimentaryMinutes,
      priceSnapshot: q.rate ? { rateId: q.rate.id, rateCents: q.rate.priceCents, unit: q.rate.unit, chargedCents: charge === "none" ? 0 : q.priceCents, charge } : { complimentary: true },
      policySnapshot: { complimentary: cfg.complimentary, cancellation: cfg.cancellation, half: input.half ?? null, override: !!opts.override },
      holdExpiresAt,
      source: opts.source,
      createdByGuardianId: opts.guardianId ?? null,
      createdByStaff: actor.type === "staff" ? actor.name : null,
      staffNote: opts.staffNote ?? null,
    })
    .returning();
  const perDay = q.intervals.length ? Math.round((charge === "none" ? 0 : q.priceCents) / q.intervals.length) : 0;
  await tx.insert(spaceReservations).values(
    q.intervals.map((i) => ({
      groupId: group.id,
      workspaceId: ws.id,
      familyId: opts.familyId,
      localDate: i.localDate,
      startsAt: new Date(i.startsAt),
      endsAt: new Date(i.endsAt),
      status: status === "held" ? "held" : "confirmed",
      holdExpiresAt,
      complimentaryMinutes: input.bookingType === "complimentary" ? (new Date(i.endsAt).getTime() - new Date(i.startsAt).getTime()) / 60000 : 0,
      priceCents: perDay,
    })),
  );
  if (paid && charge !== "none" && q.priceCents > 0) {
    const inv = await createInvoice(tx, actor, {
      familyId: opts.familyId,
      description: `Workspace ${group.reference}`,
      lines: [{ kind: "charge", description: describeGroupLine(ws, input.bookingType, q.intervals), unitCents: q.priceCents }],
    });
    await tx.update(invoices).set({ spaceGroupId: group.id }).where(eq(invoices.id, inv.id));
  }
  await audit(tx, actor, {
    action: "spaces.reserve",
    entityType: "space_reservation",
    entityId: group.id,
    summary: `${status === "held" ? "Held" : "Reserved"} ${ws.name} (${BOOKING_TYPE_LABEL[input.bookingType]}) · ${describeWhen(q.intervals)} · ${group.reference}${opts.override ? " · staff override" : ""}`,
  });
  return group;
}

export function describeWhen(intervals: { localDate: string; startsAt: string | Date; endsAt: string | Date }[]) {
  if (!intervals.length) return "";
  const first = intervals[0];
  const last = intervals[intervals.length - 1];
  if (intervals.length > 1) return `${fmtDate(first.localDate, "EEE MMM d")} – ${fmtDate(last.localDate, "EEE MMM d")}, ${fmtTime(first.startsAt)} – ${fmtTime(first.endsAt)} daily`;
  return `${fmtDate(first.localDate, "EEE MMM d")}, ${fmtTime(first.startsAt)} – ${fmtTime(first.endsAt)}`;
}

function describeGroupLine(ws: Pick<Workspace, "name" | "category">, type: BookingType, intervals: Quote["intervals"]) {
  return `${ws.name} · ${CATEGORY_LABEL[ws.category as Category]} · ${BOOKING_TYPE_LABEL[type]} · ${describeWhen(intervals)}`;
}

export async function createReservation(db: DB, actor: Actor, input: ReserveInput, opts: CreateOptions) {
  const group = await db.transaction((tx) => reserveInTx(tx, actor, input, opts));
  if (group.status === "confirmed") await sendConfirmation(db, group.id);
  return group;
}

/* ── Paid checkout ── */

export async function startSpaceCheckout(db: DB, actor: Actor, groupId: string, urls: { base: string }) {
  const [g] = await db.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, groupId));
  if (!g) throw new OpsError("not_found", "Reservation not found.");
  const confirmUrl = `${urls.base}/portal/spaces/confirmation/${g.reference}`;
  if (g.status === "confirmed") return { url: confirmUrl, free: true };
  if (!["held", "pending_payment"].includes(g.status)) throw new OpsError("invalid", "This reservation can no longer be paid for.");
  if (!g.holdExpiresAt || g.holdExpiresAt <= new Date()) throw new OpsError("expired", "Your hold has expired. Please choose your time again.");
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.spaceGroupId, g.id), ne(invoices.status, "void")));
  if (!inv) throw new OpsError("invalid", "No payment is due for this reservation.");
  const t = (await invoiceTotals(db, [inv.id])).get(inv.id)!;
  if (t.balance <= 0) {
    await confirmSpaceGroup(db, actor, g.id, { reason: "No payment due" });
    return { url: confirmUrl, free: true };
  }
  const [primary] = await db.select().from(guardians).where(and(eq(guardians.familyId, g.familyId), eq(guardians.isPrimary, true)));
  const provider = activeProvider();
  let idem = `space-checkout:${g.id}:${inv.id}:${t.balance}:${g.holdExpiresAt.getTime()}`;
  const [existing] = await db.select().from(payments).where(eq(payments.idempotencyKey, idem));
  if (existing?.checkoutRef && existing.status === "pending")
    return { url: provider.name === "test" ? `${urls.base}/pay/test/${existing.checkoutRef}` : (existing.providerRef ?? confirmUrl), free: false };
  if (existing) idem = `${idem}:retry-${randomToken(6)}`;
  const paymentId = crypto.randomUUID();
  const checkout = await provider.createCheckout({
    paymentId,
    amountCents: t.balance,
    description: `Yalla workspace ${g.reference}`,
    customerEmail: primary?.email,
    successUrl: confirmUrl,
    cancelUrl: `${confirmUrl}?cancelled=1`,
    expiresAt: g.holdExpiresAt,
    idempotencyKey: idem,
  });
  await db.insert(payments).values({
    id: paymentId,
    invoiceId: inv.id,
    familyId: g.familyId,
    amountCents: t.balance,
    method: "card",
    status: "pending",
    provider: provider.name,
    checkoutRef: checkout.checkoutRef,
    providerRef: provider.name === "stripe" ? checkout.url : null,
    idempotencyKey: idem,
  });
  await db.update(spaceReservationGroups).set({ status: "pending_payment", updatedAt: new Date() }).where(eq(spaceReservationGroups.id, g.id));
  return { url: provider.name === "test" ? `${urls.base}${checkout.url}` : checkout.url, free: false };
}

/**
 * Confirms a held reservation once payment is verified. Idempotent. If the hold lapsed, the time is
 * re-checked under lock; when it's been taken the reservation is flagged for staff (who refund or
 * rebook) rather than double-booked.
 */
export async function confirmSpaceGroup(db: DB, actor: Actor, groupId: string, opts: { reason: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const result = await db.transaction(async (tx) => {
    const [g] = await tx.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, groupId)).for("update");
    if (!g) throw new OpsError("not_found", "Reservation not found.");
    if (g.status === "confirmed" || g.status === "needs_attention") return { status: g.status, changed: false };
    await tx.select({ id: families.id }).from(families).where(eq(families.id, g.familyId)).for("update");
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, g.workspaceId)).for("update");
    const rows = await tx.select().from(spaceReservations).where(eq(spaceReservations.groupId, g.id));
    const stillHeld = g.status !== "cancelled" && g.holdExpiresAt != null && g.holdExpiresAt > now;
    if (!stillHeld) {
      const c = await conflictsFor(tx, g.workspaceId, rows, now, { excludeGroupId: g.id, ignoreBlocks: false });
      if (c.reserved || c.blocked || g.status === "cancelled") {
        await tx.update(spaceReservationGroups).set({ status: "needs_attention", updatedAt: now }).where(eq(spaceReservationGroups.id, g.id));
        await tx.update(spaceReservations).set({ status: "expired" }).where(eq(spaceReservations.groupId, g.id));
        await audit(tx, actor, {
          action: "spaces.needs_attention",
          entityType: "space_reservation",
          entityId: g.id,
          summary: `Payment for ${g.reference} arrived after its hold ended and the time is no longer available — refund or rebook needed`,
        });
        return { status: "needs_attention", changed: true };
      }
    }
    await tx.update(spaceReservations).set({ status: "confirmed", holdExpiresAt: null }).where(eq(spaceReservations.groupId, g.id));
    await tx.update(spaceReservationGroups).set({ status: "confirmed", holdExpiresAt: null, updatedAt: now }).where(eq(spaceReservationGroups.id, g.id));
    await audit(tx, actor, { action: "spaces.confirm", entityType: "space_reservation", entityId: g.id, summary: `Confirmed ${g.reference}: ${opts.reason}` });
    return { status: "confirmed", changed: true };
  });
  if (result.changed && result.status === "confirmed") await sendConfirmation(db, groupId);
  return result;
}

async function sendConfirmation(db: Executor, groupId: string) {
  const d = await groupDetail(db, groupId);
  if (!d) return;
  await notifyFamily(db, {
    key: "space_confirmation",
    familyId: d.group.familyId,
    vars: {
      reference: d.group.reference,
      workspace: `${d.workspace.name} (${CATEGORY_LABEL[d.workspace.category as Category]})`,
      when: describeWhen(d.rows),
      amount: d.group.totalCents ? usd(d.group.totalCents) : "Included with tuition",
    },
    related: { type: "space_reservation", id: groupId },
  });
}

/* ── Read models ── */

export async function groupDetail(db: Executor, groupId: string) {
  const [group] = await db.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, groupId));
  if (!group) return null;
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, group.workspaceId));
  const rows = await db.select().from(spaceReservations).where(eq(spaceReservations.groupId, groupId)).orderBy(asc(spaceReservations.startsAt));
  const [inv] = await db.select().from(invoices).where(eq(invoices.spaceGroupId, groupId));
  const totals = inv ? (await invoiceTotals(db, [inv.id])).get(inv.id) : undefined;
  return { group, workspace, rows, invoice: inv ?? null, totals: totals ?? null };
}

export function paymentStatusOf(group: { totalCents: number; status: string; bookingType: string }, invoice: { status: string } | null, totals: { balance: number; refunded: number } | null) {
  if (group.totalCents === 0) return group.bookingType === "complimentary" ? "Included with tuition" : "No charge";
  if (!invoice) return "—";
  if (invoice.status === "void") return "Void";
  if (totals && totals.refunded > 0) return totals.balance <= 0 ? "Refunded" : "Partly refunded";
  if (invoice.status === "paid") return "Paid";
  return group.status === "held" || group.status === "pending_payment" ? "Awaiting payment" : "Due";
}

/* ── Cancel & move ── */

export async function cancelSpaceGroup(db: DB, actor: Actor, groupId: string, opts: { familyId?: string; reason: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const cfg = await getSpaceConfig(db);
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, groupId)).for("update");
    // Families can only touch their own reservations; anything else looks like it doesn't exist.
    if (!g || (opts.familyId && g.familyId !== opts.familyId)) throw new OpsError("not_found", "Reservation not found.");
    if (["cancelled", "expired"].includes(g.status)) return g;
    const [first] = await tx.select().from(spaceReservations).where(eq(spaceReservations.groupId, g.id)).orderBy(asc(spaceReservations.startsAt)).limit(1);
    if (opts.familyId) {
      const unpaidHold = g.status === "held" || g.status === "pending_payment";
      if (first && first.startsAt <= now && !unpaidHold) throw new OpsError("started", "This reservation has already started.");
      if (g.totalCents > 0 && !unpaidHold) {
        if (cfg.cancellation.paidFamilyCancel === "contact") throw new OpsError("contact", "To change or cancel a paid reservation, please contact Yalla and we’ll take care of it.");
        if (first && first.startsAt.getTime() - now.getTime() < cfg.cancellation.paidCutoffHours * 3600_000)
          throw new OpsError("cutoff", `Paid reservations can be cancelled online until ${cfg.cancellation.paidCutoffHours} hours before they start. Please contact Yalla.`);
      }
      if (g.totalCents === 0 && first && first.startsAt.getTime() - now.getTime() < cfg.cancellation.complimentaryCutoffMinutes * 60000)
        throw new OpsError("cutoff", `Reservations can be cancelled until ${cfg.cancellation.complimentaryCutoffMinutes} minutes before they start.`);
    }
    await tx.update(spaceReservations).set({ status: "cancelled" }).where(and(eq(spaceReservations.groupId, g.id), inArray(spaceReservations.status, ["held", "confirmed"])));
    const [updated] = await tx
      .update(spaceReservationGroups)
      .set({ status: "cancelled", cancelledAt: now, cancelledBy: actor.name, cancellationReason: opts.reason, holdExpiresAt: null, updatedAt: now })
      .where(eq(spaceReservationGroups.id, g.id))
      .returning();
    // An unpaid hold's open invoice is voided; a paid one is left for staff to refund or credit.
    if (g.status === "held" || g.status === "pending_payment") await voidOpenInvoice(tx, actor, g.id, "Reservation cancelled before payment");
    await audit(tx, actor, {
      action: "spaces.cancel",
      entityType: "space_reservation",
      entityId: g.id,
      summary: `Cancelled ${g.reference}${opts.reason ? `: ${opts.reason}` : ""}${g.totalCents > 0 && g.status === "confirmed" ? ` · paid ${usd(g.totalCents)} — refund or credit is decided by staff (${cfg.cancellation.paidRefund})` : ""}`,
    });
    return updated;
  });
}

/**
 * Moves a single-interval reservation to a new time, atomically: the old time is released and the
 * new one checked and taken in one transaction, so a failed move leaves the original untouched.
 * Families can move complimentary reservations; staff can move any non-weekly reservation.
 */
export async function moveSpaceGroup(db: DB, actor: Actor, groupId: string, next: ReserveInput, opts: { familyId?: string; override?: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const cfg = await getSpaceConfig(db);
  const moved = await db.transaction(async (tx) => {
    const [g] = await tx.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, groupId)).for("update");
    if (!g || (opts.familyId && g.familyId !== opts.familyId)) throw new OpsError("not_found", "Reservation not found.");
    if (g.status !== "confirmed") throw new OpsError("invalid", "Only confirmed reservations can be moved.");
    if (g.bookingType === "week") throw new OpsError("invalid", "Weekly reservations can’t be moved. Cancel and book again, or contact Yalla.");
    if (opts.familyId && g.bookingType !== "complimentary") throw new OpsError("contact", "To change a paid reservation, please contact Yalla and we’ll take care of it.");
    if (next.bookingType !== g.bookingType) throw new OpsError("invalid", "A move keeps the same kind of booking.");
    const [first] = await tx.select().from(spaceReservations).where(eq(spaceReservations.groupId, g.id)).limit(1);
    if (opts.familyId && first && first.startsAt.getTime() - now.getTime() < cfg.cancellation.complimentaryCutoffMinutes * 60000)
      throw new OpsError("cutoff", "This reservation can no longer be changed online.");
    await tx.select({ id: families.id }).from(families).where(eq(families.id, g.familyId)).for("update");
    const lockIds = [...new Set([g.workspaceId, next.workspaceId])].sort();
    await tx.select({ id: workspaces.id }).from(workspaces).where(inArray(workspaces.id, lockIds)).orderBy(workspaces.id).for("update");
    // Old rows are kept (as "moved") for the record; only held/confirmed rows count anywhere.
    await tx.update(spaceReservations).set({ status: "moved" }).where(and(eq(spaceReservations.groupId, g.id), eq(spaceReservations.status, "confirmed")));
    const q = await quoteSpace(tx, next, { familyId: g.familyId, override: opts.override, now });
    if (!q.available) throw new OpsError("taken", q.problem?.startsWith("Looks like") ? TAKEN_MESSAGE : q.problem!);
    const [ws] = await tx.select().from(workspaces).where(eq(workspaces.id, next.workspaceId));
    await tx.insert(spaceReservations).values(
      q.intervals.map((i) => ({
        groupId: g.id,
        workspaceId: ws.id,
        familyId: g.familyId,
        localDate: i.localDate,
        startsAt: new Date(i.startsAt),
        endsAt: new Date(i.endsAt),
        status: "confirmed",
        complimentaryMinutes: g.bookingType === "complimentary" ? q.minutes : 0,
        priceCents: g.totalCents,
      })),
    );
    await tx
      .update(spaceReservationGroups)
      .set({ workspaceId: ws.id, complimentaryMinutes: g.bookingType === "complimentary" ? q.minutes : 0, updatedAt: now })
      .where(eq(spaceReservationGroups.id, g.id));
    await audit(tx, actor, { action: "spaces.move", entityType: "space_reservation", entityId: g.id, summary: `Moved ${g.reference} to ${ws.name}, ${describeWhen(q.intervals)}` });
    return g.id;
  });
  await sendConfirmation(db, moved);
  return moved;
}

async function voidOpenInvoice(tx: Executor, actor: Actor, groupId: string, reason: string) {
  const open = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.spaceGroupId, groupId), eq(invoices.status, "open")));
  for (const inv of open) {
    const t = (await invoiceTotals(tx, [inv.id])).get(inv.id)!;
    if (!t.paid && !t.creditApplied) await voidInvoice(tx, actor, inv.id, reason);
  }
}

/* ── Housekeeping ── */

/** Marks lapsed paid holds as expired and voids their unpaid invoices (availability already ignores them). */
export async function expireSpaceHolds(db: DB, now = new Date()) {
  const lapsed = await db
    .select({ id: spaceReservationGroups.id })
    .from(spaceReservationGroups)
    .where(and(inArray(spaceReservationGroups.status, ["held", "pending_payment"]), lt(spaceReservationGroups.holdExpiresAt, now)));
  for (const { id } of lapsed) {
    await db.transaction(async (tx) => {
      const [g] = await tx.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, id)).for("update");
      if (!g || !["held", "pending_payment"].includes(g.status) || !g.holdExpiresAt || g.holdExpiresAt >= now) return;
      const [paid] = await tx
        .select({ id: payments.id })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .where(and(eq(invoices.spaceGroupId, g.id), eq(payments.status, "succeeded")));
      if (paid) return; // The webhook will confirm (or flag) it.
      await tx.update(spaceReservations).set({ status: "expired" }).where(eq(spaceReservations.groupId, g.id));
      await tx.update(spaceReservationGroups).set({ status: "expired", updatedAt: now }).where(eq(spaceReservationGroups.id, g.id));
      await voidOpenInvoice(tx, SYSTEM, g.id, "Checkout hold expired");
    });
  }
  return lapsed.length;
}
