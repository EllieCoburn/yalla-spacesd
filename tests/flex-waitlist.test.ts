/** The Yalla Flex waitlist: instant offers, the 15-minute hand-off, the note, fair booking and courtesy emails. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { availabilityFor } from "@/lib/ops/capacity";
import { cancelBooking, confirmAdminBooking, confirmBooking, createHold } from "@/lib/ops/bookings";
import { adjustFlexSpots } from "@/lib/ops/flex";
import { joinWaitlist } from "@/lib/ops/waitlist";
import { WAITLIST_NOTE, advanceWaitlistChains, afterChainBooked, chainCheckoutBlock } from "@/lib/ops/waitlist-chain";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const BASE = "https://yalla.test";
const day = () => addDaysISO(todayLA(), 2);
const later = (min: number) => new Date(Date.now() + min * 60_000);

async function family(name: string) {
  const [f] = await db().insert(s.families).values({ name: `${name} family` }).returning();
  await db().insert(s.guardians).values({ familyId: f.id, firstName: name, lastName: "Test", email: `${name.toLowerCase()}@example.com`, isPrimary: true, portalAccess: true });
  const [c] = await db().insert(s.children).values({ familyId: f.id, firstName: `${name}kid`, lastName: "Test", birthDate: addDaysISO(day(), -Math.round(48 * 30.44)) }).returning();
  return { familyId: f.id, childId: c.id, email: `${name.toLowerCase()}@example.com` };
}

/** A full Wildflowers Flex day (one spot, booked) with `n` families waiting, in order. */
async function setup(n: number) {
  const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
  const sess = await session(flex.id, { capacity: 1, minAgeMonths: 36, maxAgeMonths: 59 }, 2);
  const taken = await family("Taken");
  const hold = await createHold(db(), owner, { familyId: taken.familyId, items: [{ sessionId: sess.id, childId: taken.childId }], source: "admin", acknowledgePaperwork: true });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
  const waiting = [];
  for (const name of ["Ana", "Ben", "Cy", "Dee"].slice(0, n)) {
    const f = await family(name);
    await joinWaitlist(db(), owner, { familyId: f.familyId, sessionId: sess.id, childIds: [f.childId] });
    waiting.push(f);
    // Keep the queue order stable.
    await new Promise((r) => setTimeout(r, 5));
  }
  return { sess, taken: hold.booking, waiting };
}

const offers = async () => db().select().from(s.messages).where(eq(s.messages.templateKey, "waitlist_offer"));
const updates = async () => db().select().from(s.messages).where(eq(s.messages.templateKey, "waitlist_update"));
const entryOf = async (familyId: string) => (await db().select().from(s.waitlistEntries).where(eq(s.waitlistEntries.familyId, familyId)))[0];

