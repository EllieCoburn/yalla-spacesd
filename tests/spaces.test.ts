import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { Actor } from "@/lib/audit";
import { processEvent } from "@/lib/payments/webhooks";
import { dayView, myReservations } from "@/lib/spaces/availability";
import { DEFAULT_SPACE_CONFIG, saveSpaceConfig } from "@/lib/spaces/config";
import {
  allowanceFor,
  cancelSpaceGroup,
  confirmSpaceGroup,
  createReservation,
  expireSpaceHolds,
  moveSpaceGroup,
  planIntervals,
  quoteSpace,
  startSpaceCheckout,
  type ReserveInput,
} from "@/lib/spaces/engine";
import { addDaysISO, todayLA, weekdayOf } from "@/lib/time";
import { db, family, owner, reset } from "./helpers";

beforeEach(reset);

const familyActor = (name = "Parent"): Actor => ({ type: "family", id: "g", name });

/** The first Monday at least a week away, so every test date is safely in the future. */
function nextMonday() {
  let d = addDaysISO(todayLA(), 7);
  while (weekdayOf(d) !== 1) d = addDaysISO(d, 1);
  return d;
}

async function seedSpaces() {
  const ws = await db()
    .insert(s.workspaces)
    .values([
      { slug: "jane", name: "Jane", category: "private_office", displayOrder: 1, bookingTypes: ["complimentary", "half_day", "full_day", "week"], complimentaryEligible: true },
      { slug: "frida", name: "Frida", category: "private_office", displayOrder: 2, bookingTypes: ["half_day", "full_day", "week"] },
      { slug: "maya", name: "Maya", category: "phone_booth", displayOrder: 3, bookingTypes: ["complimentary"], complimentaryEligible: true },
      { slug: "zora", name: "Zora", category: "private_desk", displayOrder: 4, bookingTypes: ["full_day", "week"] },
      { slug: "rosa", name: "Rosa", category: "private_desk", displayOrder: 5, bookingTypes: ["full_day", "week"] },
    ])
    .returning();
  await db()
    .insert(s.workspaceRates)
    .values([
      { category: "private_office", bookingType: "half_day", priceCents: 3000, effectiveFrom: "2026-01-01" },
      { category: "private_office", bookingType: "full_day", priceCents: 5500, effectiveFrom: "2026-01-01" },
      { category: "private_office", bookingType: "week", priceCents: 27000, effectiveFrom: "2026-01-01" },
      { category: "private_desk", bookingType: "full_day", priceCents: 3500, effectiveFrom: "2026-01-01" },
      { category: "private_desk", bookingType: "week", priceCents: 15000, effectiveFrom: "2026-01-01" },
    ]);
  const by = Object.fromEntries(ws.map((w) => [w.slug, w])) as Record<string, typeof s.workspaces.$inferSelect>;
  return by;
}

/** A family with complimentary time (granted by staff, so tests don't depend on memberships). */
async function eligibleFamily(name = "Comp") {
  const f = await family(name);
  await db().insert(s.spaceEntitlements).values({ familyId: f.family.id, mode: "grant" });
  return f;
}

const comp = (workspaceId: string, date: string, start: string, minutes: number): ReserveInput => ({ workspaceId, bookingType: "complimentary", date, start, minutes });

