import { safeEqual } from "@/lib/auth/crypto";
import { getDb, isDbConfigured } from "@/lib/db";
import { trustedBaseUrl } from "@/lib/base-url";
import { advanceWaitlistChains } from "@/lib/ops/waitlist-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Flex waitlist's clock: call every minute (with `Authorization: Bearer $CRON_SECRET`) so each
 * open spot moves to the next family 15 minutes after the last offer. Safe to run any number of times.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isDbConfigured()) return new Response("Cron is not configured", { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  return Response.json(await advanceWaitlistChains(getDb(), { baseUrl: trustedBaseUrl(url.host) }));
}
