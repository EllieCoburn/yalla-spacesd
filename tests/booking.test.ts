import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { availabilityFor } from "@/lib/ops/capacity";
import { cancelBooking, createHold, moveItem, startCheckout } from "@/lib/ops/bookings";
import { processEvent } from "@/lib/payments/webhooks";
import { OpsError } from "@/lib/audit";
import { db, family, owner, program, reset, session } from "./helpers";

const base = { base: "http://localhost:3000" };

beforeEach(reset);

describe("capacity", () => {
  it("lets only one of two simultaneous customers take the final spot", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 1 });
    const a = await family("Ana");
    const b = await family("Ben");
    const results = await Promise.allSettled([
      createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: sess.id, childId: a.children[0].id }], source: "public" }),
      createHold(db(), owner, { familyId: b.family.id, items: [{ sessionId: sess.id, childId: b.children[0].id }], source: "public" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as OpsError).code).toBe("capacity");
    expect((await availabilityFor(db(), [sess.id])).get(sess.id)!.remaining).toBe(0);
  });

  it("explains a multi-child booking that needs more spots than remain, before payment", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 3 });
    const other = await family("Other");
    await createHold(db(), owner, { familyId: other.family.id, items: [{ sessionId: sess.id, childId: other.children[0].id }], source: "public" });
    const filler = await family("Fill");
    await createHold(db(), owner, { familyId: filler.family.id, items: [{ sessionId: sess.id, childId: filler.children[0].id }], source: "public" });
    const sibs = await family("Sib", [
      { first: "Ivy", birth: "2022-05-01" },
      { first: "Jo", birth: "2023-08-01" },
    ]);
    await expect(
      createHold(db(), owner, { familyId: sibs.family.id, items: sibs.children.map((c) => ({ sessionId: sess.id, childId: c.id })), source: "public" }),
    ).rejects.toThrow(/Only 1 spot remains .* needs 2/);
    const bookings = await db().select().from(s.bookings).where(eq(s.bookings.familyId, sibs.family.id));
    expect(bookings).toHaveLength(0);
  });

  it("releases capacity when a booking is cancelled", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 1 });
    const a = await family("Ana");
    const hold = await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: sess.id, childId: a.children[0].id }], source: "admin" });
    expect((await availabilityFor(db(), [sess.id])).get(sess.id)!.remaining).toBe(0);
    await cancelBooking(db(), owner, { bookingId: hold.booking.id, reason: "Family request", notify: false });
    expect((await availabilityFor(db(), [sess.id])).get(sess.id)!.remaining).toBe(1);
    const b = await family("Ben");
    await expect(createHold(db(), owner, { familyId: b.family.id, items: [{ sessionId: sess.id, childId: b.children[0].id }], source: "public" })).resolves.toBeTruthy();
  });

  it("frees abandoned checkouts when the hold expires, without permanently locking inventory", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 1 });
    const a = await family("Ana");
    const past = new Date(Date.now() - 60 * 60_000);
    await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: sess.id, childId: a.children[0].id }], source: "public", holdMinutes: 15, now: past });
    expect((await availabilityFor(db(), [sess.id])).get(sess.id)!.remaining).toBe(1);
  });

  it("blocks a child from overlapping care", async () => {
    const p = await program();
    const s1 = await session(p.id, { capacity: 5 }, 7, "08:30", "16:30");
    const s2 = await session(p.id, { capacity: 5 }, 7, "12:00", "15:00");
    const a = await family("Ana");
    await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: s1.id, childId: a.children[0].id }], source: "admin" });
    await expect(createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: s2.id, childId: a.children[0].id }], source: "admin" })).rejects.toThrow(/overlapping/);
  });

  it("requires an explicit, permitted override and never exceeds hard capacity", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 1, hardCapacity: 2 });
    const [a, b, c] = [await family("A"), await family("B"), await family("C")];
    await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: sess.id, childId: a.children[0].id }], source: "admin" });
    await expect(createHold(db(), owner, { familyId: b.family.id, items: [{ sessionId: sess.id, childId: b.children[0].id }], source: "admin" })).rejects.toThrow(/fully booked/);
    const educator = { type: "staff" as const, id: "e", name: "Educator", permissions: ["bookings.manage"] };
    await expect(
      createHold(db(), educator, { familyId: b.family.id, items: [{ sessionId: sess.id, childId: b.children[0].id }], source: "admin", override: { reason: "Sibling" } }),
    ).rejects.toThrow(/permission/);
    await createHold(db(), owner, { familyId: b.family.id, items: [{ sessionId: sess.id, childId: b.children[0].id }], source: "admin", override: { reason: "Staffing confirmed" } });
    const overrides = await db().select().from(s.capacityOverrides);
    expect(overrides[0].reason).toBe("Staffing confirmed");
    await expect(
      createHold(db(), owner, { familyId: c.family.id, items: [{ sessionId: sess.id, childId: c.children[0].id }], source: "admin", override: { reason: "One more" } }),
    ).rejects.toThrow(/hard capacity/);
  });
});