describe("Availability", () => {
  it("reserves free time, rejects overlaps and allows back-to-back bookings", async () => {
    const ws = await seedSpaces();
    const a = await eligibleFamily("A");
    const b = await eligibleFamily("B");
    const day = nextMonday();
    const g = await createReservation(db(), familyActor(), comp(ws.jane.id, day, "10:00", 60), { familyId: a.family.id, source: "portal" });
    expect(g.status).toBe("confirmed");
    await expect(createReservation(db(), familyActor(), comp(ws.jane.id, day, "10:30", 30), { familyId: b.family.id, source: "portal" })).rejects.toThrow(/just reserved/);
    const next = await createReservation(db(), familyActor(), comp(ws.jane.id, day, "11:00", 30), { familyId: b.family.id, source: "portal" });
    expect(next.status).toBe("confirmed");
    // Another workspace is independent.
    const other = await createReservation(db(), familyActor(), comp(ws.maya.id, day, "10:00", 30), { familyId: b.family.id, source: "portal" });
    expect(other.status).toBe("confirmed");
  });

  it("rejects times outside opening hours, on closed days and in administrative blocks", async () => {
    const ws = await seedSpaces();
    const a = await eligibleFamily();
    const day = nextMonday();
    await expect(quoteSpace(db(), comp(ws.jane.id, day, "16:15", 30), { familyId: a.family.id })).rejects.toThrow(/open/);
    await expect(quoteSpace(db(), comp(ws.jane.id, day, "08:00", 15), { familyId: a.family.id })).rejects.toThrow(/open/);
    await expect(quoteSpace(db(), comp(ws.jane.id, addDaysISO(day, 5), "10:00", 15), { familyId: a.family.id })).rejects.toThrow(/isn’t open/);
    const q = await quoteSpace(db(), comp(ws.jane.id, day, "10:00", 15), { familyId: a.family.id });
    await db()
      .insert(s.workspaceBlocks)
      .values({ workspaceId: ws.jane.id, startsAt: new Date(q.intervals[0].startsAt), endsAt: new Date(new Date(q.intervals[0].startsAt).getTime() + 3600_000), kind: "maintenance" });
    await expect(createReservation(db(), familyActor(), comp(ws.jane.id, day, "10:30", 15), { familyId: a.family.id, source: "portal" })).rejects.toThrow(/unavailable/);
    // Staff can override a block, but never another family's reservation.
    const g = await createReservation(db(), owner, comp(ws.jane.id, day, "10:30", 15), { familyId: a.family.id, source: "admin", override: true });
    expect(g.status).toBe("confirmed");
  });

  it("never reveals who booked in the family-facing day view", async () => {
    const ws = await seedSpaces();
    const a = await eligibleFamily("Private");
    const day = nextMonday();
    await createReservation(db(), familyActor(), comp(ws.jane.id, day, "09:00", 45), { familyId: a.family.id, source: "portal" });
    const view = await dayView(db(), day);
    expect(view.busy).toHaveLength(1);
    expect(Object.keys(view.busy[0]).sort()).toEqual(["end", "start", "status", "workspaceId"]);
    expect(JSON.stringify(view)).not.toContain(a.family.id);
    expect(JSON.stringify(view)).not.toContain("Private");
  });
});

