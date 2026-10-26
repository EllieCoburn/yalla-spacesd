import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import {
  addPrice,
  createProgram,
  deactivateRequirement,
  deleteDraftProgram,
  setProgramCohorts,
  setProgramStatus,
  updatePrice,
  updateProgram,
  type ProgramInput,
} from "@/lib/ops/programs";
import { addRequirement, createTemplate, paperworkStatus } from "@/lib/ops/forms";
import { addBlackout, createSeries, previewBlackout } from "@/lib/ops/schedule";
import { createHold, confirmAdminBooking } from "@/lib/ops/bookings";
import { joinWaitlist, makeOffer, expireOffers } from "@/lib/ops/waitlist";
import { availabilityFor } from "@/lib/ops/capacity";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const base = (over: Partial<ProgramInput> = {}): ProgramInput => ({
  name: "Yalla Test Mornings",
  slug: "yalla-test-mornings",
  kind: "weekend",
  parentPresence: "not_required",
  bookingUnit: "per_child",
  bookingMode: "instant",
  seriesMode: "individual",
  showRemaining: true,
  lowAvailabilityThreshold: 2,
  waitlistEnabled: true,
  waitlistAutoOffer: false,
  offerWindowHours: 24,
  minNoticeHours: 0,
  priceUnit: "session",
  ...over,
});

describe("program management", () => {
  it("creates drafts, validates input and rejects duplicate slugs", async () => {
    const p = await createProgram(db(), owner, base());
    expect(p.status).toBe("draft");
    await expect(createProgram(db(), owner, base())).rejects.toThrow(/slug/);
    await expect(createProgram(db(), owner, base({ slug: "Bad Slug!" }))).rejects.toThrow(/lowercase/);
    await expect(createProgram(db(), owner, base({ slug: "x-1", minAgeMonths: 30, maxAgeMonths: 12 }))).rejects.toThrow(/maximum age/);
    await expect(createProgram(db(), owner, base({ slug: "x-2", parentPresence: "sometimes" }))).rejects.toThrow(/parent presence/);
    const audit = await db().select().from(s.auditLog).where(eq(s.auditLog.entityId, p.id));
    expect(audit.some((a) => a.action === "program.create")).toBe(true);
  });

  it("updates settings with an audited diff", async () => {
    const p = await createProgram(db(), owner, base());
    await updateProgram(db(), owner, p.id, base({ parentPresence: "required", bookingUnit: "per_family", cancellationDeadlineHours: 48 }));
    const [row] = await db().select().from(s.programs).where(eq(s.programs.id, p.id));
    expect(row.parentPresence).toBe("required");
    expect(row.bookingUnit).toBe("per_family");
    expect(row.cancellationDeadlineHours).toBe(48);
    const [entry] = await db().select().from(s.auditLog).where(and(eq(s.auditLog.entityId, p.id), eq(s.auditLog.action, "program.update")));
    expect(entry.changes).toMatchObject({ parentPresence: { from: "not_required", to: "required" } });
  });

  it("won't publish a bookable program without pricing", async () => {
    const p = await createProgram(db(), owner, base());
    await expect(setProgramStatus(db(), owner, p.id, "published")).rejects.toThrow(/price/);
    await addPrice(db(), owner, p.id, { label: "Morning", amountCents: 9500, unit: "session" });
    await setProgramStatus(db(), owner, p.id, "published");
    const [row] = await db().select().from(s.programs).where(eq(s.programs.id, p.id));
    expect(row.status).toBe("published");
  });

  it("archives instead of deleting once a program has sessions", async () => {
    const p = await createProgram(db(), owner, base());
    await session(p.id);
    await expect(deleteDraftProgram(db(), owner, p.id)).rejects.toThrow(/archived/);
    await setProgramStatus(db(), owner, p.id, "archived");
    const [row] = await db().select().from(s.programs).where(eq(s.programs.id, p.id));
    expect(row.status).toBe("archived");
    expect(row.archivedAt).not.toBeNull();
    const unused = await createProgram(db(), owner, base({ slug: "unused" }));
    await deleteDraftProgram(db(), owner, unused.id);
    expect(await db().select().from(s.programs).where(eq(s.programs.id, unused.id))).toHaveLength(0);
  });

  it("manages cohorts, the price table and program requirements", async () => {
    const p = await createProgram(db(), owner, base());
    const [c1] = await db().insert(s.cohorts).values({ name: "Sprouts" }).returning();
    const [c2] = await db().insert(s.cohorts).values({ name: "Wildflowers" }).returning();
    await setProgramCohorts(db(), owner, p.id, [c1.id, c2.id]);
    await setProgramCohorts(db(), owner, p.id, [c2.id]);
    const links = await db().select().from(s.programCohorts).where(eq(s.programCohorts.programId, p.id));
    expect(links.map((l) => l.cohortId)).toEqual([c2.id]);

    const price = await addPrice(db(), owner, p.id, { label: "Sprouts full day", amountCents: 15000, unit: "session", cohortId: c1.id, dayLength: "full" });
    await expect(addPrice(db(), owner, p.id, { label: "Bad", amountCents: 100, unit: "session", dayLength: "evening" })).rejects.toThrow(/Day length/);
    await updatePrice(db(), owner, price.id, { label: "Sprouts full day", amountCents: 16000, unit: "session", cohortId: c1.id, dayLength: "full", active: false });
    const [pr] = await db().select().from(s.programPrices).where(eq(s.programPrices.id, price.id));
    expect(pr.amountCents).toBe(16000);
    expect(pr.active).toBe(false);

    const f = await family("Req");
    const { template } = await createTemplate(db(), owner, { title: "Waiver", kind: "waiver", perChild: true, requiresSignature: true, frequency: "once", enforcement: "blocks_booking", body: "Placeholder" });
    const req = await addRequirement(db(), owner, { templateId: template.id, scope: "program", programId: p.id });
    const status = async () => (await paperworkStatus(db(), { familyId: f.family.id, childIds: [f.children[0].id], programIds: [p.id] })).get(f.children[0].id)!;
    expect(await status()).toHaveLength(1);
    await deactivateRequirement(db(), owner, req.id);
    expect(await status()).toHaveLength(0);
  });
});

