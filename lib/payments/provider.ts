/**
 * Payment providers.
 *
 * - "test" (default): a built-in sandbox. Checkout happens on /pay/test/[ref]; results arrive as
 *   HMAC-signed webhooks through the same verification and idempotency path as real payments.
 *   No money moves.
 * - "stripe": Stripe Checkout (hosted) + signed webhooks. Enabled when STRIPE_SECRET_KEY and
 *   STRIPE_WEBHOOK_SECRET are set. Live keys (sk_live_…) additionally require
 *   PAYMENTS_LIVE_ENABLED=true so real charges can't be switched on by accident.
 *
 * Card numbers never touch this application.
 */
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { randomToken, safeEqual } from "@/lib/auth/crypto";

export type NormalizedEvent =
  | { id: string; type: "payment.succeeded"; checkoutRef: string; providerRef: string; amountCents: number }
  | { id: string; type: "payment.failed"; checkoutRef: string; providerRef?: string; reason: string }
  | { id: string; type: "checkout.expired"; checkoutRef: string }
  | { id: string; type: "refund.updated"; refundRef: string; status: "succeeded" | "failed"; reason?: string }
  | { id: string; type: "dispute.updated"; paymentRef: string; status: string }
  | { id: string; type: "ignored"; rawType: string };

export interface PaymentProvider {
  name: "test" | "stripe";
  live: boolean;
  createCheckout(input: {
    paymentId: string;
    amountCents: number;
    description: string;
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
    idempotencyKey: string;
  }): Promise<{ checkoutRef: string; url: string }>;
  refund(input: { providerRef: string; amountCents: number; idempotencyKey: string; reason: string }): Promise<{ status: "succeeded" | "pending" | "failed"; providerRef?: string; failureReason?: string }>;
  parseWebhook(rawBody: string, headers: Headers): NormalizedEvent;
}

/* ── Test provider ── */

function testSecret() {
  return process.env.TEST_PAYMENTS_WEBHOOK_SECRET || `test-webhook:${process.env.AUTH_SECRET ?? "dev"}`;
}

export function signTestPayload(rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", testSecret()).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

export const testProvider: PaymentProvider = {
  name: "test",
  live: false,
  async createCheckout(input) {
    const checkoutRef = `tcs_${randomToken(12)}`;
    return { checkoutRef, url: `/pay/test/${checkoutRef}` };
  },
  async refund(input) {
    // Lets the "refund fails partway" path be exercised deliberately.
    if (input.reason.includes("[simulate-failure]")) return { status: "failed", failureReason: "Simulated provider failure" };
    return { status: "succeeded", providerRef: `tre_${randomToken(10)}` };
  },
  parseWebhook(rawBody, headers) {
    const header = headers.get("x-yalla-test-signature") ?? "";
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
    const ts = Number(parts.t);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) throw new Error("Stale or missing signature timestamp");
    const expected = createHmac("sha256", testSecret()).update(`${ts}.${rawBody}`).digest("hex");
    if (!parts.v1 || !safeEqual(parts.v1, expected)) throw new Error("Invalid signature");
    return JSON.parse(rawBody) as NormalizedEvent;
  },
};

/* ── Stripe provider ── */

let stripeClient: Stripe | null = null;
function stripe() {
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return stripeClient;
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  get live() {
    return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
  },
  async createCheckout(input) {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: input.customerEmail,
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.amountCents, product_data: { name: input.description } } }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        // Stripe requires at least 30 minutes.
        expires_at: Math.max(Math.floor(input.expiresAt.getTime() / 1000), Math.floor(Date.now() / 1000) + 31 * 60),
        metadata: { paymentId: input.paymentId },
        payment_intent_data: { metadata: { paymentId: input.paymentId } },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { checkoutRef: session.id, url: session.url! };
  },
  async refund(input) {
    try {
      const r = await stripe().refunds.create({ payment_intent: input.providerRef, amount: input.amountCents, metadata: { reason: input.reason.slice(0, 400) } }, { idempotencyKey: input.idempotencyKey });
      return { status: r.status === "succeeded" ? "succeeded" : r.status === "failed" ? "failed" : "pending", providerRef: r.id, failureReason: r.failure_reason ?? undefined };
    } catch (e) {
      return { status: "failed", failureReason: (e as Error).message };
    }
  },
  parseWebhook(rawBody, headers) {
    const event = stripe().webhooks.constructEvent(rawBody, headers.get("stripe-signature") ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status !== "paid") return { id: event.id, type: "ignored", rawType: `${event.type}:${s.payment_status}` };
        return { id: event.id, type: "payment.succeeded", checkoutRef: s.id, providerRef: String(s.payment_intent), amountCents: s.amount_total ?? 0 };
      }
      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        return { id: event.id, type: "payment.failed", checkoutRef: s.id, reason: "Payment failed" };
      }
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        return { id: event.id, type: "checkout.expired", checkoutRef: s.id };
      }
      case "refund.updated":
      case "refund.failed": {
        const r = event.data.object as Stripe.Refund;
        if (r.status !== "succeeded" && r.status !== "failed") return { id: event.id, type: "ignored", rawType: event.type };
        return { id: event.id, type: "refund.updated", refundRef: r.id, status: r.status, reason: r.failure_reason ?? undefined };
      }
      case "charge.dispute.created":
      case "charge.dispute.closed": {
        const d = event.data.object as Stripe.Dispute;
        return { id: event.id, type: "dispute.updated", paymentRef: String(d.payment_intent), status: d.status };
      }
      default:
        return { id: event.id, type: "ignored", rawType: event.type };
    }
  },
};

export type PaymentsStatus = { provider: "test" | "stripe"; live: boolean; problem: string | null };

export function paymentsStatus(): PaymentsStatus {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { provider: "test", live: false, problem: null };
  if (!process.env.STRIPE_WEBHOOK_SECRET) return { provider: "test", live: false, problem: "STRIPE_WEBHOOK_SECRET is missing, so Stripe is not enabled." };
  if (key.startsWith("sk_live_") && process.env.PAYMENTS_LIVE_ENABLED !== "true")
    return { provider: "test", live: false, problem: "A live Stripe key is set but PAYMENTS_LIVE_ENABLED is not true, so the test provider is used." };
  return { provider: "stripe", live: key.startsWith("sk_live_"), problem: null };
}

/** The provider for new checkouts. */
export function activeProvider(): PaymentProvider {
  return paymentsStatus().provider === "stripe" ? stripeProvider : testProvider;
}

/** The provider that processed an existing payment (refunds must go back the same way). */
export function providerFor(name: string): PaymentProvider {
  if (name === "test") return testProvider;
  if (name === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured on this deployment.");
    return stripeProvider;
  }
  throw new Error(`Payments made via “${name}” can’t be refunded through a provider.`);
}
