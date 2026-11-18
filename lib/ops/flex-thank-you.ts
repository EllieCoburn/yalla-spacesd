/**
 * The Yalla Flex first-day thank-you: one email per family, at about 6pm Pacific on the evening of
 * their first Flex day, with a code for 10% off their next Flex booking (BACKTOPLAY10, once per
 * family, set up in Billing → Discounts).
 *
 * - A family's first Flex day is their earliest day of confirmed Flex care. Families whose first day
 *   was before today never get it, so turning this on doesn't email anyone retroactively.
 * - Not sent if every child that day was marked absent.
 * - Sent once per family, ever: `families.flex_thank_you_sent_at` is claimed before sending.
 * - Not sent while the code is turned off (so the email never offers a code that won't work).
 * - Runs from the evening job (the same one that sends tomorrow's reminders).
 */
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { attendanceRecords, bookingItems, bookings, discounts, families, programs, sessions } from "@/lib/db/schema";
import { FLEX_SLUG } from "@/lib/booking/flex";
import { notifyFamily } from "@/lib/notify";
import { todayLA } from "@/lib/time";
import { firstVisitChildren, joinNames } from "./flex-welcome";
import { getPolicy } from "./settings";

export const THANK_YOU_CODE = "BACKTOPLAY10";

/** Families whose first confirmed Flex day is `date` and who haven't been thanked. */
async function familiesDue(db: Executor, date: string) {
  const today = await db
    .selectDistinct({ familyId: bookings.familyId })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(families, eq(families.id, bookings.familyId))
    .where(and(eq(programs.slug, FLEX_SLUG), eq(bookingItems.status, "confirmed"), eq(bookings.status, "confirmed"), eq(sessions.localDate, date), isNull(families.flexThankYouSentAt)));
  if (!today.length) return [];
  const earlier = await db
    .selectDistinct({ familyId: bookings.familyId })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(
      and(
        eq(programs.slug, FLEX_SLUG),
        eq(bookingItems.status, "confirmed"),
        eq(bookings.status, "confirmed"),
        lt(sessions.localDate, date),
        inArray(
          bookings.familyId,
          today.map((t) => t.familyId),
        ),
      ),
    );
  const before = new Set(earlier.map((e) => e.familyId));
  return today.map((t) => t.familyId).filter((id) => !before.has(id));
}

export async function sendFlexThankYous(db: Executor, opts: { baseUrl: string; now?: Date }) {
  const now = opts.now ?? new Date();
  if (!(await getPolicy(db, "notifications.flexThankYou"))) return { sent: 0 };
  const [code] = await db.select().from(discounts).where(eq(discounts.code, THANK_YOU_CODE));
  if (!code?.active) return { sent: 0 };
  const date = todayLA(now);
  let sent = 0;
  for (const familyId of await familiesDue(db, date)) {
    try {
      const kids = await firstVisitChildren(db, familyId, date);
      if (!kids.length) continue;
      // Skip a family whose children were all marked absent today.
      const absent = await db
        .select({ childId: attendanceRecords.childId })
        .from(attendanceRecords)
        .innerJoin(sessions, eq(sessions.id, attendanceRecords.sessionId))
        .where(and(inArray(attendanceRecords.childId, kids.map((k) => k.childId)), eq(sessions.localDate, date), eq(attendanceRecords.status, "absent")));
      const came = kids.filter((k) => !absent.some((a) => a.childId === k.childId));
      if (!came.length) continue;
      // Claim first, so two runs at once can't both send.
      const claimed = await db
        .update(families)
        .set({ flexThankYouSentAt: now })
        .where(and(eq(families.id, familyId), isNull(families.flexThankYouSentAt)))
        .returning({ id: families.id });
      if (!claimed.length) continue;
      await notifyFamily(db, {
        key: "flex_thank_you",
        familyId,
        vars: {
          child_names: joinNames(came.map((k) => k.name)),
          coupon_code: THANK_YOU_CODE,
          coupon_link: `${opts.baseUrl}/coupon/${THANK_YOU_CODE}`,
          // Opening this applies the code at checkout automatically.
          book_link: `${opts.baseUrl}/programs/yalla-flex?coupon=${THANK_YOU_CODE}#dates`,
        },
        related: { type: "family", id: familyId },
      });
      sent++;
    } catch (e) {
      console.error("[flex thank-you failed]", (e as Error).message?.slice(0, 160));
    }
  }
  return { sent };
}
