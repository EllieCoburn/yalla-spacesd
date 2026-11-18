/**
 * The Yalla Flex waitlist, made instant.
 *
 * - When a Flex spot opens on a day with families waiting (staff release a spot, a booking is
 *   cancelled, a hold lapses), it's reserved for the waitlist until booking closes for the day
 *   (8:00am) and the first family in line is emailed straight away: "Book spot now".
 * - Every 15 minutes without a booking, the next family in line is offered it too, around the clock.
 *   Each offer email says there's more than one family waiting, unless it goes to the last family.
 * - Any family offered the spot can still book it while it's open: whoever pays first gets it. Only
 *   one family can be at the payment step at a time, so nobody is ever charged for a spot they can't have.
 * - If a later family books it, the earlier families get a short courtesy email: back on the
 *   waitlist (before 8:00am on the day) or "the waitlist is closed" with a link to book another day.
 *   Families offered after the one who booked go back on the waitlist quietly.
 * - It never goes back on the public calendar: at 8:00am the reservation simply ends.
 */
import { and, asc, eq, gt, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { SYSTEM, type Actor } from "@/lib/audit";
import { trustedBaseUrl } from "@/lib/base-url";
import { FLEX_HOURS, FLEX_SLUG } from "@/lib/booking/flex";
import type { DB } from "@/lib/db";
import { bookings, children, programs, sessions, waitlistChains, waitlistEntries } from "@/lib/db/schema";
import { offerPath } from "@/lib/links";
import { notifyFamily } from "@/lib/notify";
import { fmtDate, fmtTime, todayLA, zonedDateTime } from "@/lib/time";
import { availabilityFor } from "./capacity";
import { createHold } from "./bookings";

/** How long each family has before the next family in line is offered the spot too. */
export const FLEX_OFFER_MINUTES = 15;
/** Shown to every family offered a spot except the last one in line. */
export const WAITLIST_NOTE =
  "There is currently more than one family on the waitlist for this spot. You have 15 minutes to check out before the next family is given the opportunity to book it.";
/** A payment started this recently is still in progress (Stripe's shortest checkout is about 30 minutes). */
const PAYING_MINUTES = 31;

const ACTOR: Actor = { ...SYSTEM, name: "Flex waitlist" };
const closesAtFor = (localDate: string) => zonedDateTime(localDate, FLEX_HOURS.bookBy);
const minutes = (n: number) => n * 60_000;

/** Upcoming Flex sessions (still bookable) that have families waiting. */
async function sessionsWithWaiting(db: DB, now: Date, only?: string[]) {
  const rows = await db
    .selectDistinct({ id: sessions.id, localDate: sessions.localDate })
    .from(waitlistEntries)
    .innerJoin(sessions, eq(sessions.id, waitlistEntries.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(programs.slug, FLEX_SLUG), eq(waitlistEntries.status, "waiting"), gte(sessions.localDate, todayLA(now)), only?.length ? inArray(sessions.id, only) : undefined));
  return rows.filter((r) => now < closesAtFor(r.localDate));
}

async function nextWaiting(db: DB, sessionId: string, maxParty: number) {
  const queue = await db
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.sessionId, sessionId), eq(waitlistEntries.status, "waiting")))
    .orderBy(asc(waitlistEntries.createdAt));
  return queue.find((e) => e.partySize <= maxParty) ?? null;
}

/** Holds the reserved spot for one more family and emails them. Returns false if they couldn't be offered it. */
async function offerInChain(db: DB, chain: typeof waitlistChains.$inferSelect, entry: typeof waitlistEntries.$inferSelect, now: Date, baseUrl: string) {
  let hold;
  try {
    hold = await createHold(db, ACTOR, {
      familyId: entry.familyId,
      items: (entry.childIds.length ? entry.childIds : [null]).map((childId) => ({ sessionId: chain.sessionId, childId })),
      source: "waitlist",
      acknowledgePaperwork: true,
      waitlistChainId: chain.id,
      holdUntil: chain.closesAt,
      now,
    });
  } catch (e) {
    // Can't be offered (e.g. the child no longer fits the age group): leave them for the team.
    console.error("[flex waitlist offer skipped]", (e as Error).message?.slice(0, 160));
    await db.update(waitlistEntries).set({ notes: sql`coalesce(${waitlistEntries.notes} || E'\n', '') || ${`Couldn’t be offered a spot automatically: ${(e as Error).message}`.slice(0, 300)}`, updatedAt: now }).where(eq(waitlistEntries.id, entry.id));
    return false;
  }
  await db
    .update(waitlistEntries)
    .set({ status: "offered", offeredAt: now, offerExpiresAt: new Date(now.getTime() + minutes(FLEX_OFFER_MINUTES)), offerBookingId: hold.booking.id, chainId: chain.id, updatedAt: now })
    .where(eq(waitlistEntries.id, entry.id));
  // Anyone still waiting behind them for this day?
  const [{ behind }] = await db
    .select({ behind: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.sessionId, chain.sessionId), eq(waitlistEntries.status, "waiting"), ne(waitlistEntries.id, entry.id)));
  const [s] = await db.select().from(sessions).where(eq(sessions.id, chain.sessionId));
  const [p] = await db.select().from(programs).where(eq(programs.id, s.programId));
  const kids = entry.childIds.length ? await db.select().from(children).where(inArray(children.id, entry.childIds)) : [];
  const names = kids.map((k) => (k.preferredName || k.firstName).trim());
  await notifyFamily(db, {
    key: "waitlist_offer",
    familyId: entry.familyId,
    vars: {
      program: s.title ?? p.name,
      date: fmtDate(s.localDate, "EEEE, MMMM d"),
      child_names: names.length ? names.join(" and ") : "your family",
      booking_details: `>> ${s.title ?? p.name}\n${fmtDate(s.localDate, "EEEE, MMMM d")} · ${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)}${names.length ? `\n\nWho’s coming: ${names.join(", ")}` : ""}`,
      waitlist_note: behind > 0 ? `~~ ${WAITLIST_NOTE}` : "",
      offer_expires: "",
      offer_link: `${baseUrl}${offerPath(hold.booking.reference)}`,
    },
    related: { type: "booking", id: hold.booking.id },
    createdBy: ACTOR.name,
  });
  return true;
}

