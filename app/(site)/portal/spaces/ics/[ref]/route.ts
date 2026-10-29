import { getDb, isDbConfigured } from "@/lib/db";
import { myReservation } from "@/lib/spaces/availability";
import { CATEGORY_LABEL } from "@/lib/spaces/config";
import { getGuardian } from "../../../session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** A calendar file for one of the signed-in family's own reservations (times in UTC, so every calendar shows local time correctly). */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!isDbConfigured()) return new Response("Not found", { status: 404 });
  const g = await getGuardian();
  if (!g) return new Response("Sign in to the Family Portal first.", { status: 401 });
  const { ref } = await params;
  const r = await myReservation(getDb(), g.familyId, ref);
  if (!r || r.status !== "confirmed") return new Response("Not found", { status: 404 });
  const now = stamp(new Date().toISOString());
  const events = r.intervals.map((i, n) =>
    [
      "BEGIN:VEVENT",
      `UID:${r.reference}-${n}@yallaspacesd.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(i.start)}`,
      `DTEND:${stamp(i.end)}`,
      `SUMMARY:${esc(`${r.workspace.name} at Yalla`)}`,
      `DESCRIPTION:${esc(`${CATEGORY_LABEL[r.workspace.category]} · Confirmation ${r.reference}`)}`,
      "LOCATION:Yalla\\, 408 Nutmeg St\\, San Diego\\, CA 92103",
      "END:VEVENT",
    ].join("\r\n"),
  );
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Yalla//Book a Space//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="yalla-${r.reference}.ics"`, "Cache-Control": "private, no-store" },
  });
}
