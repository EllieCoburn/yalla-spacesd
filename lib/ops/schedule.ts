/**
 * Scheduling: one-off sessions, weekly series, camps booked as a series, multiple time blocks,
 * blackout dates, exceptions and scoped edits (this occurrence / this and following / whole series).
 *
 * Wall-clock times are interpreted in America/Los_Angeles per date, so a 9:00 session stays at
 * 9:00 local time across daylight-saving changes.
 *
 * Changes that affect booked families are previewed first and never silently alter bookings,
 * charges or notifications.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { blackoutDates, bookingItems, bookings, children, families, programs, scheduleSeries, sessions } from "@/lib/db/schema";
import { addDaysISO, eachDate, fmtDate, todayLA, weekdayOf, zonedDateTime } from "@/lib/time";
import { availabilityFor, lockSessions } from "./capacity";
import { notifyFamily } from "@/lib/notify";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type SeriesInput = {
  programId: string;
  title?: string | null;
  weekdays: number[];
  /** Repeat monthly on the nth matching weekday (1–4, or 5 = last) instead of every week. */
  monthWeek?: number | null;
  startTime: string;
  endTime: string;
  startsOn: string;
  endsOn: string;
  capacity: number;
  hardCapacity?: number | null;
  locationId?: string | null;
  cohortId?: string | null;
  capacityPoolId?: string | null;
  /** Age group in months, overriding the program's age range. */
  minAgeMonths?: number | null;
  maxAgeMonths?: number | null;
  bookAsSeries?: boolean;
  priceCents?: number | null;
  bookingOpensAt?: Date | null;
  bookingClosesAt?: Date | null;
};

/** Which week of the month a date falls in for its weekday: 1–4, or 5 when it is the last one. */
export function monthWeekOf(date: string, wantLast: boolean): number {
  const day = Number(date.slice(8, 10));
  if (wantLast && day + 7 > new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate()) return 5;
  return Math.ceil(day / 7);
}

function validateAges(min?: number | null, max?: number | null) {
  if (min != null && max != null && max < min) throw new OpsError("invalid", "The oldest age must be at or above the youngest age.");
}

function validateTimes(start: string, end: string) {
  if (!HHMM.test(start) || !HHMM.test(end)) throw new OpsError("invalid", "Use times like 08:30.");
  if (end <= start) throw new OpsError("invalid", "The end time must be after the start time.");
}

async function blackoutSet(db: Executor, from: string, to: string, programId: string, locationId?: string | null) {
  const rows = await db
    .select()
    .from(blackoutDates)
    .where(and(lte(blackoutDates.startsOn, to), gte(blackoutDates.endsOn, from)));
  const out = new Set<string>();
  for (const b of rows) {
    if (b.programId && b.programId !== programId) continue;
    if (b.locationId && locationId && b.locationId !== locationId) continue;
    for (const d of eachDate(b.startsOn > from ? b.startsOn : from, b.endsOn < to ? b.endsOn : to)) out.add(d);
  }
  return out;
}

