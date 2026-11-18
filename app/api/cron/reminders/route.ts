import { safeEqual } from "@/lib/auth/crypto";
import { getDb, isDbConfigured } from "@/lib/db";
import { sendEveningReminders } from "@/lib/jobs";
import { trustedBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Evening run (Vercel Cron): reminders for tomorrow's sessions and Flex first-day thank-yous. Safe to run more than once. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isDbConfigured()) return new Response("Cron is not configured", { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const baseUrl = trustedBaseUrl(url.host);
  const reminders = await sendEveningReminders(getDb(), { baseUrl });
  // This run is at 6pm Pacific (7pm in summer): new Flex families' first-day thank-you goes out now too.
  const { sendFlexThankYous } = await import("@/lib/ops/flex-thank-you");
  const thankYous = await sendFlexThankYous(getDb(), { baseUrl });
  return Response.json({ ...reminders, flexThankYous: thankYous.sent });
}
