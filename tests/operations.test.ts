import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { OpsError } from "@/lib/audit";
import { assertCan, createStaff, login, resolveSession } from "@/lib/auth/staff";
import { DEFAULT_ROLES } from "@/lib/auth/permissions";
import { availabilityFor } from "@/lib/ops/capacity";
import { createHold, confirmAdminBooking } from "@/lib/ops/bookings";
import { createMembership, addException } from "@/lib/ops/memberships";
import { setPolicy } from "@/lib/ops/settings";
import { addRequirement, createTemplate, paperworkStatus, publishVersion, submitForm } from "@/lib/ops/forms";
import { createSeries, applySessionChange } from "@/lib/ops/schedule";
import { invoiceTotals, recordOfflinePayment, refundPayment } from "@/lib/ops/billing";
import { roster } from "@/lib/ops/attendance";
import { addDaysISO, todayLA, weekdayOf } from "@/lib/time";
import { db, family, owner, program, reset } from "./helpers";

beforeEach(reset);

describe("Club Yalla memberships and drop-in inventory", () => {
  async function setup() {
    const [cohort] = await db().insert(s.cohorts).values({ name: "Saplings", maxSize: 2 }).returning();
    const [pool] = await db().insert(s.capacityPools).values({ name: "Saplings room", capacity: 2 }).returning();
    const club = await program({ kind: "membership", name: "Club Yalla", bookingMode: "enroll" });
    const flex = await program({ kind: "drop_in", name: "Yalla Flex" });
    // Next Monday onward, both programs share the Saplings room.
    let d = addDaysISO(todayLA(), 1);
    while (weekdayOf(d) !== 1) d = addDaysISO(d, 1);
    const end = addDaysISO(d, 13);
    const common = { weekdays: [1], startTime: "08:30", endTime: "16:30", startsOn: d, endsOn: end, capacity: 2, cohortId: cohort.id, capacityPoolId: pool.id };
    await createSeries(db(), owner, { ...common, programId: club.id });
    await createSeries(db(), owner, { ...common, programId: flex.id });
    const flexSessions = await db().select().from(s.sessions).where(eq(s.sessions.programId, flex.id));
    return { cohort, club, flex, monday: d, flexSessions };
  }

  it("reserves members' spots so they can't be sold as drop-in care", async () => {
    const { cohort, club, flex, monday, flexSessions } = await setup();
    const m1 = await family("Member1", [{ first: "Mia", birth: "2023-02-01" }]);
    const m2 = await family("Member2", [{ first: "Noa", birth: "2023-03-01" }]);
    const base = { programId: club.id, cohortId: cohort.id, weekdays: [1], dayLength: "full" as const, earlyBird: false, startsOn: monday, priceCents: 72000, billingFrequency: "monthly" as const };
    await createMembership(db(), owner, { ...base, familyId: m1.family.id, childId: m1.children[0].id });
    const firstFlex = flexSessions.sort((a, b) => a.localDate.localeCompare(b.localDate))[0];
    expect((await availabilityFor(db(), [firstFlex.id])).get(firstFlex.id)!.remaining).toBe(1);
    await createMembership(db(), owner, { ...base, familyId: m2.family.id, childId: m2.children[0].id });
    expect((await availabilityFor(db(), [firstFlex.id])).get(firstFlex.id)!.remaining).toBe(0);
    const dropIn = await family("Drop", [{ first: "Oli", birth: "2023-01-01" }]);
    await expect(createHold(db(), owner, { familyId: dropIn.family.id, items: [{ sessionId: firstFlex.id, childId: dropIn.children[0].id }], source: "public" })).rejects.toThrow(/fully booked/);

    // An absence doesn't release the spot unless the policy allows it.
    const [mem] = await db().select().from(s.memberships).where(eq(s.memberships.childId, m1.children[0].id));
    await addException(db(), owner, { membershipId: mem.id, date: monday, kind: "absence" });
    expect((await availabilityFor(db(), [firstFlex.id])).get(firstFlex.id)!.remaining).toBe(0);
    const [stillMember] = await db().select().from(s.memberships).where(eq(s.memberships.id, mem.id));
    expect(stillMember.status).not.toBe("ended");

    await setPolicy(db(), owner, "membership.absenceReleasesSpot", true);
    await addException(db(), owner, { membershipId: mem.id, date: monday, kind: "absence" });
    expect((await availabilityFor(db(), [firstFlex.id])).get(firstFlex.id)!.remaining).toBe(1);
    void flex;
  });

  it("won't start a membership in a full cohort", async () => {
    const { cohort, club, monday } = await setup();
    const fams = [await family("A"), await family("B"), await family("C")];
    const base = { programId: club.id, cohortId: cohort.id, weekdays: [1], dayLength: "full" as const, earlyBird: false, startsOn: monday, priceCents: 72000, billingFrequency: "monthly" as const };
    await createMembership(db(), owner, { ...base, familyId: fams[0].family.id, childId: fams[0].children[0].id });
    await createMembership(db(), owner, { ...base, familyId: fams[1].family.id, childId: fams[1].children[0].id });
    await expect(createMembership(db(), owner, { ...base, familyId: fams[2].family.id, childId: fams[2].children[0].id })).rejects.toThrow(/full/);
  });
});