export async function createSeries(db: DB, actor: Actor, input: SeriesInput) {
  validateTimes(input.startTime, input.endTime);
  if (!input.weekdays.length) throw new OpsError("invalid", "Choose at least one weekday.");
  if (input.endsOn < input.startsOn) throw new OpsError("invalid", "The end date must be on or after the start date.");
  if (input.capacity < 1) throw new OpsError("invalid", "Capacity must be at least 1.");
  if (input.hardCapacity != null && input.hardCapacity < input.capacity) throw new OpsError("invalid", "Hard capacity can’t be lower than capacity.");
  if (input.monthWeek != null && (input.monthWeek < 1 || input.monthWeek > 5)) throw new OpsError("invalid", "Choose which week of the month.");
  validateAges(input.minAgeMonths, input.maxAgeMonths);
  const [program] = await db.select().from(programs).where(eq(programs.id, input.programId));
  if (!program) throw new OpsError("not_found", "Program not found.");
  const locationId = input.locationId ?? program.locationId;
  const closed = await blackoutSet(db, input.startsOn, input.endsOn, input.programId, locationId);
  const dates = eachDate(input.startsOn, input.endsOn).filter(
    (d) => input.weekdays.includes(weekdayOf(d)) && (input.monthWeek == null || monthWeekOf(d, input.monthWeek === 5) === input.monthWeek),
  );
  if (dates.length > 400) throw new OpsError("invalid", "That creates more than 400 sessions. Use a shorter date range.");

  return db.transaction(async (tx) => {
    const [series] = await tx
      .insert(scheduleSeries)
      .values({ ...input, monthWeek: input.monthWeek ?? null, locationId, title: input.title ?? null, bookAsSeries: input.bookAsSeries ?? false })
      .returning();
    const rows = dates.map((d) => ({
      programId: input.programId,
      seriesId: series.id,
      title: input.title ?? null,
      localDate: d,
      startsAt: zonedDateTime(d, input.startTime),
      endsAt: zonedDateTime(d, input.endTime),
      capacity: input.capacity,
      hardCapacity: input.hardCapacity ?? null,
      locationId,
      cohortId: input.cohortId ?? null,
      capacityPoolId: input.capacityPoolId ?? null,
      minAgeMonths: input.minAgeMonths ?? null,
      maxAgeMonths: input.maxAgeMonths ?? null,
      priceCents: input.priceCents ?? null,
      bookingOpensAt: input.bookingOpensAt ?? null,
      bookingClosesAt: input.bookingClosesAt ?? null,
      status: closed.has(d) ? "closed" : "scheduled",
      notes: closed.has(d) ? "Closed (blackout date)" : null,
    }));
    if (rows.length) await tx.insert(sessions).values(rows);
    await audit(tx, actor, {
      action: "schedule.series_create",
      entityType: "program",
      entityId: input.programId,
      summary: `Added ${rows.length} session(s) for ${program.name}, ${input.startTime}–${input.endTime}, ${fmtDate(input.startsOn)} to ${fmtDate(input.endsOn)}`,
    });
    return { series, count: rows.length, closed: rows.filter((r) => r.status === "closed").length };
  });
}

export async function createSession(
  db: DB,
  actor: Actor,
  input: Omit<SeriesInput, "weekdays" | "monthWeek" | "startsOn" | "endsOn" | "bookAsSeries"> & { localDate: string },
) {
  validateTimes(input.startTime, input.endTime);
  validateAges(input.minAgeMonths, input.maxAgeMonths);
  const [program] = await db.select().from(programs).where(eq(programs.id, input.programId));
  if (!program) throw new OpsError("not_found", "Program not found.");
  const closed = await blackoutSet(db, input.localDate, input.localDate, input.programId, input.locationId ?? program.locationId);
  const [s] = await db
    .insert(sessions)
    .values({
      programId: input.programId,
      title: input.title ?? null,
      localDate: input.localDate,
      startsAt: zonedDateTime(input.localDate, input.startTime),
      endsAt: zonedDateTime(input.localDate, input.endTime),
      capacity: input.capacity,
      hardCapacity: input.hardCapacity ?? null,
      locationId: input.locationId ?? program.locationId,
      cohortId: input.cohortId ?? null,
      capacityPoolId: input.capacityPoolId ?? null,
      minAgeMonths: input.minAgeMonths ?? null,
      maxAgeMonths: input.maxAgeMonths ?? null,
      priceCents: input.priceCents ?? null,
      bookingOpensAt: input.bookingOpensAt ?? null,
      bookingClosesAt: input.bookingClosesAt ?? null,
      status: closed.has(input.localDate) ? "closed" : "scheduled",
    })
    .returning();
  await audit(db, actor, { action: "schedule.session_create", entityType: "session", entityId: s.id, summary: `Added ${program.name} on ${fmtDate(s.localDate)}` });
  return s;
}

export async function duplicateSession(db: DB, actor: Actor, sessionId: string, toDate: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!s) throw new OpsError("not_found", "Session not found.");
  const t = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return createSession(db, actor, {
    programId: s.programId,
    title: s.title,
    localDate: toDate,
    startTime: t(s.startsAt),
    endTime: t(s.endsAt),
    capacity: s.capacity,
    hardCapacity: s.hardCapacity,
    locationId: s.locationId,
    cohortId: s.cohortId,
    capacityPoolId: s.capacityPoolId,
    minAgeMonths: s.minAgeMonths,
    maxAgeMonths: s.maxAgeMonths,
    priceCents: s.priceCents,
  });
}

