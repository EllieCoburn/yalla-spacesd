/**
 * The enrollment calendar: every session in a month with how many children are booked, so staff
 * can see at a glance who is coming to camp (or Flex, or a Happening) and open any day's rosters.
 */
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { bookingItems, bookings, programs, sessions, waitlistEntries } from "@/lib/db/schema";

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
  booked: number;
  waiting: number;
  status: string;
};

/** Sessions between two dates (inclusive) for the chosen programs, with booked and waitlist counts. */
export async function calendarSessions(db: Executor, from: string, to: string, program: CalendarProgram): Promise<CalendarSession[]> {
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
  const bookedBy = new Map(booked.map((b) => [b.sessionId, b.n]));
  const waitingBy = new Map(waiting.map((w) => [w.sessionId, w.n]));
  return rows.map(({ s, p }) => {
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
      waiting: waitingBy.get(s.id ?? "") ?? 0,
      status: s.status,
    };
  });
}