describe("Yalla Flex waitlist", () => {
  it("offers a released spot immediately, then every 15 minutes, with the note for everyone but the last family", async () => {
    const { sess, waiting } = await setup(4);
    await adjustFlexSpots(db(), owner, sess.id, 1);
    let sent = await offers();
    expect(sent.map((m) => m.toAddress)).toEqual(["ana@example.com"]);
    expect(sent[0].subject).toMatch(/^A spot is open for Anakid: /);
    expect(sent[0].body).toContain("you’ve come off the waitlist");
    expect(sent[0].body).toContain(WAITLIST_NOTE);
    // The private Book spot now link is sent, but stored only as "[private link removed]".
    expect(sent[0].body).toContain("[private link removed]");

    // Not yet 15 minutes: nobody else.
    await advanceWaitlistChains(db(), { now: later(10), baseUrl: BASE });
    expect(await offers()).toHaveLength(1);
    for (const [i, min] of [[1, 16], [2, 32], [3, 48]] as const) {
      await advanceWaitlistChains(db(), { now: later(min), baseUrl: BASE });
      sent = await offers();
      expect(sent).toHaveLength(i + 1);
      expect(sent[i].toAddress).toBe(waiting[i].email);
      // Everyone but the last family in line gets the note.
      expect(sent[i].body.includes(WAITLIST_NOTE)).toBe(i < 3);
    }
    // The spot is counted once, however many families hold offers.
    expect((await availabilityFor(db(), [sess.id], later(50))).get(sess.id)!.remaining).toBe(0);
    // Nobody left in line: no more emails.
    await advanceWaitlistChains(db(), { now: later(70), baseUrl: BASE });
    expect(await offers()).toHaveLength(4);
  });

  it("with one family waiting, the offer has no note", async () => {
    const { sess } = await setup(1);
    await adjustFlexSpots(db(), owner, sess.id, 1);
    const [m] = await offers();
    expect(m.body).not.toContain("more than one family");
  });

  it("a cancellation offers the spot straight away", async () => {
    const { taken } = await setup(2);
    await cancelBooking(db(), owner, { bookingId: taken.id, reason: "Test", notify: false });
    expect((await offers()).map((m) => m.toAddress)).toEqual(["ana@example.com"]);
  });

  it("earlier families can still book while the spot is open, only one family can be paying, and nobody is double-charged", async () => {
    const { sess, waiting } = await setup(2);
    await adjustFlexSpots(db(), owner, sess.id, 1);
    await advanceWaitlistChains(db(), { now: later(16), baseUrl: BASE });
    const a = await entryOf(waiting[0].familyId);
    const b = await entryOf(waiting[1].familyId);
    expect(a.chainId).toBe(b.chainId);
    // Ben starts paying first; Ana is asked to wait.
    expect(await chainCheckoutBlock(db(), b.chainId!, b.offerBookingId!)).toBeNull();
    expect((await chainCheckoutBlock(db(), a.chainId!, a.offerBookingId!))?.code).toBe("busy");
    // Ben never finishes: after the payment window Ana's link works again.
    expect(await chainCheckoutBlock(db(), a.chainId!, a.offerBookingId!, later(40))).toBeNull();
    // Ana (offered first) books it: no courtesy emails, Ben goes back to waiting quietly.
    await confirmBooking(db(), owner, a.offerBookingId!, { reason: "Paid" });
    expect(await updates()).toHaveLength(0);
    expect((await entryOf(waiting[1].familyId)).status).toBe("waiting");
    const [benBooking] = await db().select().from(s.bookings).where(eq(s.bookings.id, b.offerBookingId!));
    expect(benBooking.status).toBe("expired");
    // The spot is booked once.
    const confirmed = await db().select().from(s.bookingItems).where(and(eq(s.bookingItems.sessionId, sess.id), eq(s.bookingItems.status, "confirmed")));
    expect(confirmed).toHaveLength(2); // the original booking and Ana's
    expect((await availabilityFor(db(), [sess.id])).get(sess.id)!.remaining).toBe(0);
    expect((await chainCheckoutBlock(db(), b.chainId!, b.offerBookingId!))?.code).toBe("taken");
  });

  it("when a later family books it, earlier families are told and put back on the waitlist (before 8am)", async () => {
    const { sess, waiting } = await setup(3);
    await adjustFlexSpots(db(), owner, sess.id, 1);
    await advanceWaitlistChains(db(), { now: later(16), baseUrl: BASE });
    await advanceWaitlistChains(db(), { now: later(32), baseUrl: BASE });
    const c = await entryOf(waiting[2].familyId);
    await confirmBooking(db(), owner, c.offerBookingId!, { reason: "Paid" });
    const sent = await updates();
    expect(sent.map((m) => m.toAddress).sort()).toEqual(["ana@example.com", "ben@example.com"]);
    expect(sent[0].body).toContain("we’ve placed you back on the waitlist for that day");
    expect(sent[0].body).not.toMatch(/https?:\/\//);
    expect((await entryOf(waiting[0].familyId)).status).toBe("waiting");
    expect((await entryOf(waiting[1].familyId)).status).toBe("waiting");
    void sess;
  });

  it("after 8am on the day, earlier families hear the waitlist is closed, with a link to book another day", async () => {
    const { sess, waiting } = await setup(2);
    await adjustFlexSpots(db(), owner, sess.id, 1);
    await advanceWaitlistChains(db(), { now: later(16), baseUrl: BASE });
    const b = await entryOf(waiting[1].familyId);
    await db().update(s.waitlistChains).set({ status: "booked", bookedBookingId: b.offerBookingId }).where(eq(s.waitlistChains.id, b.chainId!));
    await afterChainBooked(db(), b.chainId!, b.offerBookingId!, zonedDateTime(day(), "08:05"));
    const [m] = await updates();
    expect(m.toAddress).toBe("ana@example.com");
    expect(m.body).toContain("the waitlist for this Flex session is now closed");
    expect(m.body).toContain("/programs/yalla-flex#dates");
    expect((await entryOf(waiting[0].familyId)).status).toBe("expired");
    void sess;
  });

  it("at 8am the reservation ends quietly: no emails, and offers expire", async () => {
    const { sess, waiting } = await setup(2);
    await adjustFlexSpots(db(), owner, sess.id, 1);
    await advanceWaitlistChains(db(), { now: zonedDateTime(day(), "08:00"), baseUrl: BASE });
    expect(await updates()).toHaveLength(0);
    expect((await entryOf(waiting[0].familyId)).status).toBe("expired");
    // Ben was never offered it and simply stays on the list.
    expect((await entryOf(waiting[1].familyId)).status).toBe("waiting");
    const [chain] = await db().select().from(s.waitlistChains).where(eq(s.waitlistChains.sessionId, sess.id));
    expect(chain.status).toBe("closed");
  });
});
