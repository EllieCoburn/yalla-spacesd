/** What to bring is in the Family Portal from the moment a Flex or camp booking is confirmed, however far ahead. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmBooking, createHold } from "@/lib/ops/bookings";
import { familyCampLists, familyFlexLists } from "@/lib/ops/what-to-bring";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

async function family() {
  const [f] = await db().insert(s.families).values({ name: "Rivera family" }).returning();
  await db().insert(s.guardians).values({ familyId: f.id, firstName: "Jordan", lastName: "Rivera", email: "jordan.rivera@example.com", isPrimary: true, portalAccess: true });
  const [c] = await db().insert(s.children).values({ familyId: f.id, firstName: "Ava", lastName: "Rivera", birthDate: addDaysISO(todayLA(), -Math.round(50 * 30.44)) }).returning();
  return { familyId: f.id, childId: c.id };
}

describe("What to bring, right after booking", () => {
  it("a Flex day five weeks away: the list is there as soon as it's paid, and the confirmation links to it", async () => {
    const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
    const day = await session(flex.id, { capacity: 4, minAgeMonths: 36, maxAgeMonths: 59 }, 35);
    const f = await family();
    const hold = await createHold(db(), owner, { familyId: f.familyId, items: [{ sessionId: day.id, childId: f.childId }], source: "public", acknowledgePaperwork: true });
    // Not paid yet: nothing to pack for.
    expect(await familyFlexLists(db(), f.familyId)).toHaveLength(0);
    await confirmBooking(db(), owner, hold.booking.id, { reason: "Paid" });
    const lists = await familyFlexLists(db(), f.familyId);
    expect(lists.map((l) => `${l.name} · ${l.cohort}`)).toEqual(["Ava · Wildflowers"]);
    const [m] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "booking_confirmation"));
    expect(m.body).toContain("See what to bring in your Family Portal");
  });

  it("a camp day weeks away: the camp list is there straight away", async () => {
    const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla" });
    const day = await session(camp.id, { capacity: 6, minAgeMonths: 48, maxAgeMonths: 95 }, 40, "09:00", "15:00");
    const f = await family();
    // Ava is 4 years 2 months: the 4 – 7 years group.
    const hold = await createHold(db(), owner, { familyId: f.familyId, items: [{ sessionId: day.id, childId: f.childId }], source: "public", acknowledgePaperwork: true });
    await confirmBooking(db(), owner, hold.booking.id, { reason: "Paid" });
    expect((await familyCampLists(db(), f.familyId)).map((l) => l.group)).toEqual(["4 – 7 years"]);
  });

  it("a Happening has no packing list, so its confirmation doesn't mention one", async () => {
    const hap = await program({ slug: "yalla-weekends", kind: "happening", name: "Weekend Play" });
    const day = await session(hap.id, { capacity: 6 }, 10, "09:00", "12:00");
    const f = await family();
    const hold = await createHold(db(), owner, { familyId: f.familyId, items: [{ sessionId: day.id, childId: f.childId }], source: "public", acknowledgePaperwork: true });
    await confirmBooking(db(), owner, hold.booking.id, { reason: "Paid" });
    const [m] = await db().select().from(s.messages).where(eq(s.messages.templateKey, "booking_confirmation"));
    expect(m.body).not.toContain("what to bring");
  });
});