describe("waivers", () => {
  it("requires a fresh signature after a new version, without altering the signed copy", async () => {
    const p = await program({ kind: "weekend" });
    const f = await family("Sign");
    const { template } = await createTemplate(db(), owner, {
      title: "Weekend care waiver",
      kind: "waiver",
      perChild: true,
      requiresSignature: true,
      frequency: "once",
      enforcement: "blocks_booking",
      body: "Version one text (placeholder — approved language required).",
    });
    await addRequirement(db(), owner, { templateId: template.id, scope: "program", programId: p.id });
    const status = async () => (await paperworkStatus(db(), { familyId: f.family.id, childIds: [f.children[0].id], programIds: [p.id] })).get(f.children[0].id)![0].state;
    expect(await status()).toBe("missing");
    const signed = await submitForm(db(), owner, { templateId: template.id, familyId: f.family.id, childId: f.children[0].id, signerGuardianId: f.guardian.id, signatureText: "Sign Fam", consent: true });
    expect(await status()).toBe("complete");
    await publishVersion(db(), owner, template.id, "Version two text with a new clause.", true);
    expect(await status()).toBe("needs_resign");
    const [old] = await db().select().from(s.formSubmissions).where(eq(s.formSubmissions.id, signed.id));
    expect(old.versionBody).toMatch(/Version one/);
    expect(old.signerName).toBe(`${f.guardian.firstName} ${f.guardian.lastName}`);
    await submitForm(db(), owner, { templateId: template.id, familyId: f.family.id, childId: f.children[0].id, signerGuardianId: f.guardian.id, signatureText: "Sign Fam", consent: true });
    expect(await status()).toBe("complete");
    // A clarifying edit that doesn't need re-signing keeps existing signatures valid.
    await publishVersion(db(), owner, template.id, "Version three — typo fix.", false);
    expect(await status()).toBe("complete");
  });

  it("blocks public booking until a blocking waiver is signed", async () => {
    const p = await program({ kind: "weekend" });
    const [sess] = await db()
      .insert(s.sessions)
      .values({ programId: p.id, localDate: addDaysISO(todayLA(), 5), startsAt: new Date(Date.now() + 5 * 864e5), endsAt: new Date(Date.now() + 5 * 864e5 + 3 * 36e5), capacity: 5 })
      .returning();
    const f = await family("Block");
    const { template } = await createTemplate(db(), owner, { title: "Waiver", kind: "waiver", perChild: true, requiresSignature: true, frequency: "once", enforcement: "blocks_booking", body: "Placeholder" });
    await addRequirement(db(), owner, { templateId: template.id, scope: "program", programId: p.id });
    await expect(createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: sess.id, childId: f.children[0].id }], source: "public" })).rejects.toThrow(/Required before booking/);
  });
});

describe("permissions", () => {
  it("enforces role permissions on the server", async () => {
    const educator = await createStaff(db(), owner, { email: "edu@example.com", name: "Edu Cator", roleKey: "educator", password: "a-long-test-password-1" });
    const res = await login(db(), "edu@example.com", "a-long-test-password-1");
    expect(res.status).toBe("ok");
    const ctx = await resolveSession(db(), res.status === "ok" ? res.token : "");
    expect(ctx?.roleKey).toBe("educator");
    expect(() => assertCan(ctx, "billing.view")).toThrow(OpsError);
    expect(() => assertCan(ctx, "children.care")).not.toThrow();
    void educator;
  });

  it("hides care details from staff without children.care", async () => {
    const p = await program();
    const [sess] = await db()
      .insert(s.sessions)
      .values({ programId: p.id, localDate: addDaysISO(todayLA(), 2), startsAt: new Date(Date.now() + 2 * 864e5), endsAt: new Date(Date.now() + 2 * 864e5 + 36e5), capacity: 5 })
      .returning();
    const f = await family("Care", [{ first: "Ada", birth: "2023-01-01" }]);
    await db().update(s.children).set({ allergies: "Peanuts" }).where(eq(s.children.id, f.children[0].id));
    const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: sess.id, childId: f.children[0].id }], source: "admin" });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
    const billingRole = DEFAULT_ROLES.find((r) => r.key === "billing")!.permissions;
    const educatorRole = DEFAULT_ROLES.find((r) => r.key === "educator")!.permissions;
    const asBilling = await roster(db(), sess.id, billingRole);
    const asEducator = await roster(db(), sess.id, educatorRole);
    expect(asBilling.children[0].care).toBeUndefined();
    expect(asBilling.children[0].pickups).toBeUndefined();
    expect(asEducator.children[0].care?.allergies).toBe("Peanuts");
  });

  it("locks an account after repeated failed sign-ins", async () => {
    await createStaff(db(), owner, { email: "lock@example.com", name: "Lock", roleKey: "operations", password: "correct-horse-battery" });
    for (let i = 0; i < 5; i++) await login(db(), "lock@example.com", "wrong-password");
    expect((await login(db(), "lock@example.com", "correct-horse-battery")).status).toBe("locked");
  });
});