describe("schedule & waitlist screens' operations", () => {
  it("previews a closure, lists affected bookings, and closes sessions without touching bookings", async () => {
    const p = await program({ kind: "weekend" });
    const d = addDaysISO(todayLA(), 10);
    await createSeries(db(), owner, { programId: p.id, weekdays: [0, 1, 2, 3, 4, 5, 6], startTime: "09:00", endTime: "12:00", startsOn: d, endsOn: addDaysISO(d, 2), capacity: 5 });
    const [first] = await db().select().from(s.sessions).where(and(eq(s.sessions.programId, p.id), eq(s.sessions.localDate, d)));
    const f = await family("Closed");
    const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: first.id, childId: f.children[0].id }], source: "admin" });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
    const preview = await previewBlackout(db(), { startsOn: d, endsOn: addDaysISO(d, 1) });
    expect(preview).toHaveLength(2);
    expect(preview.find((x) => x.id === first.id)!.booked).toBe(1);
    await expect(addBlackout(db(), owner, { startsOn: d, endsOn: addDaysISO(d, 1), reason: "Staff training", confirmAffected: false })).rejects.toThrow(/Review and confirm/);
    const r = await addBlackout(db(), owner, { startsOn: d, endsOn: addDaysISO(d, 1), reason: "Staff training", confirmAffected: true });
    expect(r.closed).toBe(2);
    const [closed] = await db().select().from(s.sessions).where(eq(s.sessions.id, first.id));
    expect(closed.status).toBe("closed");
    const items = await db().select().from(s.bookingItems).where(eq(s.bookingItems.bookingId, hold.booking.id));
    expect(items[0].status).toBe("confirmed");
    // Sessions created later on a blackout date start closed.
    const later = await createSeries(db(), owner, { programId: p.id, weekdays: [0, 1, 2, 3, 4, 5, 6], startTime: "13:00", endTime: "15:00", startsOn: d, endsOn: d, capacity: 5 });
    expect(later.closed).toBe(1);
  });

  it("an offer reserves capacity for the window and releases it when it lapses", async () => {
    const p = await program({ kind: "weekend", offerWindowHours: 12 });
    const sess = await session(p.id, { capacity: 1 });
    const a = await family("Holder");
    const hold = await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: sess.id, childId: a.children[0].id }], source: "admin" });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
    const w = await family("Waiting");
    const entry = await joinWaitlist(db(), owner, { familyId: w.family.id, sessionId: sess.id, childIds: [w.children[0].id] });
    await expect(joinWaitlist(db(), owner, { familyId: w.family.id, sessionId: sess.id, childIds: [w.children[0].id] })).rejects.toThrow(/already/);
    await expect(makeOffer(db(), owner, { entryId: entry.id, baseUrl: "http://test" })).rejects.toThrow(/fully booked/);
    // A spot opens.
    await db().update(s.sessions).set({ capacity: 2 }).where(eq(s.sessions.id, sess.id));
    const offer = await makeOffer(db(), owner, { entryId: entry.id, baseUrl: "http://test" });
    expect(offer.holdExpiresAt!.getTime() - Date.now()).toBeGreaterThan(11 * 3600_000);
    expect((await availabilityFor(db(), [sess.id])).get(sess.id)!.remaining).toBe(0);
    const payments = await db().select().from(s.payments);
    expect(payments).toHaveLength(0);
    const msgs = await db().select().from(s.messages).where(eq(s.messages.templateKey, "waitlist_offer"));
    expect(msgs[0].body).toContain("http://test/book/offer/");
    // Lapse.
    await db().update(s.bookings).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.bookings.id, offer.id));
    await db().update(s.waitlistEntries).set({ offerExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.waitlistEntries.id, entry.id));
    expect((await availabilityFor(db(), [sess.id])).get(sess.id)!.remaining).toBe(1);
    const lapsed = await expireOffers(db());
    expect(lapsed.map((l) => l.id)).toEqual([entry.id]);
  });
});
