/** Family check-in codes and the lobby kiosk (camp, weekend sessions, Happenings; not Flex or Club Yalla). */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { acceptableCode, endKioskSessions, ensureCheckinCode, kioskCheckIn, kioskCheckOut, kioskLookup, kioskSessionValid, startKioskSession } from "@/lib/ops/checkin";
import { sendEveningReminders } from "@/lib/jobs";
import { addDaysISO, todayLA, zonedDateTime } from "@/lib/time";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

async function family(name: string, kids: string[]) {
  const [f] = await db().insert(s.families).values({ name: `${name} family` }).returning();
  const [g] = await db().insert(s.guardians).values({ familyId: f.id, firstName: name, lastName: "Test", email: `${name.toLowerCase()}@example.com`, isPrimary: true, portalAccess: true }).returning();
  const children = [];
  for (const k of kids) {
    const [c] = await db().insert(s.children).values({ familyId: f.id, firstName: k, lastName: "Test", birthDate: addDaysISO(todayLA(), -6 * 365) }).returning();
    children.push(c);
  }
  return { familyId: f.id, guardianId: g.id, children };
}

async function book(familyId: string, items: { sessionId: string; childId: string }[]) {
  const hold = await createHold(db(), owner, { familyId, items, source: "admin", acknowledgePaperwork: true });
  await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
}

/** Today's camp day and Flex day: the Rivera family has Ava and Leo at camp and Mia at Flex. */
async function today() {
  const camp = await program({ slug: "camp-yalla", kind: "camp", name: "Camp Yalla" });
  const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
  const campDay = await session(camp.id, { capacity: 6, minAgeMonths: 48, maxAgeMonths: 95 }, 0, "09:00", "15:00");
  const flexDay = await session(flex.id, { capacity: 6 }, 0);
  const fam = await family("Rivera", ["Ava", "Leo", "Mia"]);
  await book(fam.familyId, [
    { sessionId: campDay.id, childId: fam.children[0].id },
    { sessionId: campDay.id, childId: fam.children[1].id },
  ]);
  await book(fam.familyId, [{ sessionId: flexDay.id, childId: fam.children[2].id }]);
  const code = await ensureCheckinCode(db(), fam.familyId);
  return { campDay, flexDay, fam, code };
}

const noon = () => zonedDateTime(todayLA(), "12:00");

describe("Check-in codes", () => {
  it("are 4 digits, never a run, four of a kind or a door code", () => {
    for (const bad of ["1234", "4321", "7777", "2252", "2424", "2022", "0912", "123", "12345", "abcd"]) expect(acceptableCode(bad)).toBe(false);
    for (const good of ["4817", "3095", "9160"]) expect(acceptableCode(good)).toBe(true);
  });

  it("each family gets one unique code that never changes", async () => {
    const a = await family("Ana", ["Kid"]);
    const b = await family("Ben", ["Kid"]);
    const ca = await ensureCheckinCode(db(), a.familyId);
    const cb = await ensureCheckinCode(db(), b.familyId);
    expect(acceptableCode(ca)).toBe(true);
    expect(ca).not.toBe(cb);
    expect(await ensureCheckinCode(db(), a.familyId)).toBe(ca);
  });
});

describe("Kiosk sessions", () => {
  it("work only on a device staff opened today, until midnight or until staff close them", async () => {
    const { token, expiresAt } = await startKioskSession(db(), owner);
    expect(await kioskSessionValid(db(), token)).toBe(true);
    expect(await kioskSessionValid(db(), "not-a-token")).toBe(false);
    expect(await kioskSessionValid(db(), undefined)).toBe(false);
    expect(await kioskSessionValid(db(), token, new Date(expiresAt.getTime() + 1000))).toBe(false);
    expect(expiresAt.getTime()).toBe(zonedDateTime(addDaysISO(todayLA(), 1), "00:00").getTime());
    expect(await endKioskSessions(db())).toBe(1);
    expect(await kioskSessionValid(db(), token)).toBe(false);
  });
});

