/** Every child booked into Yalla Flex today is counted on Drop-ins and Club Yalla operations. */
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { upcomingDropIns } from "@/lib/ops/team-notices";
import { flexGroupForBooking } from "@/lib/booking/flex";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

describe("Flex drop-ins today", () => {
  it("lists both children, even when one session's starting age isn't a current group's", async () => {
    const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
    const today = todayLA();
    // A current Wildflowers session, and one made with other ages (e.g. by hand, or before the groups changed).
    const wild = await session(flex.id, { capacity: 4, minAgeMonths: 36, maxAgeMonths: 59, title: "Yalla Flex · 3 – 4 years" }, 0, "08:30", "16:30");
    const odd = await session(flex.id, { capacity: 4, minAgeMonths: 30, maxAgeMonths: 59, title: "Yalla Flex" }, 0, "08:30", "16:30");
    const [f] = await db().insert(s.families).values({ name: "Two family" }).returning();
    const [a] = await db().insert(s.children).values({ familyId: f.id, firstName: "Ada", lastName: "Two", birthDate: addDaysISO(today, -Math.round(41 * 30.44)) }).returning();
    const [b] = await db().insert(s.children).values({ familyId: f.id, firstName: "Ben", lastName: "Two", birthDate: addDaysISO(today, -Math.round(40 * 30.44)) }).returning();
    for (const [sess, c] of [[wild, a], [odd, b]] as const) {
      const hold = await createHold(db(), owner, { familyId: f.id, items: [{ sessionId: sess.id, childId: c.id }], source: "admin", acknowledgePaperwork: true, now: zonedDateTime(today, "07:00") });
      await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
    }
    const rows = (await upcomingDropIns(db(), { cohorts: null, days: 1 })).filter((r) => r.date === today);
    expect(rows.map((r) => r.child.firstName).sort()).toEqual(["Ada", "Ben"]);
    expect(rows.every((r) => r.cohort.cohort === "Wildflowers")).toBe(true);
  });

  it("finds a group for any session", () => {
    expect(flexGroupForBooking({ minAgeMonths: 36 }).cohort).toBe("Wildflowers");
    expect(flexGroupForBooking({ minAgeMonths: 20 }).cohort).toBe("Sprouts"); // before November 2026
    expect(flexGroupForBooking({ minAgeMonths: 18 }).cohort).toBe("Saplings"); // within 14–23 months
    expect(flexGroupForBooking({ minAgeMonths: null, title: "Yalla Flex · Seedlings" }).cohort).toBe("Seedlings");
    expect(flexGroupForBooking({ minAgeMonths: null }, 40).cohort).toBe("Wildflowers");
  });
});
