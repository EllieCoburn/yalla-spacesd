/**
 * Yalla Flex vacancies. Every weekday has one session per age group (lib/booking/flex.ts) whose
 * capacity is the number of spots staff have released; 0 means full. Standing weekly vacancies
 * set the starting number for each new day; staff then add or remove spots for single days.
 * Spots are never set below what's already booked.
 */
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { blackoutDates, bookingItems, programs, sessions, settings } from "@/lib/db/schema";
import { FLEX_GROUPS, FLEX_HOURS, FLEX_SLUG, flexGroupFor, flexTitle, parseWeekly, type WeeklyVacancies } from "@/lib/booking/flex";
import { addDaysISO, todayLA, weekdayOf, zonedDateTime } from "@/lib/time";

const WEEKLY_KEY = "flex.weeklyVacancies";
/** How far ahead Flex days exist. */
export const FLEX_HORIZON_DAYS = 16 * 7;

export async function flexProgram(db: Executor) {
  const [p] = await db.select().from(programs).where(eq(programs.slug, FLEX_SLUG));
  return p ?? null;
}

export async function weeklyVacancies(db: Executor): Promise<WeeklyVacancies> {
  const [row] = await db.select().from(settings).where(eq(settings.key, WEEKLY_KEY));
  return parseWeekly(row?.value);
}

/** Make sure every weekday in the coming weeks has a session for each age group. */
export async function ensureFlexDays(db: Executor, opts: { from?: string; days?: number } = {}) {
  const p = await flexProgram(db);
  if (!p) return 0;
  const from = opts.from ?? todayLA();
  const to = addDaysISO(from, (opts.days ?? FLEX_HORIZON_DAYS) - 1);
  const weekly = await weeklyVacancies(db);
  const existing = await db
    .select({ localDate: sessions.localDate, minAge: sessions.minAgeMonths })
    .from(sessions)
    .where(and(eq(sessions.programId, p.id), gte(sessions.localDate, from), lte(sessions.localDate, to)));
  const have = new Set(existing.map((e) => `${e.localDate}|${e.minAge}`));
  // Yalla's closure days (for Flex or for everything): the day exists but is closed.
  const closures = await db
    .select()
    .from(blackoutDates)
    .where(and(lte(blackoutDates.startsOn, to), gte(blackoutDates.endsOn, from), or(eq(blackoutDates.programId, p.id), isNull(blackoutDates.programId))));
  const closedFor = (d: string) => closures.find((c) => c.startsOn <= d && c.endsOn >= d)?.reason ?? null;
  const rows: (typeof sessions.$inferInsert)[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const dow = weekdayOf(d);
    if (dow < 1 || dow > 5) continue;
    for (const g of FLEX_GROUPS) {
      if (have.has(`${d}|${g.minAge}`)) continue;
      const spots = weekly[g.key]?.[dow - 1] ?? 0;
      const closed = closedFor(d);
      rows.push({
        ...(closed ? { status: "closed", notes: `Closed: ${closed}` } : {}),
        programId: p.id,
        title: flexTitle(g),
        localDate: d,
        startsAt: zonedDateTime(d, FLEX_HOURS.start),
        endsAt: zonedDateTime(d, FLEX_HOURS.end),
        bookingClosesAt: zonedDateTime(d, FLEX_HOURS.bookBy),
        capacity: spots,
        hardCapacity: null,
        locationId: p.locationId,
        minAgeMonths: g.minAge,
        maxAgeMonths: g.maxAge,
        priceCents: g.fullCents,
      });
    }
  }
  if (rows.length) await db.insert(sessions).values(rows);
  return rows.length;
}

async function bookedBySession(db: Executor, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ id: bookingItems.sessionId, n: sql<number>`count(*)::int` })
    .from(bookingItems)
    .where(and(inArray(bookingItems.sessionId, ids), inArray(bookingItems.status, ["held", "confirmed"])))
    .groupBy(bookingItems.sessionId);
  return new Map(rows.map((r) => [r.id as string, r.n]));
}

