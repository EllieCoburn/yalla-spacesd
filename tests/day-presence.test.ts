import { beforeEach, describe, expect, it } from "vitest";
import { dayPresence } from "@/lib/ops/dashboard";
import { checkIn } from "@/lib/ops/attendance";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { fmtDate, localDateOf, phaseText, sessionPhase, todayLA, zonedDateTime } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

describe("who is still expected today", () => {
  it("drops children whose session is over, counts arrivals, and is in Pacific time", async () => {
    const today = todayLA();
    const flex = await program({ slug: "yalla-flex", name: "Yalla Flex" });
    const day = await session(flex.id, { capacity: 5 }, 0, "08:30", "16:30");
    const a = await family("Ana");
    const b = await family("Ben");
    for (const f of [a, b]) {
      // Booked first thing in the morning, so the test passes at any time of day.
      const h = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: day.id, childId: f.children[0].id }], source: "admin", now: zonedDateTime(today, "07:00") });
      await confirmAdminBooking(db(), owner, h.booking.id, { createInvoice: false, notify: false });
    }
    const at = (hhmm: string) => zonedDateTime(today, hhmm);

    // 7:30am: both still to come.
    let p = await dayPresence(db(), today, at("07:30"));
    expect(p.stillExpected.size).toBe(2);
    expect(phaseText(day, at("07:30"))).toBe("Starts 8:30am");

    // Ana arrives; 10am: Ana here now, Ben still expected.
    await checkIn(db(), owner, { sessionId: day.id, childId: a.children[0].id });
    p = await dayPresence(db(), today, at("10:00"));
    expect([...p.hereNow]).toEqual([a.children[0].id]);
    expect([...p.stillExpected]).toEqual([b.children[0].id]);
    expect(sessionPhase(day, at("10:00"))).toBe("live");
    expect(phaseText(day, at("10:00"))).toBe("In session until 4:30pm");

    // 7pm: the session ended at 4:30pm, so Ben is no longer expected.
    p = await dayPresence(db(), today, at("19:00"));
    expect(p.stillExpected.size).toBe(0);
    expect(p.booked.size).toBe(2);
    expect(p.came.size).toBe(1);
    expect(phaseText(day, at("19:00"))).toBe("Ended at 4:30pm");
  });

  it("dates something done at 11pm Pacific on that Pacific day, not the next (UTC) day", () => {
    const late = zonedDateTime("2026-11-19", "23:30"); // 07:30 UTC on Nov 20
    expect(late.toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(localDateOf(late)).toBe("2026-11-19");
    expect(fmtDate(localDateOf(late), "d MMM")).toBe("19 Nov");
  });
});
