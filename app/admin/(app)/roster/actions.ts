"use server";

import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { checkIn, checkOut, markAbsent, undoAttendance } from "@/lib/ops/attendance";

const ids = (str: (k: string) => string) => {
  const sessionId = str("sessionId");
  const childId = str("childId");
  if (!sessionId || !childId) throw new OpsError("invalid", "Missing session or child.");
  return { sessionId, childId };
};

export const checkInAction = adminAction("attendance.manage", async ({ db, actor, str }) => {
  await checkIn(db, actor, { ...ids(str), note: str("note") || undefined });
  return "Checked in.";
});

export const checkOutAction = adminAction("attendance.manage", async ({ db, actor, str }) => {
  if (!str("pickupId")) throw new OpsError("invalid", "Choose who is collecting the child.");
  const r = await checkOut(db, actor, { ...ids(str), pickupId: str("pickupId"), note: str("note") || undefined });
  return `Checked out — collected by ${r.collectedByName}.`;
});

export const absentAction = adminAction("attendance.manage", async ({ db, actor, str }) => {
  await markAbsent(db, actor, { ...ids(str), note: str("note") || undefined });
  return "Marked absent. The booking, membership and billing are unchanged.";
});

export const undoAction = adminAction("attendance.manage", async ({ db, actor, str }) => {
  await undoAttendance(db, actor, ids(str));
  return "Attendance reset to expected.";
});