/** Upcoming Flex days with released and booked spots, for the admin grid. */
export async function flexGrid(db: Executor, from: string, days: number) {
  const p = await flexProgram(db);
  if (!p) return { program: null, days: [] as { date: string; groups: { key: string; sessionId: string; released: number; booked: number; closed: boolean }[] }[] };
  const to = addDaysISO(from, days - 1);
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.programId, p.id), gte(sessions.localDate, from), lte(sessions.localDate, to)))
    .orderBy(asc(sessions.localDate));
  const booked = await bookedBySession(
    db,
    rows.map((r) => r.id),
  );
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) byDate.set(r.localDate, [...(byDate.get(r.localDate) ?? []), r]);
  return {
    program: p,
    days: [...byDate.entries()].map(([date, list]) => ({
      date,
      groups: FLEX_GROUPS.map((g) => {
        const s = list.find((x) => flexGroupFor(x.minAgeMonths)?.key === g.key);
        return s ? { key: g.key, sessionId: s.id, released: s.capacity, booked: booked.get(s.id) ?? 0, closed: s.status !== "scheduled" } : { key: g.key, sessionId: "", released: 0, booked: 0, closed: true };
      }),
    })),
  };
}

/** Release (+1) or take back (−1) a spot for one Flex day and age group. */
export async function adjustFlexSpots(db: Executor, actor: Actor, sessionId: string, delta: number) {
  const p = await flexProgram(db);
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!p || !s || s.programId !== p.id) throw new OpsError("not_found", "That Flex day wasn’t found.");
  const booked = (await bookedBySession(db, [s.id])).get(s.id) ?? 0;
  const next = Math.max(booked, 0, Math.min(20, s.capacity + delta));
  if (next === s.capacity) {
    if (delta < 0) throw new OpsError("booked", booked ? "That spot is already booked. Cancel the booking first to take it back." : "This group is already full.");
    return s;
  }
  await db.update(sessions).set({ capacity: next }).where(eq(sessions.id, s.id));
  const g = flexGroupFor(s.minAgeMonths);
  await audit(db, actor, { action: "flex.spots", entityType: "session", entityId: s.id, summary: `Yalla Flex ${g?.label ?? ""} on ${s.localDate}: ${s.capacity} → ${next} spot${next === 1 ? "" : "s"}` });
  return { ...s, capacity: next };
}

/**
 * Save the standing weekly vacancies. Upcoming days change by the difference for their weekday,
 * so spots released for single days are kept (never below what's booked).
 */
export async function setWeeklyVacancies(db: Executor, actor: Actor, next: WeeklyVacancies) {
  const p = await flexProgram(db);
  if (!p) throw new OpsError("not_found", "Yalla Flex isn’t set up.");
  const before = await weeklyVacancies(db);
  const clean = Object.fromEntries(FLEX_GROUPS.map((g) => [g.key, (next[g.key] ?? []).slice(0, 5).map((n) => Math.max(0, Math.min(20, Math.floor(Number(n) || 0))))])) as WeeklyVacancies;
  await db
    .insert(settings)
    .values({ key: WEEKLY_KEY, value: clean, updatedBy: actor.name })
    .onConflictDoUpdate({ target: settings.key, set: { value: clean, updatedAt: new Date(), updatedBy: actor.name } });
  await ensureFlexDays(db);
  const today = todayLA();
  const upcoming = await db.select().from(sessions).where(and(eq(sessions.programId, p.id), gte(sessions.localDate, today)));
  const booked = await bookedBySession(
    db,
    upcoming.map((s) => s.id),
  );
  let changed = 0;
  for (const s of upcoming) {
    const g = flexGroupFor(s.minAgeMonths);
    const dow = weekdayOf(s.localDate);
    if (!g || dow < 1 || dow > 5) continue;
    const delta = (clean[g.key]?.[dow - 1] ?? 0) - (before[g.key]?.[dow - 1] ?? 0);
    if (!delta) continue;
    const cap = Math.max(booked.get(s.id) ?? 0, 0, s.capacity + delta);
    if (cap !== s.capacity) {
      await db.update(sessions).set({ capacity: cap }).where(eq(sessions.id, s.id));
      changed++;
    }
  }
  await audit(db, actor, { action: "flex.weekly", entityType: "program", entityId: p.id, summary: `Updated Yalla Flex weekly vacancies (${changed} upcoming day${changed === 1 ? "" : "s"} changed)`, changes: { before, after: clean } });
  return { changed };
}