export async function copySeries(db: DB, actor: Actor, seriesId: string, startsOn: string, endsOn: string) {
  const [src] = await db.select().from(scheduleSeries).where(eq(scheduleSeries.id, seriesId));
  if (!src) throw new OpsError("not_found", "Schedule not found.");
  return createSeries(db, actor, {
    programId: src.programId,
    title: src.title,
    weekdays: src.weekdays,
    monthWeek: src.monthWeek,
    startTime: src.startTime,
    endTime: src.endTime,
    startsOn,
    endsOn,
    capacity: src.capacity,
    hardCapacity: src.hardCapacity,
    locationId: src.locationId,
    cohortId: src.cohortId,
    capacityPoolId: src.capacityPoolId,
    minAgeMonths: src.minAgeMonths,
    maxAgeMonths: src.maxAgeMonths,
    bookAsSeries: src.bookAsSeries,
    priceCents: src.priceCents,
  });
}

/* ── Scoped edits ── */

export type EditScope = "this" | "following" | "all";
export type SessionChanges = {
  startTime?: string;
  endTime?: string;
  capacity?: number;
  hardCapacity?: number | null;
  reservedSpots?: number;
  priceCents?: number | null;
  status?: "scheduled" | "closed" | "cancelled";
  notes?: string | null;
  bookingOpensAt?: Date | null;
  bookingClosesAt?: Date | null;
};

async function targetSessions(db: Executor, sessionId: string, scope: EditScope) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!s) throw new OpsError("not_found", "Session not found.");
  if (scope === "this" || !s.seriesId) return { anchor: s, targets: [s] };
  const today = todayLA();
  const from = scope === "following" ? s.localDate : today > s.localDate ? today : s.localDate;
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.seriesId, s.seriesId), gte(sessions.localDate, scope === "all" ? today : from), eq(sessions.isException, false)))
    .orderBy(asc(sessions.localDate));
  // The anchor is always included, even if it's an exception or earlier than today.
  if (!rows.find((r) => r.id === s.id)) rows.unshift(s);
  return { anchor: s, targets: rows };
}

export type ChangePreview = {
  sessions: { id: string; localDate: string; booked: number; capacity: number }[];
  affected: { bookingId: string; reference: string; familyId: string; familyName: string; children: string[]; sessionDate: string }[];
  blockers: string[];
  consequences: string[];
};

export async function previewSessionChange(db: Executor, sessionId: string, scope: EditScope, changes: SessionChanges): Promise<ChangePreview> {
  if (changes.startTime || changes.endTime) {
    const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    validateTimes(changes.startTime ?? fmt(s.startsAt), changes.endTime ?? fmt(s.endsAt));
  }
  const { targets } = await targetSessions(db, sessionId, scope);
  const ids = targets.map((t) => t.id);
  const avail = await availabilityFor(db, ids);
  const affectedRows = ids.length
    ? await db
        .select({ b: bookings, f: families, c: children, s: sessions })
        .from(bookingItems)
        .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
        .innerJoin(families, eq(families.id, bookings.familyId))
        .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
        .leftJoin(children, eq(children.id, bookingItems.childId))
        .where(and(inArray(bookingItems.sessionId, ids), inArray(bookingItems.status, ["confirmed", "held"])))
    : [];
  const byBooking = new Map<string, ChangePreview["affected"][number]>();
  for (const r of affectedRows) {
    const key = `${r.b.id}:${r.s.id}`;
    const e = byBooking.get(key) ?? { bookingId: r.b.id, reference: r.b.reference, familyId: r.f.id, familyName: r.f.name, children: [], sessionDate: r.s.localDate };
    if (r.c) e.children.push(r.c.preferredName || r.c.firstName);
    byBooking.set(key, e);
  }
  const blockers: string[] = [];
  const consequences: string[] = [];
  for (const t of targets) {
    const a = avail.get(t.id)!;
    const used = a.occupancy.used - a.occupancy.reserved + (changes.reservedSpots ?? t.reservedSpots);
    const cap = changes.capacity ?? t.capacity;
    const hard = changes.hardCapacity === undefined ? t.hardCapacity : changes.hardCapacity;
    if (hard != null && hard < cap) blockers.push(`Hard capacity can’t be lower than capacity (${fmtDate(t.localDate)}).`);
    if (changes.status !== "cancelled" && changes.status !== "closed" && cap < used)
      blockers.push(`${fmtDate(t.localDate)} already has ${used} spots taken; capacity can’t go below that. Move or cancel bookings first.`);
  }
  const affected = [...byBooking.values()];
  if (affected.length) {
    if (changes.startTime || changes.endTime) consequences.push(`${affected.length} booking(s) will show the new time. Families are only notified if you choose to notify them.`);
    if (changes.status === "cancelled" || changes.status === "closed")
      consequences.push(`${affected.length} booking(s) are on these dates. Their bookings and payments are not changed automatically — they’ll appear for follow-up (cancel, move or refund each one).`);
    if (changes.priceCents !== undefined) consequences.push("Price changes apply to new bookings only. Existing bookings keep the price they were charged.");
  }
  return {
    sessions: targets.map((t) => ({ id: t.id, localDate: t.localDate, booked: avail.get(t.id)!.occupancy.used, capacity: t.capacity })),
    affected,
    blockers,
    consequences,
  };
}

