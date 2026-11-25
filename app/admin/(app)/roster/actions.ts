"use server";

import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { eq } from "drizzle-orm";
import { checkIn, checkOut, correctTimes, markAbsent, undoAttendance } from "@/lib/ops/attendance";
import { sessions } from "@/lib/db/schema";
import { zonedDateTime } from "@/lib/time";
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
  // "Left at": staff can record an earlier time when they're signing a child out after the fact.
  let at: Date | undefined;
  const t = str("time");
  if (t) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new OpsError("invalid", "Enter the time they left, like 2:55 PM.");
    const [s] = await db.select({ localDate: sessions.localDate }).from(sessions).where(eq(sessions.id, ids(str).sessionId));
    if (!s) throw new OpsError("not_found", "Session not found.");
    at = zonedDateTime(s.localDate, t);
    if (at.getTime() > Date.now() + 60_000) throw new OpsError("invalid", "The time they left can’t be in the future.");
  }
  const r = await checkOut(db, actor, { ...ids(str), pickupId: str("pickupId"), note: str("note") || undefined, at });
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

export const correctTimesAction = adminAction("attendance.manage", async ({ db, actor, str }) => {
  const r = await correctTimes(db, actor, { ...ids(str), inTime: str("inTime") || null, outTime: str("outTime") || null });
  if (!r.changed) return "Times unchanged.";
  if (r.chargedFee) return `Times corrected. A $${(r.chargedFee.amountCents / 100).toFixed(2)} late fee was already charged for this day; waive it in Billing → Late sign-outs or on the roster if it no longer applies.`;
  return r.lateFee ? `Times corrected. Still ${r.lateFee.minutesLate} minutes late, so it stays flagged for review (not charged).` : "Times corrected. No late sign-out.";
});

export const approveLateFeeAction = adminAction("billing.manage", async ({ db, actor, str, cents }) => {
  const fee = await approveLateFee(db, actor, { feeId: str("feeId"), amountCents: cents("amount") });
  return `Late fee of $${(fee.amountCents / 100).toFixed(2)} charged. The family has been emailed.`;
});
