import { safeEqual } from "@/lib/auth/crypto";
import { getDb, isDbConfigured } from "@/lib/db";
import { runHousekeeping } from "@/lib/jobs";
import { trustedBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isDbConfigured()) return new Response("Cron is not configured", { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const result = await runHousekeeping(getDb(), { baseUrl: trustedBaseUrl(url.host) });
  return Response.json(result);
}