export async function applySessionChange(db: DB, actor: Actor, input: { sessionId: string; scope: EditScope; changes: SessionChanges; notifyFamilies: boolean; confirmAffected: boolean }) {
  const preview = await previewSessionChange(db, input.sessionId, input.scope, input.changes);
  if (preview.blockers.length) throw new OpsError("blocked", preview.blockers[0], preview);
  if (preview.affected.length && !input.confirmAffected) throw new OpsError("confirm_required", "Review the affected families and confirm before applying.", preview);

  await db.transaction(async (tx) => {
    const { anchor, targets } = await targetSessions(tx, input.sessionId, input.scope);
    await lockSessions(
      tx,
      targets.map((t) => t.id),
    );
    const c = input.changes;
    let seriesId = anchor.seriesId;

    if (anchor.seriesId && input.scope === "following") {
      // Split: the old series ends the day before; a new series carries the changes forward.
      const [old] = await tx.select().from(scheduleSeries).where(eq(scheduleSeries.id, anchor.seriesId));
      const [next] = await tx
        .insert(scheduleSeries)
        .values({
          ...old,
          id: crypto.randomUUID(),
          startsOn: anchor.localDate,
          startTime: c.startTime ?? old.startTime,
          endTime: c.endTime ?? old.endTime,
          capacity: c.capacity ?? old.capacity,
          hardCapacity: c.hardCapacity === undefined ? old.hardCapacity : c.hardCapacity,
          priceCents: c.priceCents === undefined ? old.priceCents : c.priceCents,
          createdAt: new Date(),
        })
        .returning();
      await tx.update(scheduleSeries).set({ endsOn: addDaysISO(anchor.localDate, -1) }).where(eq(scheduleSeries.id, old.id));
      seriesId = next.id;
    } else if (anchor.seriesId && input.scope === "all") {
      await tx
        .update(scheduleSeries)
        .set({
          ...(c.startTime ? { startTime: c.startTime } : {}),
          ...(c.endTime ? { endTime: c.endTime } : {}),
          ...(c.capacity != null ? { capacity: c.capacity } : {}),
          ...(c.hardCapacity !== undefined ? { hardCapacity: c.hardCapacity } : {}),
          ...(c.priceCents !== undefined ? { priceCents: c.priceCents } : {}),
        })
        .where(eq(scheduleSeries.id, anchor.seriesId));
    }

    const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    for (const t of targets) {
      const startTime = c.startTime ?? fmt(t.startsAt);
      const endTime = c.endTime ?? fmt(t.endsAt);
      await tx
        .update(sessions)
        .set({
          startsAt: zonedDateTime(t.localDate, startTime),
          endsAt: zonedDateTime(t.localDate, endTime),
          ...(c.capacity != null ? { capacity: c.capacity } : {}),
          ...(c.hardCapacity !== undefined ? { hardCapacity: c.hardCapacity } : {}),
          ...(c.reservedSpots != null ? { reservedSpots: c.reservedSpots } : {}),
          ...(c.priceCents !== undefined ? { priceCents: c.priceCents } : {}),
          ...(c.status ? { status: c.status } : {}),
          ...(c.notes !== undefined ? { notes: c.notes } : {}),
          ...(c.bookingOpensAt !== undefined ? { bookingOpensAt: c.bookingOpensAt } : {}),
          ...(c.bookingClosesAt !== undefined ? { bookingClosesAt: c.bookingClosesAt } : {}),
          ...(input.scope === "this" && t.seriesId ? { isException: true } : {}),
          ...(input.scope === "following" ? { seriesId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, t.id));
    }
    const [program] = await tx.select().from(programs).where(eq(programs.id, anchor.programId));
    await audit(tx, actor, {
      action: c.status === "cancelled" ? "schedule.cancel" : "schedule.edit",
      entityType: "session",
      entityId: anchor.id,
      summary: `${c.status === "cancelled" ? "Cancelled" : "Edited"} ${targets.length} ${program.name} session(s) (${input.scope === "this" ? "this occurrence" : input.scope === "following" ? "this and following" : "whole series"}) from ${fmtDate(anchor.localDate)}`,
      changes: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { to: v instanceof Date ? v.toISOString() : v }])),
    });
  });

  if (input.notifyFamilies && preview.affected.length) {
    const seen = new Set<string>();
    for (const a of preview.affected) {
      if (seen.has(a.bookingId)) continue;
      seen.add(a.bookingId);
      await notifyFamily(db, {
        key: "booking_change",
        familyId: a.familyId,
        vars: {
          reference: a.reference,
          change_summary:
            input.changes.status === "cancelled"
              ? `The session on ${fmtDate(a.sessionDate)} has been cancelled. We’ll be in touch about your options.`
              : `The session on ${fmtDate(a.sessionDate)} has been updated${input.changes.startTime ? ` to start at ${input.changes.startTime}` : ""}.`,
          booking_details: "",
        },
        related: { type: "booking", id: a.bookingId },
        createdBy: actor.name,
      });
    }
  }
  return preview;
}

