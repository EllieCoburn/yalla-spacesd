/**
 * Play Pass membership changes (Policies & Terms → Memberships): 30 days' notice to cancel with a
 * prorated final month, upgrades at once, downgrades after notice, and pauses of up to 60 days.
 * The clock is set to fixed dates so the arithmetic can be checked exactly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { GuardianContext } from "@/lib/family-auth";
import { processEvent } from "@/lib/payments/webhooks";
import { applyPlayPassSchedules, changeTier, renewalAmount, requestCancel, requestPause } from "@/lib/playpass/changes";
import { startSignup } from "@/lib/playpass/membership";
import { walletSummary } from "@/lib/playpass/wallet";
import { db, family, reset } from "./helpers";

beforeEach(async () => {
  await reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-13");
});
afterEach(() => vi.useRealTimers());

/** Noon in San Diego on a date. */
const at = (date: string) => vi.setSystemTime(new Date(`${date}T20:00:00Z`));
let n = 0;
const evt = () => `evt_ppc_${++n}_${Math.random().toString(36).slice(2, 6)}`;

async function plans() {
  await db()
    .insert(s.playPassPlans)
    .values([
      { tier: "play", name: "Play", priceCents: 12000, allocationCents: 13500, minExperiences: 2, sortOrder: 1 },
      { tier: "gather", name: "Gather", priceCents: 18000, allocationCents: 20000, minExperiences: 3, sortOrder: 2 },
      { tier: "belong", name: "Belong", priceCents: 24000, allocationCents: 27000, minExperiences: 4, sortOrder: 3 },
    ]);
}

const ctx = (f: Awaited<ReturnType<typeof family>>): GuardianContext => ({
  sessionId: "t",
  guardianId: f.guardian.id,
  familyId: f.family.id,
  familyName: f.family.name,
  firstName: f.guardian.firstName,
  lastName: f.guardian.lastName,
  email: f.guardian.email,
  canBook: true,
  canViewBilling: true,
  canViewSensitive: true,
});

async function member(tier = "gather") {
  await plans();
  const f = await family("Member");
  const { subscriptionId } = await startSignup(db(), ctx(f), { tier, acceptTerms: true, baseUrl: "http://test" });
  const [sub] = await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, subscriptionId));
  await processEvent(db(), "test", { id: evt(), type: "membership.checkout_completed", checkoutRef: sub.checkoutRef!, customerRef: "tcus", subscriptionRef: `tsub_${sub.id}`, localId: sub.id });
  await processEvent(db(), "test", { id: evt(), type: "membership.invoice_paid", invoiceRef: `tin_init_${sub.id}`, subscriptionRef: `tsub_${sub.id}`, localId: sub.id, amountCents: sub.initialChargeCents, reason: "initial", chargeRef: "tpi_init" });
  return { f, g: ctx(f), id: sub.id };
}

const subOf = async (id: string) => (await db().select().from(s.playPassSubscriptions).where(eq(s.playPassSubscriptions.id, id)))[0];
const planTier = async (planId: string) => (await db().select().from(s.playPassPlans).where(eq(s.playPassPlans.id, planId)))[0].tier;

/** A renewal on the 1st, billed what the schedule says, through a verified test event. */
async function renew(id: string, on: string) {
  at(on);
  await applyPlayPassSchedules(db());
  const sub = await subOf(id);
  const amount = await renewalAmount(db(), sub);
  if (amount == null) return null;
  await processEvent(db(), "test", { id: evt(), type: "membership.invoice_paid", invoiceRef: `tin_${on}_${id}`, subscriptionRef: sub.subscriptionRef, localId: id, amountCents: amount, reason: "renewal", chargeRef: `tpi_${on}` });
  return amount;
}

const added = async (familyId: string) => (await db().select().from(s.walletAllocations).where(eq(s.walletAllocations.familyId, familyId))).map((a) => a.amountCents);

describe("Canceling with 30 days’ notice", () => {
  it("bills through the notice period, prorating the final month by day, then ends", async () => {
    const { f, g, id } = await member();
    const r = await requestCancel(db(), g);
    expect(r.endOn).toBe("2026-12-13");
    // $180 ÷ 31 days × 13 days, and the same share of the $200 balance.
    expect(r.final).toMatchObject({ chargeCents: 7548, allocationCents: 8387, days: 13 });
    expect(await renew(id, "2026-12-01")).toBe(7548);
    expect((await added(f.family.id)).slice(-1)).toEqual([8387]);
    at("2026-12-13");
    await applyPlayPassSchedules(db());
    expect((await subOf(id)).status).toBe("active");
    at("2026-12-14");
    await applyPlayPassSchedules(db());
    expect((await subOf(id)).status).toBe("canceled");
    expect((await walletSummary(db(), f.family.id)).passCents).toBeGreaterThan(0); // balance kept
  });
});

