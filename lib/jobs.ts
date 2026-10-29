/**
 * Housekeeping. Correctness never depends on these running (availability already ignores lapsed
 * holds and offers), but they keep records tidy and send time-based messages.
 */
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { SYSTEM } from "@/lib/audit";
import type { DB } from "@/lib/db";
import { bookingItems, bookings, messages, sessions, waitlistEntries } from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { bookingLines, describeLine, expireHolds } from "@/lib/ops/bookings";
import { availabilityFor } from "@/lib/ops/capacity";
import { applyDueChanges } from "@/lib/ops/memberships";
import { autoOffer, expireOffers } from "@/lib/ops/waitlist";
import { expireSpaceHolds } from "@/lib/spaces/engine";
import { fmtDate } from "@/lib/time";

export type HousekeepingResult = { expiredHolds: number; expiredOffers: number; membershipChanges: number; offers: number; reminders: number };

export async function runHousekeeping(db: DB, opts: { baseUrl: string; now?: Date; reminders?: boolean }): Promise<HousekeepingResult> {
  const now = opts.now ?? new Date();
  const expiredHolds = (await expireHolds(db, now)) + (await expireSpaceHolds(db, now));
  const expiredOffers = (await expireOffers(db, now)).length;
  const membershipChanges = await applyDueChanges(db, SYSTEM);

  // Offer freed spots to waiting families (only programs with automatic offers enabled).
  const waiting = await db
    .selectDistinct({ sessionId: waitlistEntries.sessionId })
    .from(waitlistEntries)
    .innerJoin(sessions, eq(sessions.id, waitlistEntries.sessionId))
    .where(and(eq(waitlistEntries.status, "waiting"), sql`${sessions.startsAt} > ${now.toISOString()}::timestamptz`));
  const ids = waiting.map((w) => w.sessionId).filter(Boolean) as string[];
  const avail = await availabilityFor(db, ids, now);
  const withRoom = ids.filter((id) => (avail.get(id)?.remaining ?? 0) > 0);
  const offers = withRoom.length ? (await autoOffer(db, SYSTEM, withRoom, opts.baseUrl)).length : 0;

  let reminders = 0;
  if (opts.reminders !== false) {
    // A rolling 24-hour window 12–36 hours ahead: a once-daily run reminds every session exactly
    // once (more frequent runs are deduplicated below).
    const from = new Date(now.getTime() + 12 * 3600_000);
    const to = new Date(now.getTime() + 36 * 3600_000);
    const due = await db
      .selectDistinct({ bookingId: bookings.id, familyId: bookings.familyId })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
      .where(and(eq(bookingItems.status, "confirmed"), eq(bookings.status, "confirmed"), gte(sessions.startsAt, from), lte(sessions.startsAt, to)));
    if (due.length) {
      const sent = await db
        .select({ relatedId: messages.relatedId })
        .from(messages)
        .where(
          and(
            eq(messages.templateKey, "booking_reminder"),
            inArray(
              messages.relatedId,
              due.map((d) => d.bookingId),
            ),
            gte(messages.createdAt, new Date(now.getTime() - 3 * 86400_000)),
          ),
        );
      const already = new Set(sent.map((s) => s.relatedId));
      for (const d of due) {
        if (already.has(d.bookingId)) continue;
        const rows = (await bookingLines(db, d.bookingId)).filter((r) => r.item.status === "confirmed" && r.session.startsAt >= from && r.session.startsAt <= to);
        if (!rows.length) continue;
        const [b] = await db.select().from(bookings).where(eq(bookings.id, d.bookingId));
        await notifyFamily(db, {
          key: "booking_reminder",
          familyId: d.familyId,
          vars: {
            reference: b.reference,
            program: rows[0].program.name,
            date: fmtDate(rows[0].session.localDate),
            booking_details: rows.map((r) => `• ${describeLine(r)}`).join("\n"),
            arrival_instructions: rows[0].program.arrivalInstructions ?? "",
          },
          related: { type: "booking", id: d.bookingId },
        });
        reminders++;
      }
    }
  }
  return { expiredHolds, expiredOffers, membershipChanges, offers, reminders };
}
