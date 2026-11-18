/**
 * Which what-to-bring lists a family sees in the Family Portal: one per child with Yalla Flex care,
 * for the cohort they're matched to on their next Flex day, and whether their days are full or half.
 */
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { bookingItems, bookings, children, programs, sessions } from "@/lib/db/schema";
import { FLEX_SLUG, HALF_DAY, flexGroupFor } from "@/lib/booking/flex";
import { todayLA } from "@/lib/time";

export type FlexChildList = { childId: string; name: string; cohortKey: string; cohort: string; nextDate: string | null; half: boolean; mixed: boolean };

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
  for (const r of rows) {
    const g = flexGroupFor(r.session.minAgeMonths);
    if (!g) continue;
    const half = r.item.addons.includes(HALF_DAY);
    const cur = out.get(r.child.id);
    if (!cur) {
      out.set(r.child.id, { childId: r.child.id, name: (r.child.preferredName || r.child.firstName).trim(), cohortKey: g.key, cohort: g.cohort, nextDate: r.session.localDate, half, mixed: false });
    } else if (cur.half !== half) cur.mixed = true;
  }
  return [...out.values()];
}
