import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getStaff } from "@/lib/auth/session";
import { can, staffActor } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { reportById, toCsv } from "@/lib/ops/reports";
import { addDaysISO, todayLA } from "@/lib/time";

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const staff = await getStaff();
  if (!staff || (staff.mfaEnabled && !staff.mfaVerified)) return new NextResponse("Sign in required", { status: 401 });
  const { report: id } = await params;
  const report = reportById(id);
  if (!report) return new NextResponse("Not found", { status: 404 });
  if (!can(staff, "reports.view") || !can(staff, "reports.export") || (report.financial && !can(staff, "reports.financial"))) return new NextResponse("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = iso.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : addDaysISO(todayLA(), -30);
  const to = iso.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : todayLA();
  const db = getDb();
  const result = await report.run(db, { from, to, programId: url.searchParams.get("program") || undefined });
  await audit(db, staffActor(staff), { action: "export.report", entityType: "report", entityId: id, summary: `Exported “${report.title}” (${from} to ${to}, ${result.rows.length} rows)` });
  return new NextResponse(toCsv(result), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="yalla-${id}-${from}-to-${to}.csv"`, "Cache-Control": "no-store" },
  });
}