/* ── Blackouts ── */

export async function previewBlackout(db: Executor, input: { startsOn: string; endsOn: string; programId?: string | null; locationId?: string | null }) {
  const rows = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(
      and(
        gte(sessions.localDate, input.startsOn),
        lte(sessions.localDate, input.endsOn),
        eq(sessions.status, "scheduled"),
        input.programId ? eq(sessions.programId, input.programId) : undefined,
        input.locationId ? eq(sessions.locationId, input.locationId) : undefined,
      ),
    );
  const ids = rows.map((r) => r.s.id);
  const avail = await availabilityFor(db, ids);
  return rows.map((r) => ({ id: r.s.id, program: r.p.name, localDate: r.s.localDate, booked: avail.get(r.s.id)!.occupancy.booked + avail.get(r.s.id)!.occupancy.held }));
}

export async function addBlackout(db: DB, actor: Actor, input: { startsOn: string; endsOn: string; reason: string; programId?: string | null; locationId?: string | null; confirmAffected: boolean }) {
  if (!input.reason.trim()) throw new OpsError("invalid", "Name the closure (e.g. Thanksgiving).");
  if (input.endsOn < input.startsOn) throw new OpsError("invalid", "The end date must be on or after the start date.");
  const affected = await previewBlackout(db, input);
  const withBookings = affected.filter((a) => a.booked > 0);
  if (withBookings.length && !input.confirmAffected) throw new OpsError("confirm_required", `${withBookings.length} session(s) in this range have bookings. Review and confirm.`, { affected });
  await db.transaction(async (tx) => {
    await tx.insert(blackoutDates).values({ startsOn: input.startsOn, endsOn: input.endsOn, reason: input.reason, programId: input.programId ?? null, locationId: input.locationId ?? null, createdBy: actor.name });
    if (affected.length)
      await tx
        .update(sessions)
        .set({ status: "closed", notes: `Closed: ${input.reason}`, updatedAt: new Date() })
        .where(
          inArray(
            sessions.id,
            affected.map((a) => a.id),
          ),
        );
    await audit(tx, actor, {
      action: "schedule.blackout",
      entityType: "schedule",
      summary: `Closure “${input.reason}” ${fmtDate(input.startsOn)}–${fmtDate(input.endsOn)}: closed ${affected.length} session(s)${withBookings.length ? `, ${withBookings.length} with bookings for follow-up` : ""}`,
    });
  });
  return { closed: affected.length, withBookings };
}

export async function sessionsInRange(db: Executor, from: string, to: string, filter: { programId?: string; locationId?: string } = {}) {
  return db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(
      and(
        gte(sessions.localDate, from),
        lte(sessions.localDate, to),
        filter.programId ? eq(sessions.programId, filter.programId) : undefined,
        filter.locationId ? eq(sessions.locationId, filter.locationId) : undefined,
        sql`${programs.status} <> 'archived'`,
      ),
    )
    .orderBy(asc(sessions.startsAt));
}