describe("daylight saving time", () => {
  it("keeps sessions at the same local time across the November change", async () => {
    const p = await program({ kind: "weekend" });
    // DST ends Sunday 1 November 2026 in Los Angeles.
    const { series } = await createSeries(db(), owner, { programId: p.id, weekdays: [6], startTime: "09:00", endTime: "12:30", startsOn: "2026-10-24", endsOn: "2026-11-14", capacity: 10 });
    const rows = (await db().select().from(s.sessions).where(eq(s.sessions.seriesId, series.id))).sort((a, b) => a.localDate.localeCompare(b.localDate));
    expect(rows.map((r) => r.localDate)).toEqual(["2026-10-24", "2026-10-31", "2026-11-07", "2026-11-14"]);
    expect(rows[1].startsAt.toISOString()).toBe("2026-10-31T16:00:00.000Z"); // PDT, UTC−7
    expect(rows[2].startsAt.toISOString()).toBe("2026-11-07T17:00:00.000Z"); // PST, UTC−8

    // Editing "this and following" from a date after the change keeps local wall time.
    await applySessionChange(db(), owner, { sessionId: rows[1].id, scope: "following", changes: { startTime: "09:30" }, notifyFamilies: false, confirmAffected: true });
    const after = (await db().select().from(s.sessions).where(eq(s.sessions.programId, p.id))).sort((a, b) => a.localDate.localeCompare(b.localDate));
    expect(after[0].startsAt.toISOString()).toBe("2026-10-24T16:00:00.000Z");
    expect(after[1].startsAt.toISOString()).toBe("2026-10-31T16:30:00.000Z");
    expect(after[2].startsAt.toISOString()).toBe("2026-11-07T17:30:00.000Z");
  });
});

describe("refunds", () => {
  it("records a refund that fails partway and retries without double-refunding", async () => {
    const f = await family("Refund");
    const { createInvoice } = await import("@/lib/ops/billing");
    const inv = await createInvoice(db(), owner, { familyId: f.family.id, description: "Test", lines: [{ kind: "charge", description: "Drop-in", unitCents: 15000 }] });
    // A card payment through the test provider.
    const [pay] = await db()
      .insert(s.payments)
      .values({ invoiceId: inv.id, familyId: f.family.id, amountCents: 15000, method: "card", status: "succeeded", provider: "test", providerRef: "pi_test", idempotencyKey: "pay-1", succeededAt: new Date() })
      .returning();
    await expect(refundPayment(db(), owner, { paymentId: pay.id, amountCents: 5000, reason: "Goodwill [simulate-failure]", reduceAmountOwed: true, idempotencyKey: "r-1" })).rejects.toThrow(/didn’t go through/);
    let totals = (await invoiceTotals(db(), [inv.id])).get(inv.id)!;
    expect(totals.refunded).toBe(0);
    expect(totals.adjustments).toBe(0);
    const [failed] = await db().select().from(s.refunds).where(eq(s.refunds.idempotencyKey, "r-1"));
    expect(failed.status).toBe("failed");

    await refundPayment(db(), owner, { paymentId: pay.id, amountCents: 5000, reason: "Goodwill", reduceAmountOwed: true, idempotencyKey: "r-2" });
    await refundPayment(db(), owner, { paymentId: pay.id, amountCents: 5000, reason: "Goodwill", reduceAmountOwed: true, idempotencyKey: "r-2" }); // double submit
    totals = (await invoiceTotals(db(), [inv.id])).get(inv.id)!;
    expect(totals.refunded).toBe(5000);
    expect(totals.total).toBe(10000);
    expect(totals.balance).toBe(0);
    await expect(refundPayment(db(), owner, { paymentId: pay.id, amountCents: 20000, reason: "Too much", reduceAmountOwed: false, idempotencyKey: "r-3" })).rejects.toThrow(/up to/);
  });

  it("dedupes offline payments submitted twice", async () => {
    const f = await family("Offline");
    const { createInvoice } = await import("@/lib/ops/billing");
    const inv = await createInvoice(db(), owner, { familyId: f.family.id, description: "Test", lines: [{ kind: "charge", description: "Camp", unitCents: 30000 }] });
    await recordOfflinePayment(db(), owner, { invoiceId: inv.id, amountCents: 30000, method: "offline_check", note: "Check #12", idempotencyKey: "off-1" });
    await recordOfflinePayment(db(), owner, { invoiceId: inv.id, amountCents: 30000, method: "offline_check", note: "Check #12", idempotencyKey: "off-1" });
    const totals = (await invoiceTotals(db(), [inv.id])).get(inv.id)!;
    expect(totals.paid).toBe(30000);
    const [row] = await db().select().from(s.invoices).where(eq(s.invoices.id, inv.id));
    expect(row.status).toBe("paid");
  });
});
