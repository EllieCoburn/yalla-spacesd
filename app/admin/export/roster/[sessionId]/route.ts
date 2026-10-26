import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getStaff } from "@/lib/auth/session";
import { can, staffActor } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { roster } from "@/lib/ops/attendance";
import { toCsv } from "@/lib/ops/reports";
import { fmtTime } from "@/lib/time";

/** Roster CSV: operational fields only. Allergy alerts appear only for staff with care access; never contacts or billing. */
export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const staff = await getStaff();
  if (!staff || (staff.mfaEnabled && !staff.mfaVerified)) return new NextResponse("Sign in required", { status: 401 });
  if (!can(staff, "roster.view")) return new NextResponse("Forbidden", { status: 403 });
  const { sessionId } = await params;
  const db = getDb();
  let r;
  try {
    r = await roster(db, sessionId, staff.permissions);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const care = can(staff, "children.care");
  const csv = toCsv({
    columns: [
      { key: "child", label: "Child" },
      { key: "preferred", label: "Preferred name" },
      { key: "age", label: "Age on date" },
      { key: "cohort", label: "Cohort" },
      { key: "source", label: "Attending via" },
      { key: "status", label: "Attendance" },
      { key: "in", label: "Checked in" },
      { key: "out", label: "Checked out" },
      { key: "collected", label: "Collected by" },
      ...(care ? [{ key: "alert", label: "Allergy alert" }] : []),
    ],
    rows: r.children.map((c) => ({
      child: c.name,
      preferred: c.preferredName ?? "",
      age: c.age,
      cohort: c.cohort ?? "",
      source: c.source === "membership" ? "Club Yalla" : `Booking ${c.bookingReference ?? ""}`,
      status: c.attendance?.status ?? (c.expected ? "expected" : (c.notExpectedReason ?? "not expected")),
      in: c.attendance?.checkedInAt ? fmtTime(c.attendance.checkedInAt) : "",
      out: c.attendance?.checkedOutAt ? fmtTime(c.attendance.checkedOutAt) : "",
      collected: c.attendance?.collectedByName ?? "",
      ...(care ? { alert: c.care?.allergies ?? "" } : {}),
    })),
  });
  await audit(db, staffActor(staff), { action: "export.roster", entityType: "session", entityId: sessionId, summary: `Exported roster CSV (${r.children.length} rows)` });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="roster-${r.session.localDate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