describe("payments", () => {
  async function checkoutFor(capacity = 1) {
    const p = await program();
    const sess = await session(p.id, { capacity });
    const a = await family("Pay");
    const hold = await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: sess.id, childId: a.children[0].id }], source: "public" });
    await startCheckout(db(), owner, hold.booking.id, base);
    const [payment] = await db().select().from(s.payments);
    return { p, sess, a, hold, payment };
  }

  it("does not confirm on a failed payment; the hold remains until it expires", async () => {
    const { hold, payment } = await checkoutFor();
    await processEvent(db(), "test", { id: "evt_fail_1", type: "payment.failed", checkoutRef: payment.checkoutRef!, reason: "Card declined" });
    const [b] = await db().select().from(s.bookings).where(eq(s.bookings.id, hold.booking.id));
    const [pay] = await db().select().from(s.payments).where(eq(s.payments.id, payment.id));
    expect(pay.status).toBe("failed");
    expect(b.status).toBe("held");
    const msgs = await db().select().from(s.messages).where(eq(s.messages.templateKey, "payment_failed"));
    expect(msgs[0].mode).toBe("test");
  });

  it("handles a delayed payment after the hold expired: confirms if room, flags if not", async () => {
    const { sess, hold, payment } = await checkoutFor(1);
    // Hold lapses and another family takes the spot.
    await db().update(s.bookings).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.bookings.id, hold.booking.id));
    const b2 = await family("Late");
    await createHold(db(), owner, { familyId: b2.family.id, items: [{ sessionId: sess.id, childId: b2.children[0].id }], source: "public" });
    await processEvent(db(), "test", { id: "evt_late_1", type: "payment.succeeded", checkoutRef: payment.checkoutRef!, providerRef: "pi_1", amountCents: payment.amountCents });
    const [b] = await db().select().from(s.bookings).where(eq(s.bookings.id, hold.booking.id));
    expect(b.status).toBe("needs_attention");
    expect((await availabilityFor(db(), [sess.id])).get(sess.id)!.occupancy.booked + (await availabilityFor(db(), [sess.id])).get(sess.id)!.occupancy.held).toBe(1);
  });

  it("confirms a delayed payment when the spot is still free", async () => {
    const { hold, payment } = await checkoutFor(1);
    await db().update(s.bookings).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.bookings.id, hold.booking.id));
    await processEvent(db(), "test", { id: "evt_late_ok", type: "payment.succeeded", checkoutRef: payment.checkoutRef!, providerRef: "pi_2", amountCents: payment.amountCents });
    const [b] = await db().select().from(s.bookings).where(eq(s.bookings.id, hold.booking.id));
    expect(b.status).toBe("confirmed");
  });

  it("ignores duplicate payment notifications", async () => {
    const { hold, payment } = await checkoutFor();
    const evt = { id: "evt_dup_1", type: "payment.succeeded" as const, checkoutRef: payment.checkoutRef!, providerRef: "pi_3", amountCents: payment.amountCents };
    const first = await processEvent(db(), "test", evt);
    const second = await processEvent(db(), "test", evt);
    const third = await processEvent(db(), "test", { ...evt, id: "evt_dup_2" }); // same payment, different event id
    expect(first.status).toBe(200);
    expect(second.body).toMatch(/Duplicate/);
    expect(third.body).toMatch(/already processed/);
    const pays = await db().select().from(s.payments).where(eq(s.payments.status, "succeeded"));
    expect(pays).toHaveLength(1);
    const confirmations = await db().select().from(s.messages).where(eq(s.messages.templateKey, "booking_confirmation"));
    expect(confirmations).toHaveLength(1);
    const items = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, hold.booking.id));
    expect(items.every((i) => i.status === "confirmed")).toBe(true);
  });

  it("rejects webhooks with a bad signature", async () => {
    const { testProvider } = await import("@/lib/payments/provider");
    const { handleWebhook } = await import("@/lib/payments/webhooks");
    const res = await handleWebhook(db(), testProvider, JSON.stringify({ id: "x", type: "payment.succeeded" }), new Headers({ "x-yalla-test-signature": "t=1,v1=bad" }));
    expect(res.status).toBe(400);
  });
});

describe("booking changes", () => {
  it("leaves the booking untouched when a move fails", async () => {
    const p = await program();
    const s1 = await session(p.id, { capacity: 2 }, 7);
    const s2 = await session(p.id, { capacity: 1 }, 8);
    const a = await family("Mover");
    const filler = await family("Fill");
    const hold = await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: s1.id, childId: a.children[0].id }], source: "admin" });
    await db().update(s.bookingItems).set({ status: "confirmed" }).where(eq(s.bookingItems.bookingId, hold.booking.id));
    await createHold(db(), owner, { familyId: filler.family.id, items: [{ sessionId: s2.id, childId: filler.children[0].id }], source: "admin" });
    await expect(moveItem(db(), owner, { itemId: hold.items[0].id, targetSessionId: s2.id, notify: false })).rejects.toThrow();
    const items = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, hold.booking.id));
    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe(s1.id);
    expect(items[0].status).toBe("confirmed");
  });
});
