import { getDb, isDbConfigured } from "@/lib/db";
import { paymentsStatus, testProvider } from "@/lib/payments/provider";
import { testPaymentsAllowed } from "@/lib/payments/test-mode";
import { handleWebhook } from "@/lib/payments/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed events from the built-in test checkout. Disabled whenever Stripe is the active provider. */
export async function POST(req: Request) {
  if (!isDbConfigured() || paymentsStatus().provider !== "test" || !testPaymentsAllowed()) return new Response("Not found", { status: 404 });
  const raw = await req.text();
  const res = await handleWebhook(getDb(), testProvider, raw, req.headers);
  return new Response(res.body, { status: res.status });
}