/** New openings: reserve each open Flex spot for the next family in line and email them. */
export async function offerOpenFlexSpots(db: DB, opts: { sessionIds?: string[]; now?: Date; baseUrl?: string } = {}) {
  const now = opts.now ?? new Date();
  const baseUrl = opts.baseUrl ?? trustedBaseUrl();
  let offered = 0;
  for (const s of await sessionsWithWaiting(db, now, opts.sessionIds)) {
    let remaining = (await availabilityFor(db, [s.id], now)).get(s.id)?.remaining ?? 0;
    const tried = new Set<string>();
    while (remaining > 0) {
      const queue = await db
        .select()
        .from(waitlistEntries)
        .where(and(eq(waitlistEntries.sessionId, s.id), eq(waitlistEntries.status, "waiting")))
        .orderBy(asc(waitlistEntries.createdAt));
      const e = queue.find((x) => x.partySize <= remaining && !tried.has(x.id));
      if (!e) break;
      tried.add(e.id);
      const [chain] = await db
        .insert(waitlistChains)
        .values({ sessionId: s.id, spots: e.partySize, closesAt: closesAtFor(s.localDate), nextHandoffAt: new Date(now.getTime() + minutes(FLEX_OFFER_MINUTES)) })
        .returning();
      if (await offerInChain(db, chain, e, now, baseUrl)) {
        offered++;
        remaining -= e.partySize;
      } else await db.update(waitlistChains).set({ status: "closed", updatedAt: now }).where(eq(waitlistChains.id, chain.id));
    }
  }
  return offered;
}

