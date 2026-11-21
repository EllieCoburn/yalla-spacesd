/** Camp and Happenings show Full ahead of time: 24 hours out with no one booked, 30 minutes out otherwise. */
import { beforeEach, describe, expect, it } from "vitest";
import { publicState } from "@/lib/ops/capacity";
import { submitPublicBooking, type PublicBookingInput } from "@/lib/ops/public-booking";
import { createHold } from "@/lib/ops/bookings";
import { joinWaitlist } from "@/lib/ops/waitlist";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const H = 3600_000;
const at = (hoursFromNow: number) => ({ startsAt: new Date(Date.now() + hoursFromNow * H), endsAt: new Date(Date.now() + (hoursFromNow + 3) * H) });
const input = (sessionId: string, email = "robin@example.com"): PublicBookingInput => ({
  guardian: { firstName: "Robin", lastName: "Early", email, phone: "619-555-0100" },
  children: [{ key: "a", firstName: "Pip", lastName: "Early", birthDate: "2021-02-01", allergies: "", medications: "" }],
  lines: [{ sessionId, childKeys: ["a"] }],
  signatures: [],
  meta: {},
  baseUrl: "http://test",
});

describe("Ahead-of-time Full for Camp and Happenings", () => {
  it("the rule: empty within 24h, or anyone within 30 minutes", () => {
    const base = { status: "scheduled", bookingOpensAt: null, bookingClosesAt: null };
    const camp = { status: "published", showRemaining: true, lowAvailabilityThreshold: 0, waitlistEnabled: true, minNoticeMinutes: 0, advanceBookingDays: null, kind: "camp", slug: "camp-yalla" };
    const flex = { ...camp, kind: "drop_in", slug: "yalla-flex" };
    const st = (hours: number, occupied: number, p = camp) => publicState({ ...base, ...at(hours) }, p, 5, new Date(), occupied).state;
    expect(st(30, 0)).toBe("available");
    expect(st(20, 0)).toBe("full");
    expect(st(20, 1)).toBe("available");
    expect(st(0.4, 1)).toBe("full");
    expect(st(20, 0, flex)).toBe("available"); // Flex isn't affected
    expect(publicState({ ...base, ...at(20) }, camp, 5).state).toBe("available"); // no occupancy given: unchanged
  });

  it("families can't book an empty camp day 20 hours out, but can join the waitlist; staff can still book", async () => {
    const camp = await program({ kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const s = await session(camp.id, { capacity: 6, ...at(20) });
    const r = await submitPublicBooking(db(), input(s.id));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/now full\. You can join the waitlist/);
    const f = await family("Wait");
    expect(await joinWaitlist(db(), owner, { familyId: f.family.id, sessionId: s.id, childIds: [f.children[0].id] })).toBeTruthy();
    expect((await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: s.id, childId: f.children[0].id }], source: "admin" })).booking).toBeTruthy();
  });

  it("once someone has booked, it stays open until 30 minutes before", async () => {
    const camp = await program({ kind: "happening", name: "Weekend Play", priceCents: 6000 });
    const s = await session(camp.id, { capacity: 6, ...at(20) });
    const f = await family("First");
    await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: s.id, childId: f.children[0].id }], source: "admin" });
    expect((await submitPublicBooking(db(), input(s.id))).ok).toBe(true);
  });
});
