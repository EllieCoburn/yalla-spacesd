"use server";

import { eq } from "drizzle-orm";
import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { randomToken } from "@/lib/auth/crypto";
import { playPassPlans, playPassSubscriptions } from "@/lib/db/schema";
import { processEvent } from "@/lib/payments/webhooks";
import { newPlanVersion, setProgramEligibility } from "@/lib/playpass/admin";
import { renewalAmount } from "@/lib/playpass/changes";
import { adjustWallet, issueCredit } from "@/lib/playpass/wallet";
import { resolveOffer } from "@/lib/ops/yalla-cancellations";
import { audit } from "@/lib/audit";

/** A documented correction to a family's Play Pass balance (positive adds, negative removes). */
export const adjustWalletAction = adminAction("playpass.manage", async ({ db, actor, str, cents }) => {
  const amount = cents("amount");
  if (amount == null || amount === 0) throw new OpsError("invalid", "Enter an amount, e.g. 25 to add or -25 to remove.");
  await adjustWallet(db, actor, { familyId: str("familyId"), amountCents: amount, note: str("note"), idempotencyKey: str("idempotencyKey") || randomToken(8) });
  return `Balance ${amount > 0 ? "increased" : "reduced"} by $${(Math.abs(amount) / 100).toFixed(2)}.`;
});

/** New price or allocation for future members of a tier. */
export const newPlanAction = adminAction("playpass.manage", async ({ db, actor, str, cents, num }) => {
  const [current] = await db.select().from(playPassPlans).where(eq(playPassPlans.tier, str("tier")));
  if (!current) throw new OpsError("not_found", "Unknown Play Pass.");
  const p = await newPlanVersion(db, actor, {
    tier: str("tier"),
    name: str("name") || current.name,
    priceCents: cents("price") ?? 0,
    allocationCents: cents("allocation") ?? 0,
    minExperiences: num("minExperiences") ?? current.minExperiences,
  });
  return `${p.name} updated for new members. Existing members keep their current price and balance.`;
});

export const eligibilityAction = adminAction("playpass.manage", async ({ db, actor, str, bool }) => {
  await setProgramEligibility(db, actor, str("programId"), { eligible: bool("eligible"), redemption: bool("redemption") });
  return "Saved.";
});

/**
 * Test mode only: run a month's renewal (or a failed one) through the same verified-event path a
 * real Stripe renewal takes. Disabled whenever Stripe is configured.
 */
export const simulateRenewalAction = adminAction("playpass.manage", async ({ db, str }) => {
  if (process.env.STRIPE_SECRET_KEY) throw new OpsError("invalid", "Renewals come from Stripe when it’s connected.");
  const [sub] = await db.select().from(playPassSubscriptions).where(eq(playPassSubscriptions.id, str("subscriptionId")));
  if (!sub || sub.provider !== "test") throw new OpsError("invalid", "Only test-mode passes can be renewed by hand.");
  const amount = await renewalAmount(db, sub);
  if (amount == null) throw new OpsError("invalid", "This Play Pass is paused, so there’s no renewal to run.");
  const plan = { priceCents: amount };
  const invoiceRef = `tin_${randomToken(10)}`;
  const failed = str("outcome") === "fail";
  const r = await processEvent(
    db,
    "test",
    failed
      ? { id: `evt_admin_${randomToken(8)}`, type: "membership.invoice_failed", invoiceRef, subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: plan.priceCents, reason: "Card declined (test)" }
      : { id: `evt_admin_${randomToken(8)}`, type: "membership.invoice_paid", invoiceRef, subscriptionRef: sub.subscriptionRef, localId: sub.id, amountCents: plan.priceCents, reason: "renewal", chargeRef: `tpi_${randomToken(10)}` },
  );
  return failed ? "Recorded a failed renewal (test)." : `Renewed (test): ${r.body}.`;
});

/** A courtesy Yalla credit (e.g. a late cancellation because a child was unwell). Valid 24 months. */
export const courtesyCreditAction = adminAction("billing.manage", async ({ db, actor, str, cents }) => {
  const amount = cents("amount");
  if (!amount || amount <= 0) throw new OpsError("invalid", "Enter the credit amount.");
  if (!str("note")) throw new OpsError("invalid", "Say why the credit is being given. The family sees it.");
  const key = str("idempotencyKey") || randomToken(8);
  const added = await issueCredit(db, { familyId: str("familyId"), amountCents: amount, sourceRef: `courtesy:${key}`, note: str("note"), createdBy: actor.name });
  if (added) await audit(db, actor, { action: "billing.courtesy_credit", entityType: "family", entityId: str("familyId"), summary: `Courtesy credit of $${(amount / 100).toFixed(2)}: ${str("note")}` });
  return `Added $${(amount / 100).toFixed(2)} Yalla credit, valid 24 months.`;
});

/** Record a family's choice after Yalla cancelled (e.g. they called in). */
export const recordOfferChoiceAction = adminAction("billing.refund", async ({ db, actor, str }) => {
  const choice = str("choice");
  if (choice !== "credit" && choice !== "refund") throw new OpsError("invalid", "Choose credit or refund.");
  await resolveOffer(db, actor, { offerId: str("offerId"), choice });
  return choice === "credit" ? "Credit added to the family’s Yalla Wallet." : "Refund sent to the original payment method.";
});