/** Is a family on this waitlist spot already paying? */
async function payingNow(db: DB, chainId: string, exceptBookingId: string, now: Date) {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.waitlistChainId, chainId),
        ne(bookings.id, exceptBookingId),
        eq(bookings.status, "pending_payment"),
        gt(bookings.updatedAt, new Date(now.getTime() - minutes(PAYING_MINUTES))),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Before a family on a Flex waitlist spot pays: the spot must still be open and no other family can be
 * mid-payment for it. Claims the payment step for this family (under a lock, so two can't both pass).
 */
export async function chainCheckoutBlock(db: DB, chainId: string, bookingId: string, now = new Date()): Promise<{ code: string; message: string } | null> {
  return db.transaction(async (tx) => {
    const [chain] = await tx.select().from(waitlistChains).where(eq(waitlistChains.id, chainId)).for("update");
    if (!chain || chain.status === "booked") return { code: "taken", message: "This spot has just been booked by another family on the waitlist." };
    if (chain.status !== "open" || chain.closesAt <= now) return { code: "closed", message: "Booking for this Flex day has closed." };
    if (await payingNow(tx as unknown as DB, chainId, bookingId, now))
      return { code: "busy", message: "Another family on the waitlist is checking out for this spot right now. If they don’t finish, your link will work again in a few minutes." };
    await tx.update(bookings).set({ status: "pending_payment", updatedAt: now }).where(eq(bookings.id, bookingId));
    return null;
  });
}

/** After a family books a Flex waitlist spot: let the earlier families know, and put everyone else back in line. */
export async function afterChainBooked(db: DB, chainId: string, bookingId: string, now = new Date()) {
  const [chain] = await db.select().from(waitlistChains).where(eq(waitlistChains.id, chainId));
  if (!chain) return;
  const entries = await db.select().from(waitlistEntries).where(eq(waitlistEntries.chainId, chainId)).orderBy(asc(waitlistEntries.offeredAt));
  const booker = entries.find((e) => e.offerBookingId === bookingId);
  const [s] = await db.select().from(sessions).where(eq(sessions.id, chain.sessionId));
  const stillOpen = now < chain.closesAt;
  const baseUrl = trustedBaseUrl();
  for (const e of entries) {
    if (e.id === booker?.id || e.status !== "offered") continue;
    // Before booking closes they keep their place in line (their original join time).
    await db
      .update(waitlistEntries)
      .set(stillOpen ? { status: "waiting", chainId: null, offerBookingId: null, offeredAt: null, offerExpiresAt: null, updatedAt: now } : { status: "expired", updatedAt: now })
      .where(eq(waitlistEntries.id, e.id));
    // Only families offered the spot before the one who booked it hear about it.
    const earlier = booker?.offeredAt && e.offeredAt && e.offeredAt < booker.offeredAt;
    if (!earlier) continue;
    const kids = e.childIds.length ? await db.select().from(children).where(inArray(children.id, e.childIds)) : [];
    const names = kids.map((k) => (k.preferredName || k.firstName).trim()).join(" and ") || "your family";
    const date = fmtDate(s.localDate, "EEEE, MMMM d");
    await notifyFamily(db, {
      key: "waitlist_update",
      familyId: e.familyId,
      vars: {
        date,
        update: stillOpen
          ? `The Yalla Flex spot for ${names} on ${date} was booked by another family on the waitlist, so we’ve placed you back on the waitlist for that day. If another spot opens, we’ll email you right away.`
          : `The Yalla Flex spot for ${names} on ${date} was booked by another family on the waitlist, and the waitlist for this Flex session is now closed. We’d love to see you on another day.`,
        book_link: stillOpen ? "" : `${baseUrl}/programs/yalla-flex#dates`,
      },
      related: { type: "family", id: e.familyId },
      createdBy: ACTOR.name,
    });
  }
}

/**
 * The waitlist's clock (run every minute, and whenever a spot opens or an offer link is opened):
 * close spots at 8:00am, hand each open spot to the next family every 15 minutes, and offer new openings.
 */
export async function advanceWaitlistChains(db: DB, opts: { now?: Date; baseUrl?: string } = {}) {
  const now = opts.now ?? new Date();
  const baseUrl = opts.baseUrl ?? trustedBaseUrl();
  // Booking has closed for the day: the reservation ends, quietly.
  const closed = await db
    .update(waitlistChains)
    .set({ status: "closed", nextHandoffAt: null, updatedAt: now })
    .where(and(eq(waitlistChains.status, "open"), lte(waitlistChains.closesAt, now)))
    .returning({ id: waitlistChains.id });
  if (closed.length) {
    const ids = closed.map((c) => c.id);
    await db.update(bookings).set({ status: "expired", updatedAt: now }).where(and(inArray(bookings.waitlistChainId, ids), inArray(bookings.status, ["held", "pending_payment"])));
    await db.update(waitlistEntries).set({ status: "expired", updatedAt: now }).where(and(inArray(waitlistEntries.chainId, ids), eq(waitlistEntries.status, "offered")));
  }
  // Every 15 minutes, the next family in line is offered the spot too (not while someone is paying).
  let handedOff = 0;
  const due = await db
    .select()
    .from(waitlistChains)
    .where(and(eq(waitlistChains.status, "open"), lte(waitlistChains.nextHandoffAt, now)));
  for (const chain of due) {
    if (await payingNow(db, chain.id, "", now)) continue;
    const next = await nextWaiting(db, chain.sessionId, chain.spots);
    if (next && (await offerInChain(db, chain, next, now, baseUrl))) handedOff++;
    // Nobody left in line (or they couldn't be offered it): the spot stays with the families already offered it.
    await db
      .update(waitlistChains)
      .set({ nextHandoffAt: next ? new Date(now.getTime() + minutes(FLEX_OFFER_MINUTES)) : null, updatedAt: now })
      .where(eq(waitlistChains.id, chain.id));
  }
  const offered = await offerOpenFlexSpots(db, { now, baseUrl });
  return { closed: closed.length, handedOff, offered };
}

/** The state of a family's Flex waitlist offer, for their offer page. */
export async function chainStatusForBooking(db: DB, bookingId: string) {
  const [b] = await db.select({ chainId: bookings.waitlistChainId }).from(bookings).where(eq(bookings.id, bookingId));
  if (!b?.chainId) return null;
  const [chain] = await db.select().from(waitlistChains).where(eq(waitlistChains.id, b.chainId));
  if (!chain) return null;
  return { status: chain.status as "open" | "booked" | "closed", bookedByThem: chain.bookedBookingId === bookingId, closesAt: chain.closesAt };
}

/** A spot may have just opened (released, cancelled): offer it to the waitlist now. Never throws. */
export async function nudgeWaitlist(db: DB, sessionIds?: string[]) {
  try {
    await offerOpenFlexSpots(db, { sessionIds });
  } catch (e) {
    console.error("[flex waitlist nudge failed]", (e as Error).message?.slice(0, 160));
  }
}
