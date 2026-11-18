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
  // New Flex families' welcome (their first day is tomorrow) goes first; it doubles as their reminder.
  const { sendFlexWelcomes } = await import("@/lib/ops/flex-welcome");
  const welcomes = await sendFlexWelcomes(getDb(), { baseUrl, evening: true });
  // New camp families' welcome (their first camp day is tomorrow), which doubles as their reminder.
  const { sendCampWelcomes } = await import("@/lib/ops/camp-welcome");
  const campWelcomes = await sendCampWelcomes(getDb(), { baseUrl, evening: true }).catch(() => ({ sent: 0 }));
  const reminders = await sendEveningReminders(getDb(), { baseUrl });
  // This run is at 6pm Pacific (7pm in summer): new Flex families' first-day thank-you goes out now too.
  const { sendFlexThankYous } = await import("@/lib/ops/flex-thank-you");
  const thankYous = await sendFlexThankYous(getDb(), { baseUrl });
  return Response.json({ ...reminders, flexWelcomes: welcomes.sent, campWelcomes: campWelcomes.sent, flexThankYous: thankYous.sent });
}
