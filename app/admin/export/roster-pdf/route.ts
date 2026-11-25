import { audit } from "@/lib/audit";
import { getStaff } from "@/lib/auth/session";
import { can, staffActor, staffReady } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { dayRosterPdf } from "@/lib/ops/roster-pdf";
import { todayLA } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The printable day roster PDF: ?date=YYYY-MM-DD (default today), optionally ?program= or ?session=.
 * It carries contact and health details, so it needs roster, family and care access.
 */
export async function GET(req: Request) {
  const staff = await getStaff();
  const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (!staffReady(staff)) return text("Sign in to Admin to download rosters.", 401);
  if (!can(staff, "roster.view") || !can(staff, "families.view") || !can(staff, "children.care"))
    return text("The roster PDF includes parents’ phone numbers and children’s health details, so it needs a role that can see family contacts and care information.", 403);
  const sp = new URL(req.url).searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") ?? "") ? sp.get("date")! : todayLA();
  const programId = sp.get("program")?.slice(0, 60) || undefined;
  const sessionId = sp.get("session")?.slice(0, 60) || undefined;
  const db = getDb();
  const doc = await dayRosterPdf(db, date, { programId, sessionId, perms: staff.permissions, printedBy: staff.name });
  await audit(db, staffActor(staff), { action: "export.roster", entityType: "session", entityId: sessionId ?? date, summary: `Downloaded the roster PDF for ${date} (${doc.children} children)` });
  const inline = sp.has("view");
  return new Response(Buffer.from(doc.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${doc.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
