"use server";

import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { checkIn, checkOut, markAbsent, undoAttendance } from "@/lib/ops/attendance";
import { approveLateFee, waiveLateFee } from "@/lib/ops/late-fees";

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
  return r.lateFee
    ? `Checked out — collected by ${r.collectedByName}. That’s ${r.lateFee.minutesLate} minutes after the session ended, so it’s flagged for an admin to review. Nothing has been charged and the family hasn’t been told.`
    : `Checked out — collected by ${r.collectedByName}.`;
});

export const absentAction = adminAction("attendance.manage", async ({ db, actor, str }) => {
  await markAbsent(db, actor, { ...ids(str), note: str("note") || undefined });
  return "Marked absent. The booking, membership and billing are unchanged.";
});

export const undoAction = adminAction("attendance.manage", async ({ db, actor, str }) => {
  await undoAttendance(db, actor, ids(str));
  return "Attendance reset to expected.";
});

export const waiveLateFeeAction = adminAction("billing.manage", async ({ db, actor, str }) => {
  const fee = await waiveLateFee(db, actor, { feeId: str("feeId"), reason: str("reason") });
  return fee.invoiceId ? "Late fee waived and its invoice voided." : "Dismissed. No fee, and the family isn’t told.";
});

export const approveLateFeeAction = adminAction("billing.manage", async ({ db, actor, str, cents }) => {
  const fee = await approveLateFee(db, actor, { feeId: str("feeId"), amountCents: cents("amount") });
  return `Late fee of $${(fee.amountCents / 100).toFixed(2)} charged. The family has been emailed.`;
});
