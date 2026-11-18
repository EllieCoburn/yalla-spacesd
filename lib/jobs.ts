/**
 * Housekeeping. Correctness never depends on these running (availability already ignores lapsed
 * holds and offers), but they keep records tidy and send time-based messages.
 */
import { FLEX_SLUG } from "@/lib/booking/flex";
import { and, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { SYSTEM } from "@/lib/audit";
import type { DB } from "@/lib/db";
import { authTokens, bookingItems, bookings, familyAuthTokens, familyInvites, familySessions, messages, sessions, staffSessions, waitlistEntries } from "@/lib/db/schema";
import { pruneRateEvents } from "@/lib/rate-limit";
import { notifyFamily } from "@/lib/notify";
import { bookingLines, describeLine, expireHolds } from "@/lib/ops/bookings";
import { availabilityFor } from "@/lib/ops/capacity";
import { applyDueChanges } from "@/lib/ops/memberships";
import { autoOffer, expireOffers } from "@/lib/ops/waitlist";
import { expireSpaceHolds } from "@/lib/spaces/engine";
import { expireCredits } from "@/lib/playpass/wallet";
import { applyPlayPassSchedules } from "@/lib/playpass/changes";
import { ensureFlexDays } from "@/lib/ops/flex";
import { addDaysISO, fmtDate, todayLA } from "@/lib/time";

export type HousekeepingResult = { expiredHolds: number; expiredOffers: number; membershipChanges: number; offers: number; reminders: number };

export async function runHousekeeping(db: DB, opts: { baseUrl: string; now?: Date; reminders?: boolean }): Promise<HousekeepingResult> {
  const now = opts.now ?? new Date();
  // Yalla Flex first-day welcomes first: this run is early in the morning (6am, 7am in summer), before
  // anyone arrives. (Vercel's plan allows two scheduled runs: this one and the evening reminders.)
  try {
    const { sendFlexWelcomes } = await import("@/lib/ops/flex-welcome");
    await sendFlexWelcomes(db, { now, baseUrl: opts.baseUrl });
  } catch (e) {
    console.error("[flex welcome run failed]", (e as Error).message?.slice(0, 160));
  }
  const expiredHolds = (await expireHolds(db, now)) + (await expireSpaceHolds(db, now));
  // The Flex waitlist's safety net: close finished days, hand spots on, offer any new openings.
  {
    const { advanceWaitlistChains } = await import("@/lib/ops/waitlist-chain");
    await advanceWaitlistChains(db, { now, baseUrl: opts.baseUrl }).catch((e) => console.error("[flex waitlist]", (e as Error).message?.slice(0, 160)));
  }
  const expiredOffers = (await expireOffers(db, now)).length;
  const membershipChanges = await applyDueChanges(db, SYSTEM);
  // Cancellation credits are valid 24 months; record any that have lapsed.
  await expireCredits(db);
  // Play Pass notice periods, downgrades and pauses.
  await applyPlayPassSchedules(db);
  // Keep Yalla Flex days (full until staff release spots) set up for the coming weeks.
  await ensureFlexDays(db);
  // Security housekeeping: rate-limit records, used or expired sign-in and reset links, and ended sessions.
  await pruneSecurityRecords(db, now);

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

  // Session reminders now go out the evening before (sendEveningReminders, its own run).
  let reminders = 0;
  if (opts.reminders === true) {
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


/**
 * The evening before: a reminder for every booking with a session tomorrow (San Diego date), once
 * per booking, with a nudge to reserve a private space and to add a second grown-up or extras.
 */
export async function sendEveningReminders(db: DB, opts: { baseUrl: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const tomorrow = addDaysISO(todayLA(now), 1);
  const due = await db
    .selectDistinct({ bookingId: bookings.id, familyId: bookings.familyId })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .where(and(eq(bookingItems.status, "confirmed"), eq(bookings.status, "confirmed"), eq(sessions.localDate, tomorrow)));
  if (!due.length) return { sent: 0 };
  const already = new Set(
    (
      await db
        .select({ relatedId: messages.relatedId })
        .from(messages)
        .where(and(eq(messages.templateKey, "booking_reminder"), inArray(messages.relatedId, due.map((d) => d.bookingId)), gte(messages.createdAt, new Date(now.getTime() - 20 * 3600_000))))
    ).map((m) => m.relatedId),
  );
  // A new Flex family's welcome (sent this evening) already covers their first Flex day.
  const { familiesWelcomedFor } = await import("@/lib/ops/flex-welcome");
  const welcomed = await familiesWelcomedFor(db, tomorrow, [...new Set(due.map((d) => d.familyId))], now);
  let sent = 0;
  for (const d of due) {
    if (already.has(d.bookingId)) continue;
    const rows = (await bookingLines(db, d.bookingId)).filter(
      (r) => r.item.status === "confirmed" && r.session.localDate === tomorrow && !(welcomed.has(d.familyId) && r.program.slug === FLEX_SLUG),
    );
    if (!rows.length) continue;
    const [b] = await db.select().from(bookings).where(eq(bookings.id, d.bookingId));
    await notifyFamily(db, {
      key: "booking_reminder",
      familyId: d.familyId,
      vars: {
        reference: b.reference,
        program: rows[0].program.name,
        date: fmtDate(tomorrow, "EEEE, MMMM d"),
        booking_details: rows.map((r) => `• ${describeLine(r)}`).join("\n"),
        arrival_instructions: rows[0].program.arrivalInstructions ?? "",
        upgrade_note: [
          "## Make the most of tomorrow",
          // Parents don't stay onsite for camp, so camp-only reminders skip the private-space line.
          ...(rows.every((r) => r.program.kind === "camp")
            ? []
            : [`Need a private space? Private offices and desks to rent, and complimentary time in our phone booth. [See what’s available](${opts.baseUrl}/portal/spaces?date=${tomorrow})`]),
          rows.every((r) => r.program.kind === "camp")
            ? `Want to add Early Bird or a late stay? [Add extras in your Family Portal](${opts.baseUrl}/portal/extras/${tomorrow})`
            : `Bringing a second grown-up, or want to add extras? [Add them in your Family Portal](${opts.baseUrl}/portal/extras/${tomorrow})`,
        ].join("\n\n"),
      },
      related: { type: "booking", id: d.bookingId },
    });
    sent++;
  }
  return { sent };
}

/**
 * Removes records only needed for a short time: rate-limit attempts (after a day), sign-in, reset
 * and invitation links once used or expired (after 7 days), and sessions that ended over 30 days ago.
 */
export async function pruneSecurityRecords(db: DB, now = new Date()) {
  const week = new Date(now.getTime() - 7 * 24 * 3600_000);
  const month = new Date(now.getTime() - 30 * 24 * 3600_000);
  await pruneRateEvents(db);
  await db.delete(familyInvites).where(lt(familyInvites.expiresAt, new Date(now.getTime() - 30 * 24 * 3600_000)));
  await db.delete(familyAuthTokens).where(or(lt(familyAuthTokens.expiresAt, week), lt(familyAuthTokens.usedAt, week)));
  await db.delete(authTokens).where(or(lt(authTokens.expiresAt, week), lt(authTokens.usedAt, week)));
  await db.delete(familySessions).where(or(lt(familySessions.expiresAt, month), lt(familySessions.revokedAt, month)));
  await db.delete(staffSessions).where(or(lt(staffSessions.expiresAt, month), lt(staffSessions.revokedAt, month)));
}
