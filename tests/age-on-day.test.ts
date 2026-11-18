/** A child's age is checked on the day of the session, not the day the family books. */
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { createHold } from "@/lib/ops/bookings";
import { submitPublicBooking } from "@/lib/ops/public-booking";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

/** Born exactly 18 months before `turns`: they turn 18 months that day. */
const bornToTurn18On = (turns: string) => {
  const [y, m, d] = turns.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 - 18, d));
  return t.toISOString().slice(0, 10);
};

describe("Booking ahead of a birthday", () => {
  it("a child turning 18 months on the 23rd can be booked now for camp on the 25th, but not for a day before the 23rd", async () => {
    const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const turns = addDaysISO(todayLA(), 5);
    const before = await session(camp.id, { capacity: 6, minAgeMonths: 18, maxAgeMonths: 47 }, 3, "09:00", "15:00");
    const after = await session(camp.id, { capacity: 6, minAgeMonths: 18, maxAgeMonths: 47 }, 7, "09:00", "15:00");
    const [f] = await db().insert(s.families).values({ name: "Birthday family" }).returning();
    const [c] = await db().insert(s.children).values({ familyId: f.id, firstName: "Teddy", lastName: "Test", birthDate: bornToTurn18On(turns) }).returning();

    // Booked today, for two days after the 18-month birthday: allowed.
    const ok = await createHold(db(), owner, { familyId: f.id, items: [{ sessionId: after.id, childId: c.id }], source: "public", acknowledgePaperwork: true });
    expect(ok.booking.id).toBeTruthy();
    // For a day before the birthday: refused, with the reason.
    await expect(createHold(db(), owner, { familyId: f.id, items: [{ sessionId: before.id, childId: c.id }], source: "public", acknowledgePaperwork: true })).rejects.toThrow(/17 months old/);
  });

  it("the website checkout allows it too, for a new child entered by birthday", async () => {
    const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const turns = addDaysISO(todayLA(), 5);
    const after = await session(camp.id, { capacity: 6, minAgeMonths: 18, maxAgeMonths: 47 }, 7, "09:00", "15:00");
    const r = await submitPublicBooking(db(), {
      guardian: { firstName: "Mom", lastName: "Test", email: "birthday.mom@example.com", phone: "619-555-0100" },
      children: [{ key: "a", firstName: "Teddy", lastName: "Test", birthDate: bornToTurn18On(turns), allergies: "", medications: "" }],
      lines: [{ sessionId: after.id, childKeys: ["a"] }],
      signatures: [],
      meta: {},
      baseUrl: "http://test",
    });
    expect(r.ok).toBe(true);
  });
});