describe("Upgrades and downgrades", () => {
  it("upgrades right away, charging and adding this month’s difference", async () => {
    const { f, g, id } = await member("gather");
    const r = await changeTier(db(), g, "belong");
    // Nov 13–30 is 18 of 30 days: $60 × 18/30 = $36 charged, $70 × 18/30 = $42 added.
    expect(r).toMatchObject({ kind: "upgrade", chargeCents: 3600, allocationCents: 4200 });
    expect(await planTier((await subOf(id)).planId)).toBe("belong");
    expect((await added(f.family.id)).slice(-1)).toEqual([4200]);
    expect(await renew(id, "2026-12-01")).toBe(24000);
  });

  it("downgrades after 30 days’ notice, at the first renewal after it ends", async () => {
    const { g, id } = await member("gather");
    const r = await changeTier(db(), g, "play");
    expect(r).toMatchObject({ kind: "downgrade", startsOn: "2027-01-01" });
    expect(await renew(id, "2026-12-01")).toBe(18000);
    expect(await planTier((await subOf(id)).planId)).toBe("gather");
    expect(await renew(id, "2027-01-01")).toBe(12000);
    expect(await planTier((await subOf(id)).planId)).toBe("play");
  });
});

describe("Pauses", () => {
  it("need 30 days’ notice and last up to 60 days", async () => {
    const { g } = await member();
    await expect(requestPause(db(), g, { startOn: "2026-12-01", days: 30 })).rejects.toThrow(/30 days’ notice/);
    await expect(requestPause(db(), g, { startOn: "2026-12-13", days: 61 })).rejects.toThrow(/up to 60/);
  });

  it("skip renewals, then reactivate on the 61st day charging the rest of that month", async () => {
    const { f, g, id } = await member();
    const r = await requestPause(db(), g, { startOn: "2026-12-13", days: 60 });
    expect(r.resumeOn).toBe("2027-02-11");
    expect(await renew(id, "2026-12-01")).toBe(18000); // before the pause
    at("2026-12-13");
    await applyPlayPassSchedules(db());
    expect((await subOf(id)).pauseAppliedAt).not.toBeNull();
    expect(await renew(id, "2027-01-01")).toBeNull(); // paused
    expect(await renew(id, "2027-02-01")).toBeNull();
    const before = await added(f.family.id);
    at("2027-02-11");
    await applyPlayPassSchedules(db());
    // Feb 11–28 is 18 of 28 days.
    const [charge] = await db().select().from(s.playPassCharges).where(eq(s.playPassCharges.reason, "resume"));
    expect(charge).toMatchObject({ amountCents: 11571, status: "paid", allocationCents: 12857 });
    expect((await added(f.family.id)).length).toBe(before.length + 1);
    expect((await subOf(id)).pauseStartsOn).toBeNull();
    expect(await renew(id, "2027-03-01")).toBe(18000);
  });

  it("end without reactivating when notice is given 30+ days before the reactivation date", async () => {
    const { g, id } = await member();
    await requestPause(db(), g, { startOn: "2026-12-13", days: 60 });
    at("2026-12-13");
    await applyPlayPassSchedules(db());
    at("2026-12-20");
    const r = await requestCancel(db(), g);
    expect(r).toMatchObject({ endOn: "2027-02-10", final: null });
    at("2027-02-11");
    await applyPlayPassSchedules(db());
    expect((await subOf(id)).status).toBe("canceled");
    expect(await db().select().from(s.playPassCharges).where(eq(s.playPassCharges.reason, "resume"))).toHaveLength(0);
  });

  it("reactivate and bill until the notice ends when it’s given later", async () => {
    const { g, id } = await member();
    await requestPause(db(), g, { startOn: "2026-12-13", days: 60 });
    at("2026-12-13");
    await applyPlayPassSchedules(db());
    at("2027-01-20");
    const r = await requestCancel(db(), g);
    expect(r.endOn).toBe("2027-02-19");
    at("2027-02-11");
    await applyPlayPassSchedules(db());
    const [charge] = await db().select().from(s.playPassCharges).where(eq(s.playPassCharges.reason, "resume"));
    expect(charge.amountCents).toBe(5786); // Feb 11–19: 9 of 28 days
    at("2027-02-20");
    await applyPlayPassSchedules(db());
    expect((await subOf(id)).status).toBe("canceled");
  });
});
