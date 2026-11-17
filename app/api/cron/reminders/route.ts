import { safeEqual } from "@/lib/auth/crypto";
import { getDb, isDbConfigured } from "@/lib/db";
import { sendEveningReminders } from "@/lib/jobs";
import { trustedBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Evening-before reminders for tomorrow's sessions (Vercel Cron). Safe to run more than once. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isDbConfigured()) return new Response("Cron is not configured", { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  return Response.json(await sendEveningReminders(getDb(), { baseUrl: trustedBaseUrl(url.host) }));
}
