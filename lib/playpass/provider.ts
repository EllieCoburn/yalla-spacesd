/**
 * Membership billing for Play Passes, alongside the booking payment providers (lib/payments).
 *
 * - "test": the built-in sandbox. Checkout happens on /pay/test/[ref]; results arrive as signed
 *   webhooks through the same verification and idempotency path. No money moves.
 * - "stripe": Stripe Billing. Checkout in subscription mode, renewing on the 1st of each month.
 *   The first month is charged as an exact prorated one-time amount (computed here, day-based in
 *   America/Los_Angeles) and the recurring price starts on the 1st, so Stripe's own second-based
 *   proration is never used. Live keys need PAYMENTS_LIVE_ENABLED=true, as for bookings.
 *
 * Card details never touch this application; Stripe stores the payment method.
 */
import Stripe from "stripe";
import { randomToken } from "@/lib/auth/crypto";
import { paymentsStatus } from "@/lib/payments/provider";

export type PlanForBilling = { id: string; tier: string; name: string; priceCents: number; stripePriceTest: string | null; stripePriceLive: string | null };

export interface MembershipBilling {
  name: "test" | "stripe";
  live: boolean;
  /** The provider's recurring price for a plan, created on first use. Returns the price id (or null in test). */
  ensurePrice(plan: PlanForBilling): Promise<{ priceRef: string | null; save?: { stripePriceTest?: string; stripePriceLive?: string } }>;
  createCheckout(input: {
    subscriptionId: string;
    familyId: string;
    plan: PlanForBilling;
    priceRef: string | null;
    /** Prorated first charge; null when the membership starts on the 1st (full price, renews monthly from today). */
    firstChargeCents: number | null;
    /** Unix seconds of the next 1st of the month (LA midnight), when proration applies. */
    anchor: number | null;
    customerEmail?: string;
    customerRef?: string | null;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<{ checkoutRef: string; url: string }>;
  /** Close a checkout that was started but not finished, so it can't complete later. */
  expireCheckout?(checkoutRef: string): Promise<void>;
  setCancelAtPeriodEnd(subscriptionRef: string, cancel: boolean): Promise<void>;
  /** Switch the plan from the next renewal (no charge or credit now). */
  changePrice(subscriptionRef: string, priceRef: string | null): Promise<void>;
  /** End the membership at a moment (Unix seconds), or clear a scheduled end with null. No proration. */
  scheduleEnd(subscriptionRef: string, endAt: number | null): Promise<void>;
  /** Bill the next renewal at a one-off prorated amount (the final month). */
  setFinalPrice(subscriptionRef: string, plan: PlanForBilling, amountCents: number): Promise<void>;
  /** Stop billing until `resumesAt` (Unix seconds); renewals in between are skipped. */
  pause(subscriptionRef: string, resumesAt: number): Promise<void>;
  resume(subscriptionRef: string): Promise<void>;
  /** Charge the saved card now, on the membership (an upgrade's difference, or the rest of the month after a pause). */
  chargeNow(input: { subscriptionRef: string; customerRef: string | null; localId: string; amountCents: number; description: string; reason: "upgrade" | "resume"; idempotencyKey: string }): Promise<{ invoiceRef: string }>;
  /** Stripe's hosted page for the payment method and billing history; null in test mode. */
  portalUrl(customerRef: string, returnUrl: string): Promise<string | null>;
  /** The card payment reference behind a paid invoice (used to match later refunds and disputes). */
  paymentRefForInvoice(invoiceRef: string): Promise<string | null>;
}

export const testMembershipBilling: MembershipBilling = {
  name: "test",
  live: false,
  async ensurePrice() {
    return { priceRef: null };
  },
  async createCheckout() {
    const ref = `tsub_${randomToken(12)}`;
    return { checkoutRef: ref, url: `/pay/test/${ref}` };
  },
  async setCancelAtPeriodEnd() {},
  async changePrice() {},
  async scheduleEnd() {},
  async setFinalPrice() {},
  async pause() {},
  async resume() {},
  async chargeNow(input) {
    return { invoiceRef: `tin_${input.reason}_${input.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}` };
  },
  async portalUrl() {
    return null;
  },
  async paymentRefForInvoice() {
    return null;
  },
};

let client: Stripe | null = null;
const stripe = () => (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!));
const isLive = () => (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");

export const stripeMembershipBilling: MembershipBilling = {
  name: "stripe",
  get live() {
    return isLive();
  },
  async ensurePrice(plan) {
    const existing = isLive() ? plan.stripePriceLive : plan.stripePriceTest;
    if (existing) return { priceRef: existing };
    // One product per tier; a new price for each plan version (prices are never edited in place).
    const products = await stripe().products.search({ query: `metadata['yalla_play_pass_tier']:'${plan.tier}'` });
    const product =
      products.data[0] ??
      (await stripe().products.create({ name: `Yalla Play Pass · ${plan.name}`, metadata: { yalla_play_pass_tier: plan.tier } }, { idempotencyKey: `playpass-product:${plan.tier}` }));
    const price = await stripe().prices.create(
      { product: product.id, currency: "usd", unit_amount: plan.priceCents, recurring: { interval: "month" }, metadata: { yalla_play_pass_plan: plan.id } },
      { idempotencyKey: `playpass-price:${plan.id}:${isLive() ? "live" : "test"}` },
    );
    return { priceRef: price.id, save: isLive() ? { stripePriceLive: price.id } : { stripePriceTest: price.id } };
  },
  async createCheckout(input) {
    const metadata = { playPassSubscriptionId: input.subscriptionId, familyId: input.familyId, tier: input.plan.tier };
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: input.priceRef!, quantity: 1 }];
    if (input.anchor && input.firstChargeCents != null) {
      // The partial first month, charged once on the first invoice.
      lineItems.push({ quantity: 1, price_data: { currency: "usd", unit_amount: input.firstChargeCents, product_data: { name: `${input.plan.name} Play Pass · rest of this month` } } });
    }
    const session = await stripe().checkout.sessions.create(
      {
        mode: "subscription",
        ...(input.customerRef ? { customer: input.customerRef } : { customer_email: input.customerEmail }),
        line_items: lineItems,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata,
        subscription_data: {
          metadata,
          ...(input.anchor ? { billing_cycle_anchor: input.anchor, proration_behavior: "none" as const } : {}),
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { checkoutRef: session.id, url: session.url! };
  },
  async expireCheckout(ref) {
    await stripe()
      .checkout.sessions.expire(ref)
      .catch(() => undefined); // already completed or expired
  },
  async setCancelAtPeriodEnd(ref, cancel) {
    await stripe().subscriptions.update(ref, { cancel_at_period_end: cancel });
  },
  async changePrice(ref, priceRef) {
    const sub = await stripe().subscriptions.retrieve(ref);
    const item = sub.items.data[0];
    await stripe().subscriptions.update(ref, { items: [{ id: item.id, price: priceRef! }], proration_behavior: "none" });
  },
  async scheduleEnd(ref, endAt) {
    await stripe().subscriptions.update(ref, endAt ? { cancel_at: endAt, proration_behavior: "none" } : { cancel_at: "" as unknown as number, proration_behavior: "none" });
  },
  async setFinalPrice(ref, plan, amountCents) {
    const sub = await stripe().subscriptions.retrieve(ref);
    const item = sub.items.data[0];
    const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
    await stripe().subscriptions.update(ref, {
      items: [{ id: item.id, price_data: { currency: "usd", product, unit_amount: amountCents, recurring: { interval: "month" } } }],
      proration_behavior: "none",
      metadata: { ...sub.metadata, yallaFinalMonth: plan.id },
    });
  },
  async pause(ref, resumesAt) {
    await stripe().subscriptions.update(ref, { pause_collection: { behavior: "void", resumes_at: resumesAt } });
  },
  async resume(ref) {
    await stripe().subscriptions.update(ref, { pause_collection: "" as unknown as Stripe.SubscriptionUpdateParams.PauseCollection });
  },
  async chargeNow(input) {
    if (!input.customerRef) throw new Error("No saved customer for this Play Pass.");
    const metadata = { playPassSubscriptionId: input.localId, yallaReason: input.reason };
    await stripe().invoiceItems.create({ customer: input.customerRef, subscription: input.subscriptionRef, amount: input.amountCents, currency: "usd", description: input.description, metadata }, { idempotencyKey: `${input.idempotencyKey}:item` });
    const inv = await stripe().invoices.create(
      { customer: input.customerRef, subscription: input.subscriptionRef, collection_method: "charge_automatically", auto_advance: true, pending_invoice_items_behavior: "include", metadata },
      { idempotencyKey: `${input.idempotencyKey}:invoice` },
    );
    await stripe()
      .invoices.pay(inv.id!)
      .catch(() => undefined); // a failure arrives as invoice.payment_failed
    return { invoiceRef: inv.id! };
  },
  async portalUrl(customerRef, returnUrl) {
    const s = await stripe().billingPortal.sessions.create({ customer: customerRef, return_url: returnUrl });
    return s.url;
  },
  async paymentRefForInvoice(invoiceRef) {
    const inv = await stripe().invoices.retrieve(invoiceRef, { expand: ["payments"] });
    const p = inv.payments?.data.find((x) => x.status === "paid") ?? inv.payments?.data[0];
    const pi = p?.payment.payment_intent;
    return typeof pi === "string" ? pi : (pi?.id ?? null);
  },
};

/** The membership billing provider for new signups (follows the booking payment configuration). */
export function activeMembershipBilling(): MembershipBilling {
  return paymentsStatus().provider === "stripe" ? stripeMembershipBilling : testMembershipBilling;
}

export function membershipBillingFor(name: string): MembershipBilling {
  if (name === "stripe") return stripeMembershipBilling;
  return testMembershipBilling;
}
