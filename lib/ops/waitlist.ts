/**
 * Waitlists. An offer creates a held booking whose hold lasts for the acceptance window, so the
 * spot is reserved while the family decides and released automatically if they don't. Nothing is
 * charged or confirmed until the family completes checkout.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB } from "@/lib/db";
import { bookings, programs, sessions, waitlistEntries } from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { availabilityFor } from "./capacity";
import { createHold, describeLine, bookingLines } from "./bookings";

export const WAITLIST_STATUS_LABEL: Record<string, string> = {
  waiting: "Waiting",
  offered: "Offer sent",
  accepted: "Accepted",
  expired: "Offer expired",
  declined: "Declined",
  removed: "Removed",
};

export async function joinWaitlist(db: DB, actor: Actor, input: { familyId: string; sessionId: string; childIds: string[]; notes?: string }) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, input.sessionId));
  if (!s) throw new OpsError("not_found", "Session not found.");
  const [p] = await db.select().from(programs).where(eq(programs.id, s.programId));
  if (!p.waitlistEnabled) throw new OpsError("invalid", "This program doesn’t have a waitlist.");
  const existing = await db
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.sessionId, s.id), eq(waitlistEntries.familyId, input.familyId), inArray(waitlistEntries.status, ["waiting", "offered"])));
  if (existing.length) throw new OpsError("duplicate", "This family is already on the waitlist for that session.");
  const [e] = await db
    .insert(waitlistEntries)
    .values({ programId: p.id, sessionId: s.id, familyId: input.familyId, childIds: input.childIds, partySize: Math.max(1, input.childIds.length), notes: input.notes ?? null })
    .returning();
  await audit(db, actor, { action: "waitlist.join", entityType: "waitlist", entityId: e.id, summary: `Joined waitlist for ${p.name} on ${fmtDate(s.localDate)}` });
  return e;
}

export async function makeOffer(db: DB, actor: Actor, input: { entryId: string; windowHours?: number; baseUrl: string }) {
  const [e] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.id, input.entryId));
  if (!e || e.status !== "waiting") throw new OpsError("invalid", "Only waiting entries can receive an offer.");
  if (!e.sessionId) throw new OpsError("invalid", "Program-level waitlist entries need a session chosen first.");
  const [p] = await db.select().from(programs).where(eq(programs.id, e.programId));
  const windowHours = input.windowHours ?? p.offerWindowHours;
  const hold = await createHold(db, actor, {
    familyId: e.familyId,
    items: (e.childIds.length ? e.childIds : [null]).map((childId) => ({ sessionId: e.sessionId!, childId })),
    source: "waitlist",
    holdMinutes: windowHours * 60,
    acknowledgePaperwork: true,
  });
  const expires = hold.booking.holdExpiresAt!;
  await db.update(waitlistEntries).set({ status: "offered", offeredAt: new Date(), offerExpiresAt: expires, offerBookingId: hold.booking.id, updatedAt: new Date() }).where(eq(waitlistEntries.id, e.id));
  const rows = await bookingLines(db, hold.booking.id);
  await notifyFamily(db, {
    key: "waitlist_offer",
    familyId: e.familyId,
    vars: {
      program: p.name,
      date: fmtDate(rows[0].session.localDate),
      child_names: rows.map((r) => r.child?.preferredName || r.child?.firstName).filter(Boolean).join(" and ") || "your family",
      booking_details: rows.map((r) => `• ${describeLine(r)}`).join("\n"),
      offer_expires: fmtDateTime(expires),
      offer_link: `${input.baseUrl}/book/offer/${hold.booking.reference}`,
    },
    related: { type: "booking", id: hold.booking.id },
    createdBy: actor.name,
  });
  await audit(db, actor, { action: "waitlist.offer", entityType: "waitlist", entityId: e.id, summary: `Offered ${p.name} spot, held until ${fmtDateTime(expires)} (${hold.booking.reference})` });
  return hold.booking;
}

export async function removeEntry(db: DB, actor: Actor, entryId: string, status: "removed" | "declined", note?: string) {
  const [e] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.id, entryId));
  if (!e) throw new OpsError("not_found", "Entry not found.");
  if (e.offerBookingId && e.status === "offered")
    await db.update(bookings).set({ status: "expired", holdExpiresAt: new Date() }).where(and(eq(bookings.id, e.offerBookingId), inArray(bookings.status, ["held", "pending_payment"])));
  await db.update(waitlistEntries).set({ status, notes: note ? `${e.notes ? e.notes + "\n" : ""}${note}` : e.notes, updatedAt: new Date() }).where(eq(waitlistEntries.id, entryId));
  await audit(db, actor, { action: `waitlist.${status}`, entityType: "waitlist", entityId: entryId, summary: `Waitlist entry ${status}` });
}

/** Marks lapsed offers as expired; their holds have already stopped counting against capacity. */
export async function expireOffers(db: DB, now = new Date()) {
  const lapsed = await db
    .update(waitlistEntries)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(waitlistEntries.status, "offered"), sql`${waitlistEntries.offerExpiresAt} < ${now.toISOString()}::timestamptz`))
    .returning();
  return lapsed;
}

/** Optional automation: offer freed spots to the next eligible waiting family. */
export async function autoOffer(db: DB, actor: Actor, sessionIds: string[], baseUrl: string) {
  const offered: string[] = [];
  for (const sid of sessionIds) {
    const [s] = await db.select().from(sessions).where(eq(sessions.id, sid));
    if (!s) continue;
    const [p] = await db.select().from(programs).where(eq(programs.id, s.programId));
    if (!p.waitlistAutoOffer) continue;
    let remaining = (await availabilityFor(db, [sid])).get(sid)!.remaining;
    const queue = await db
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.sessionId, sid), eq(waitlistEntries.status, "waiting")))
      .orderBy(asc(waitlistEntries.createdAt));
    for (const e of queue) {
      if (remaining <= 0) break;
      if (e.partySize > remaining) continue;
      try {
        await makeOffer(db, actor, { entryId: e.id, baseUrl });
        offered.push(e.id);
        remaining -= e.partySize;
      } catch {
        // Ineligible or conflicting — leave in the queue for staff.
      }
    }
  }
  return offered;
}
