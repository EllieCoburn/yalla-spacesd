import { beforeEach, describe, expect, it } from "vitest";
import { checkoutLabel, confirmAdminBooking, createHold, describeLine, staffBookingNotice, bookingLines } from "@/lib/ops/bookings";
import { dayPresence } from "@/lib/ops/dashboard";
import { zonedDateTime } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

describe("a Yalla Flex half day shows as 8:30am–12:00pm everywhere", () => {
  it("in the team's new-booking email, at checkout, in the family's lines and on Today", async () => {
    const flex = await program({ slug: "yalla-flex", name: "Yalla Flex", kind: "drop_in", priceCents: 15000 });
    const s = await session(flex.id, { capacity: 4, title: "Yalla Flex · 20 – 35 months" });
    const fam = await family("Tucker", [{ first: "Ara", birth: "2024-06-09" }]);
    const hold = await createHold(db(), owner, { familyId: fam.family.id, items: [{ sessionId: s.id, childId: fam.children[0].id, addons: ["half"] }], source: "admin" });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });

    const notice = await staffBookingNotice(db(), hold.booking.id);
    expect(notice!.details).toContain("8:30am–12:00pm · Half day");
    expect(notice!.details).not.toContain("4:30pm");

    const label = await checkoutLabel(db(), hold.booking.id);
    expect(JSON.stringify(label)).toContain("8:30am–12:00pm · Half day");

    const [line] = await bookingLines(db(), hold.booking.id);
    expect(describeLine(line)).toContain("(half day)");
    expect(describeLine(line)).toContain("8:30am–12:00pm");

    // Still expected in the morning, not after noon.
    const morning = await dayPresence(db(), s.localDate, zonedDateTime(s.localDate, "10:00"));
    expect(morning.stillExpected.has(fam.children[0].id)).toBe(true);
    const afternoon = await dayPresence(db(), s.localDate, zonedDateTime(s.localDate, "13:00"));
    expect(afternoon.stillExpected.has(fam.children[0].id)).toBe(false);
  });

  it("a full-day and a half-day child on the same day are each shown with their own hours", async () => {
    const flex = await program({ slug: "yalla-flex", name: "Yalla Flex", kind: "drop_in", priceCents: 15000 });
    const s = await session(flex.id, { capacity: 4 });
    const fam = await family("Lee", [{ first: "Max", birth: "2024-01-01" }, { first: "Leo", birth: "2024-01-01" }]);
    const hold = await createHold(db(), owner, {
      familyId: fam.family.id,
      items: [
        { sessionId: s.id, childId: fam.children[0].id },
        { sessionId: s.id, childId: fam.children[1].id, addons: ["half"] },
      ],
      source: "admin",
    });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
    const notice = await staffBookingNotice(db(), hold.booking.id);
    expect(notice!.details).toContain("8:30am–4:30pm");
    expect(notice!.details).toMatch(/Max[^\n]*full day/);
    expect(notice!.details).toMatch(/Leo[^\n]*half day until 12:00pm/);
  });
});
