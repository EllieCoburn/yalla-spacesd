import { getDb, isDbConfigured } from "@/lib/db";
import { listPublicSessions } from "@/lib/ops/public-booking";
import { addDaysISO, todayLA } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["drop_in", "weekend", "parents_night", "camp", "happening", "nature", "private_event"];

/** Live, truthful availability for the public booking calendar. */
export async function GET(req: Request) {
  if (!isDbConfigured()) return Response.json({ configured: false, sessions: [] });
  const url = new URL(req.url);
  const today = todayLA();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let from = url.searchParams.get("from") ?? today;
  let to = url.searchParams.get("to") ?? addDaysISO(from, 41);
  if (!iso.test(from) || from < today) from = today;
  if (!iso.test(to)) to = addDaysISO(from, 41);
  if (to > addDaysISO(from, 120)) to = addDaysISO(from, 120);
  const kinds = (url.searchParams.get("kind") ?? "").split(",").filter((k) => KINDS.includes(k));
  const ageRaw = url.searchParams.get("ageMonths");
  const ageMonths = ageRaw && /^\d{1,3}$/.test(ageRaw) ? Number(ageRaw) : null;
  try {
    const sessions = await listPublicSessions(getDb(), { from, to, kinds, ageMonths });
    return Response.json({ configured: true, sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ configured: true, error: "Availability is temporarily unavailable.", sessions: [] }, { status: 503 });
  }
}