describe("Complimentary time", () => {
  it("shares one daily allowance across Jane and Maya, at the family level", async () => {
    const ws = await seedSpaces();
    const f = await eligibleFamily();
    const day = nextMonday();
    await createReservation(db(), familyActor("Parent 1"), comp(ws.jane.id, day, "09:00", 30), { familyId: f.family.id, source: "portal" });
    await createReservation(db(), familyActor("Parent 2"), comp(ws.maya.id, day, "13:00", 30), { familyId: f.family.id, source: "portal" });
    expect((await allowanceFor(db(), f.family.id, day)).remainingMinutes).toBe(0);
    await expect(createReservation(db(), familyActor("Parent 2"), comp(ws.maya.id, day, "14:00", 15), { familyId: f.family.id, source: "portal" })).rejects.toThrow(/used your complimentary/);
    // The next day starts fresh.
    expect((await allowanceFor(db(), f.family.id, addDaysISO(day, 1))).remainingMinutes).toBe(60);
  });

  it("is only for eligible families, and an active Club Yalla membership counts", async () => {
    const ws = await seedSpaces();
    const plain = await family("Plain");
    const day = nextMonday();
    await expect(createReservation(db(), familyActor(), comp(ws.jane.id, day, "09:00", 15), { familyId: plain.family.id, source: "portal" })).rejects.toThrow(/isn’t included/);
    const [loc] = await db().insert(s.locations).values({ name: "Yalla" }).returning();
    const [p] = await db().insert(s.programs).values({ slug: "club", name: "Club Yalla", kind: "membership", status: "published", locationId: loc.id }).returning();
    const [c] = await db().insert(s.cohorts).values({ name: "Sprouts" }).returning();
    await db()
      .insert(s.memberships)
      .values({ familyId: plain.family.id, childId: plain.children[0].id, programId: p.id, cohortId: c.id, weekdays: [1, 2, 3, 4, 5], startsOn: todayLA(), status: "active", priceCents: 100000 });
    const a = await allowanceFor(db(), plain.family.id, day);
    expect(a).toMatchObject({ eligible: true, remainingMinutes: 60 });
    // Staff can take it away.
    await db().insert(s.spaceEntitlements).values({ familyId: plain.family.id, mode: "revoke" });
    expect((await allowanceFor(db(), plain.family.id, day)).eligible).toBe(false);
  });

  it("restores minutes when a reservation is cancelled, and moves keep the allowance honest", async () => {
    const ws = await seedSpaces();
    const f = await eligibleFamily();
    const day = nextMonday();
    const g = await createReservation(db(), familyActor(), comp(ws.jane.id, day, "09:00", 60), { familyId: f.family.id, source: "portal" });
    await cancelSpaceGroup(db(), familyActor(), g.id, { familyId: f.family.id, reason: "Plans changed" });
    expect((await allowanceFor(db(), f.family.id, day)).remainingMinutes).toBe(60);
    const g2 = await createReservation(db(), familyActor(), comp(ws.jane.id, day, "09:00", 45), { familyId: f.family.id, source: "portal" });
    await moveSpaceGroup(db(), familyActor(), g2.id, comp(ws.maya.id, day, "15:00", 60), { familyId: f.family.id });
    expect((await allowanceFor(db(), f.family.id, day)).remainingMinutes).toBe(0);
    const view = await dayView(db(), day);
    expect(view.busy.map((b) => b.workspaceId)).toEqual([ws.maya.id]);
  });

  it("cannot be double-spent by simultaneous requests", async () => {
    const ws = await seedSpaces();
    const f = await eligibleFamily();
    const day = nextMonday();
    const results = await Promise.allSettled([
      createReservation(db(), familyActor("Parent 1"), comp(ws.jane.id, day, "09:00", 45), { familyId: f.family.id, source: "portal" }),
      createReservation(db(), familyActor("Parent 2"), comp(ws.maya.id, day, "09:00", 45), { familyId: f.family.id, source: "portal" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await allowanceFor(db(), f.family.id, day)).usedMinutes).toBe(45);
  });
});

describe("Double booking", () => {
  it("lets only one of two simultaneous requests take the same time", async () => {
    const ws = await seedSpaces();
    const a = await eligibleFamily("A");
    const b = await eligibleFamily("B");
    const day = nextMonday();
    const results = await Promise.allSettled([
      createReservation(db(), familyActor(), comp(ws.jane.id, day, "10:00", 60), { familyId: a.family.id, source: "portal" }),
      createReservation(db(), familyActor(), comp(ws.jane.id, day, "10:30", 30), { familyId: b.family.id, source: "portal" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason.message)).toMatch(/just reserved/);
  });
});

describe("Paid reservations", () => {
  it("charges the rate in force and keeps it after the rate changes", async () => {
    const ws = await seedSpaces();
    const f = await family("Payer");
    const day = nextMonday();
    const g = await createReservation(db(), familyActor(), { workspaceId: ws.zora.id, bookingType: "full_day", date: day }, { familyId: f.family.id, source: "portal" });
    expect(g).toMatchObject({ status: "held", totalCents: 3500 });
    await db().update(s.workspaceRates).set({ priceCents: 9900 }).where(eq(s.workspaceRates.bookingType, "full_day"));
    const [after] = await db().select().from(s.spaceReservationGroups).where(eq(s.spaceReservationGroups.id, g.id));
    expect(after.totalCents).toBe(3500);
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.spaceGroupId, g.id));
    const lines = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, inv.id));
    expect(lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(3500);
  });

  it("books a week as five operating days and refuses a week with any taken day", async () => {
    const ws = await seedSpaces();
    const f = await family("Week");
    const other = await family("Other");
    const monday = nextMonday();
    const g = await createReservation(db(), owner, { workspaceId: ws.frida.id, bookingType: "week", date: addDaysISO(monday, 2) }, { familyId: f.family.id, source: "admin", charge: "invoice" });
    const rows = await db().select().from(s.spaceReservations).where(eq(s.spaceReservations.groupId, g.id));
    expect(rows.map((r) => r.localDate).sort()).toEqual([0, 1, 2, 3, 4].map((i) => addDaysISO(monday, i)));
    expect(g.totalCents).toBe(27000);
    // Another family books Thursday of the following week; that whole week is then unavailable.
    const nextWeek = addDaysISO(monday, 7);
    await createReservation(db(), owner, { workspaceId: ws.zora.id, bookingType: "full_day", date: addDaysISO(nextWeek, 3) }, { familyId: other.family.id, source: "admin", charge: "none" });
    await expect(createReservation(db(), familyActor(), { workspaceId: ws.zora.id, bookingType: "week", date: nextWeek }, { familyId: f.family.id, source: "portal" })).rejects.toThrow(/spoken for|just reserved/);
    const zoraRows = await db().select().from(s.spaceReservations).where(and(eq(s.spaceReservations.workspaceId, ws.zora.id), eq(s.spaceReservations.familyId, f.family.id)));
    expect(zoraRows).toHaveLength(0);
  });

  it("won't book a week that includes a closure", async () => {
    const ws = await seedSpaces();
    const f = await family("Holiday");
    const monday = nextMonday();
    await db().insert(s.blackoutDates).values({ startsOn: addDaysISO(monday, 3), endsOn: addDaysISO(monday, 3), reason: "Holiday" });
    await expect(quoteSpace(db(), { workspaceId: ws.zora.id, bookingType: "week", date: monday }, { familyId: f.family.id })).rejects.toThrow(/closed/);
  });

  it("confirms only on a verified payment, once, and releases expired holds", async () => {
    const ws = await seedSpaces();
    const f = await family("Pay");
    const day = nextMonday();
    const g = await createReservation(db(), familyActor(), { workspaceId: ws.rosa.id, bookingType: "full_day", date: day }, { familyId: f.family.id, source: "portal" });
    await startSpaceCheckout(db(), familyActor(), g.id, { base: "http://localhost" });
    const [pay] = await db().select().from(s.payments).where(eq(s.payments.familyId, f.family.id));
    await processEvent(db(), "test", { id: "evt_space_fail", type: "payment.failed", checkoutRef: pay.checkoutRef!, reason: "Declined" });
    let [row] = await db().select().from(s.spaceReservationGroups).where(eq(s.spaceReservationGroups.id, g.id));
    expect(row.status).toBe("held");
    await startSpaceCheckout(db(), familyActor(), g.id, { base: "http://localhost" });
    const [retry] = await db().select().from(s.payments).where(and(eq(s.payments.familyId, f.family.id), eq(s.payments.status, "pending")));
    const evt = { id: "evt_space_ok", type: "payment.succeeded" as const, checkoutRef: retry.checkoutRef!, providerRef: "pi_space", amountCents: retry.amountCents };
    await processEvent(db(), "test", evt);
    await processEvent(db(), "test", evt);
    [row] = await db().select().from(s.spaceReservationGroups).where(eq(s.spaceReservationGroups.id, g.id));
    expect(row.status).toBe("confirmed");
    const confirmations = await db().select().from(s.messages).where(eq(s.messages.templateKey, "space_confirmation"));
    expect(confirmations).toHaveLength(1);

    // An abandoned hold expires and frees the time.
    const g2 = await createReservation(db(), familyActor(), { workspaceId: ws.zora.id, bookingType: "full_day", date: day }, { familyId: f.family.id, source: "portal" });
    await expireSpaceHolds(db(), new Date(Date.now() + 3600_000));
    const [expired] = await db().select().from(s.spaceReservationGroups).where(eq(s.spaceReservationGroups.id, g2.id));
    expect(expired.status).toBe("expired");
    const q = await quoteSpace(db(), { workspaceId: ws.zora.id, bookingType: "full_day", date: day }, { familyId: f.family.id });
    expect(q.available).toBe(true);
  });

  it("flags a late payment for staff when the time was taken after the hold lapsed", async () => {
    const ws = await seedSpaces();
    const a = await family("Late");
    const b = await family("Quick");
    const day = nextMonday();
    const g = await createReservation(db(), familyActor(), { workspaceId: ws.zora.id, bookingType: "full_day", date: day }, { familyId: a.family.id, source: "portal" });
    await db().update(s.spaceReservations).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.spaceReservations.groupId, g.id));
    await db().update(s.spaceReservationGroups).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.spaceReservationGroups.id, g.id));
    await createReservation(db(), owner, { workspaceId: ws.zora.id, bookingType: "full_day", date: day }, { familyId: b.family.id, source: "admin", charge: "none" });
    const r = await confirmSpaceGroup(db(), { type: "webhook", name: "Test" }, g.id, { reason: "Late payment" });
    expect(r.status).toBe("needs_attention");
  });

  it("doesn't let the phone booth be paid for until a rate exists, then prices by the hour", async () => {
    const ws = await seedSpaces();
    const f = await family("Booth");
    const day = nextMonday();
    await expect(quoteSpace(db(), { workspaceId: ws.maya.id, bookingType: "hourly", date: day, start: "10:00", minutes: 60 }, { familyId: f.family.id })).rejects.toThrow(/isn’t available to book online/);
    await db().update(s.workspaces).set({ bookingTypes: ["complimentary", "hourly"] }).where(eq(s.workspaces.id, ws.maya.id));
    const noRate = await quoteSpace(db(), { workspaceId: ws.maya.id, bookingType: "hourly", date: day, start: "10:00", minutes: 60 }, { familyId: f.family.id });
    expect(noRate.available).toBe(false);
    await db().insert(s.workspaceRates).values({ workspaceId: ws.maya.id, bookingType: "hourly", priceCents: 1000, effectiveFrom: "2026-01-01" });
    const q = await quoteSpace(db(), { workspaceId: ws.maya.id, bookingType: "hourly", date: day, start: "10:00", minutes: 90 }, { familyId: f.family.id });
    expect(q).toMatchObject({ available: true, priceCents: 1500 });
  });
});