describe("The lobby kiosk", () => {
  it("shows the family's children booked today at camp, but not Flex (Flex uses Brightwheel)", async () => {
    const { code } = await today();
    const fam = await kioskLookup(db(), code, noon());
    expect(fam?.familyName).toBe("Rivera family");
    expect(fam?.children.map((c) => `${c.name} · ${c.what}`).sort()).toEqual(["Ava · Camp Yalla", "Leo · Camp Yalla"]);
    expect(fam?.children.every((c) => c.status === "expected")).toBe(true);
    expect(await kioskLookup(db(), "0000", noon())).toBeNull();
  });

  it("checks children in and out, records who collected them, and shows on the roster", async () => {
    const { campDay, fam, code } = await today();
    const [ava, leo] = fam.children;
    expect(await kioskCheckIn(db(), code, [{ sessionId: campDay.id, childId: ava.id }, { sessionId: campDay.id, childId: leo.id }], noon())).toEqual(["Ava", "Leo"]);
    const recs = await db().select().from(s.attendanceRecords).where(eq(s.attendanceRecords.sessionId, campDay.id));
    expect(recs.map((r) => r.status)).toEqual(["checked_in", "checked_in"]);
    expect(recs[0].checkedInBy).toBe("Lobby kiosk");

    const look = await kioskLookup(db(), code, noon());
    expect(look!.collectors.map((c) => c.name)).toEqual(["Rivera Test"]);
    await kioskCheckOut(db(), code, [{ sessionId: campDay.id, childId: ava.id }], look!.collectors[0].id, zonedDateTime(todayLA(), "15:00"));
    const [r] = await db().select().from(s.attendanceRecords).where(and(eq(s.attendanceRecords.sessionId, campDay.id), eq(s.attendanceRecords.childId, ava.id)));
    expect(r.status).toBe("checked_out");
    expect(r.collectedByName).toBe("Rivera Test");
  });

  it("never lets one family's code check in another family's child, or a child not booked today", async () => {
    const { campDay, flexDay, fam, code } = await today();
    const other = await family("Other", ["Zed"]);
    await book(other.familyId, [{ sessionId: campDay.id, childId: other.children[0].id }]);
    await expect(kioskCheckIn(db(), code, [{ sessionId: campDay.id, childId: other.children[0].id }], noon())).rejects.toThrow();
    await expect(kioskCheckIn(db(), code, [{ sessionId: flexDay.id, childId: fam.children[2].id }], noon())).rejects.toThrow();
    await expect(kioskCheckIn(db(), "9999", [{ sessionId: campDay.id, childId: fam.children[0].id }], noon())).rejects.toThrow();
  });

  it("doesn't list restricted people as collectors, or check out a child who isn't checked in", async () => {
    const { campDay, fam, code } = await today();
    await db().insert(s.authorizedPickups).values({ familyId: fam.familyId, name: "Grandma Test", relationship: "Grandparent" });
    await db().insert(s.authorizedPickups).values({ familyId: fam.familyId, name: "Not Allowed", relationship: "Other", isRestricted: true, restrictionNote: "Court order" });
    const look = await kioskLookup(db(), code, noon());
    expect(look!.collectors.map((c) => c.name)).toEqual(["Rivera Test", "Grandma Test"]);
    await expect(kioskCheckOut(db(), code, [{ sessionId: campDay.id, childId: fam.children[0].id }], look!.collectors[1].id, noon())).rejects.toThrow(/isn’t checked in/);
  });
});

describe("Codes in the reminder email", () => {
  it("the evening reminder for a Happening or camp day includes the family's code; Flex's doesn't", async () => {
    const happening = await program({ slug: "yalla-weekends", kind: "happening", name: "Weekend Play" });
    const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex" });
    const h = await session(happening.id, { capacity: 6 }, 1, "09:00", "12:00");
    const f = await session(flex.id, { capacity: 6 }, 1);
    const a = await family("Hap", ["Kid"]);
    const b = await family("Flexy", ["Kid"]);
    await book(a.familyId, [{ sessionId: h.id, childId: a.children[0].id }]);
    await book(b.familyId, [{ sessionId: f.id, childId: b.children[0].id }]);
    // Both already had their first-day welcomes (so the regular reminder goes out).
    await db().update(s.families).set({ flexWelcomeSentAt: new Date("2026-01-01") });
    await sendEveningReminders(db(), { baseUrl: "https://yalla.test", now: zonedDateTime(todayLA(), "18:00") });
    const code = await ensureCheckinCode(db(), a.familyId);
    const [ra] = await db().select().from(s.messages).where(and(eq(s.messages.templateKey, "booking_reminder"), eq(s.messages.toAddress, "hap@example.com")));
    const [rb] = await db().select().from(s.messages).where(and(eq(s.messages.templateKey, "booking_reminder"), eq(s.messages.toAddress, "flexy@example.com")));
    expect(ra.body).toContain(`Your family’s check-in code: **${code}**`);
    expect(rb.body).not.toContain("check-in code");
  });
});
