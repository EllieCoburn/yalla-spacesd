/**
 * Which what-to-bring lists a family sees in the Family Portal: one per child with Yalla Flex care,
 * for the cohort they're matched to on their next Flex day, and whether their days are full or half.
 */
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { bookingItems, bookings, children, programs, sessions } from "@/lib/db/schema";
import { FLEX_SLUG, HALF_DAY, flexGroupFor } from "@/lib/booking/flex";
import { todayLA } from "@/lib/time";

export type FlexChildList = {
  childId: string;
  name: string;
  cohortKey: string;
  cohort: string;
  nextDate: string | null;
  half: boolean;
  mixed: boolean;
  /** Booked five or more weekdays in a row: items may stay at Yalla for the week. */
  weekBlock: boolean;
};

/** Five or more weekdays in a row (weekends don't break a run). */
export function hasWeekBlock(dates: string[]) {
  const days = [...new Set(dates)].sort();
  let run = 0;
  let prev: Date | null = null;
  for (const d of days) {
    const cur = new Date(d + "T12:00:00Z");
    if (prev) {
      const next = new Date(prev);
      do next.setUTCDate(next.getUTCDate() + 1);
      while (next.getUTCDay() === 0 || next.getUTCDay() === 6);
      run = next.toISOString().slice(0, 10) === d ? run + 1 : 1;
    } else run = 1;
    if (run >= 5) return true;
    prev = cur;
  }
  return false;
}

export async function familyFlexLists(db: Executor, familyId: string, today = todayLA()): Promise<FlexChildList[]> {
  const rows = await db
    .select({ item: bookingItems, session: sessions, child: children })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookings.familyId, familyId), eq(programs.slug, FLEX_SLUG), inArray(bookingItems.status, ["confirmed", "held"]), eq(bookings.status, "confirmed"), gte(sessions.localDate, today)))
    .orderBy(asc(sessions.startsAt));
  const out = new Map<string, FlexChildList>();
  const dates = new Map<string, string[]>();
  for (const r of rows) {
    const g = flexGroupFor(r.session.minAgeMonths);
    if (!g) continue;
    const half = r.item.addons.includes(HALF_DAY);
    dates.set(r.child.id, [...(dates.get(r.child.id) ?? []), r.session.localDate]);
    const cur = out.get(r.child.id);
    if (!cur) {
      out.set(r.child.id, { childId: r.child.id, name: (r.child.preferredName || r.child.firstName).trim(), cohortKey: g.key, cohort: g.cohort, nextDate: r.session.localDate, half, mixed: false, weekBlock: false });
    } else if (cur.half !== half) cur.mixed = true;
  }
  for (const k of out.values()) k.weekBlock = hasWeekBlock(dates.get(k.childId) ?? []);
  return [...out.values()];
}

export type CampChildList = { childId: string; name: string; groupKey: string; group: string; nextDate: string };

/** One Camp Yalla list per child with an upcoming camp day, for the age group of their next camp day. */
export async function familyCampLists(db: Executor, familyId: string, today = todayLA()): Promise<CampChildList[]> {
  const { campGroupFor } = await import("@/content/camp-what-to-bring");
  const rows = await db
    .select({ session: sessions, child: children })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookings.familyId, familyId), eq(programs.kind, "camp"), inArray(bookingItems.status, ["confirmed", "held"]), eq(bookings.status, "confirmed"), gte(sessions.localDate, today)))
    .orderBy(asc(sessions.startsAt));
  const out = new Map<string, CampChildList>();
  for (const r of rows) {
    const g = campGroupFor(r.session.minAgeMonths);
    if (!g || out.has(r.child.id)) continue;
    out.set(r.child.id, { childId: r.child.id, name: (r.child.preferredName || r.child.firstName).trim(), groupKey: g.key, group: g.label, nextDate: r.session.localDate });
  }
  return [...out.values()];
}
