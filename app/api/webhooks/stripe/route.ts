import { getDb, isDbConfigured } from "@/lib/db";
import { paymentsStatus, stripeProvider } from "@/lib/payments/provider";
import { handleWebhook } from "@/lib/payments/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe webhooks: signature verified on the raw body, processed once per event id. */
export async function POST(req: Request) {
  if (!isDbConfigured() || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return new Response("Stripe is not configured", { status: 503 });
  if (paymentsStatus().provider !== "stripe") return new Response("Stripe is not the active provider", { status: 503 });
  const raw = await req.text();
  const res = await handleWebhook(getDb(), stripeProvider, raw, req.headers);
  return new Response(res.body, { status: res.status });
}