describe("Permissions", () => {
  it("doesn't let a family see or cancel another family's reservation", async () => {
    const ws = await seedSpaces();
    const a = await eligibleFamily("Owner");
    const b = await eligibleFamily("Snoop");
    const day = nextMonday();
    const g = await createReservation(db(), familyActor(), comp(ws.jane.id, day, "09:00", 30), { familyId: a.family.id, source: "portal" });
    await expect(cancelSpaceGroup(db(), familyActor(), g.id, { familyId: b.family.id, reason: "" })).rejects.toThrow(/not found/);
    expect((await myReservations(db(), b.family.id)).upcoming).toHaveLength(0);
    expect((await myReservations(db(), a.family.id)).upcoming).toHaveLength(1);
  });

  it("asks families to contact Yalla to cancel a paid reservation by default", async () => {
    const ws = await seedSpaces();
    const f = await family("Paid");
    const g = await createReservation(db(), owner, { workspaceId: ws.zora.id, bookingType: "full_day", date: nextMonday() }, { familyId: f.family.id, source: "admin", charge: "invoice" });
    await expect(cancelSpaceGroup(db(), familyActor(), g.id, { familyId: f.family.id, reason: "" })).rejects.toThrow(/contact Yalla/);
    await saveSpaceConfig(db(), owner, { ...DEFAULT_SPACE_CONFIG, cancellation: { ...DEFAULT_SPACE_CONFIG.cancellation, paidFamilyCancel: "cancel", paidCutoffHours: 24 } });
    const done = await cancelSpaceGroup(db(), familyActor(), g.id, { familyId: f.family.id, reason: "" });
    expect(done.status).toBe("cancelled");
  });
});

describe("Time handling", () => {
  it("keeps 8:30am local across the daylight saving change", async () => {
    const ws = { id: "w", name: "Jane", hours: null } as unknown as typeof s.workspaces.$inferSelect;
    const before = planIntervals(DEFAULT_SPACE_CONFIG, ws, { workspaceId: "w", bookingType: "full_day", date: "2026-10-30" }, new Set());
    const after = planIntervals(DEFAULT_SPACE_CONFIG, ws, { workspaceId: "w", bookingType: "full_day", date: "2026-11-02" }, new Set());
    expect(before[0].startsAt.toISOString()).toBe("2026-10-30T15:30:00.000Z");
    expect(after[0].startsAt.toISOString()).toBe("2026-11-02T16:30:00.000Z");
  });

  it("covers Monday to Friday for a week and never the weekend", () => {
    const ws = { id: "w", name: "Zora", hours: null } as unknown as typeof s.workspaces.$inferSelect;
    const rows = planIntervals(DEFAULT_SPACE_CONFIG, ws, { workspaceId: "w", bookingType: "week", date: "2026-11-11" }, new Set());
    expect(rows.map((r) => r.localDate)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });
});
