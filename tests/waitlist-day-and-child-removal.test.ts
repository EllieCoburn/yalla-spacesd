import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { joinWaitlist, makeOffer } from "@/lib/ops/waitlist";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { childHistory, deleteChild, setChildRemoved } from "@/lib/ops/families";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

describe("Flex waitlist day length", () => {
  it("stores full or half, and an offer for a half day is held as a half day", async () => {
    const flex = await program({ slug: "yalla-flex", name: "Yalla Flex", kind: "drop_in", priceCents: 15000 });
    const day = await session(flex.id, { capacity: 1, minAgeMonths: 20, maxAgeMonths: 35 });
    const w = await family("Wait", [{ first: "Ivy", birth: "2024-01-15" }]);
    const entry = await joinWaitlist(db(), owner, { familyId: w.family.id, sessionId: day.id, childIds: [w.children[0].id], dayLength: "half" });
    expect(entry.dayLength).toBe("half");
    const other = await joinWaitlist(db(), owner, { familyId: (await family("Two")).family.id, sessionId: day.id, childIds: [], dayLength: "nonsense" });
    expect(other.dayLength).toBeNull();

    await makeOffer(db(), owner, { entryId: entry.id, baseUrl: "http://test" });
    const [e] = await db().select().from(s.waitlistEntries).where(eq(s.waitlistEntries.id, entry.id));
    const [item] = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, e.offerBookingId!));
    expect(item.addons).toContain("half");
  });
});

describe("Removing a child from a family", () => {
  it("deletes a child with no history, taking them off waitlists", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 0 });
    const f = await family("Oops", [{ first: "Typo", birth: "2023-01-15" }, { first: "Real", birth: "2022-01-15" }]);
    const [typo, real] = f.children;
    await joinWaitlist(db(), owner, { familyId: f.family.id, sessionId: sess.id, childIds: [typo.id, real.id] });
    expect((await childHistory(db(), typo.id)).hasHistory).toBe(false);
    await deleteChild(db(), owner, typo.id);
    expect(await db().select().from(s.children).where(eq(s.children.id, typo.id))).toHaveLength(0);
    const [w] = await db().select().from(s.waitlistEntries);
    expect(w.childIds).toEqual([real.id]);
    expect(w.status).toBe("waiting");
  });

  it("a child with bookings can be removed (and restored) but not deleted; no new bookings while removed", async () => {
    const p = await program();
    const past = await session(p.id, { capacity: 5 }, -3);
    const next = await session(p.id, { capacity: 5 }, 5);
    const f = await family("Kept");
    const kid = f.children[0];
    await db().insert(s.bookings).values({ id: "b-past", reference: "YL-P", familyId: f.family.id, status: "confirmed", source: "admin" });
    await db().insert(s.bookingItems).values({ bookingId: "b-past", sessionId: past.id, childId: kid.id, status: "confirmed" });

    await expect(deleteChild(db(), owner, kid.id)).rejects.toThrow(/removed from the family but not deleted/);

    // An upcoming booking has to be cancelled first.
    const h = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: next.id, childId: kid.id }], source: "admin" });
    await confirmAdminBooking(db(), owner, h.booking.id, { createInvoice: false, notify: false });
    await expect(setChildRemoved(db(), owner, kid.id, true)).rejects.toThrow(/upcoming booking/);
    await db().update(s.bookingItems).set({ status: "cancelled" }).where(eq(s.bookingItems.bookingId, h.booking.id));

    await setChildRemoved(db(), owner, kid.id, true);
    const later = await session(p.id, { capacity: 5 }, 9);
    await expect(createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: later.id, childId: kid.id }], source: "public" })).rejects.toThrow(/isn’t part of this family/);
    await setChildRemoved(db(), owner, kid.id, false);
    expect((await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: later.id, childId: kid.id }], source: "public" })).booking).toBeTruthy();
  });
});
