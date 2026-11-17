import { safeEqual } from "@/lib/auth/crypto";
import { getDb, isDbConfigured } from "@/lib/db";
import { sendFlexWelcomes } from "@/lib/ops/flex-welcome";
import { trustedBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Yalla Flex first-day welcome emails, early each morning (Vercel Cron, before anyone arrives).
 * Safe to run any number of times: each family is only ever welcomed once.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isDbConfigured()) return new Response("Cron is not configured", { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  return Response.json(await sendFlexWelcomes(getDb(), { baseUrl: trustedBaseUrl(url.host) }));
}
