/**
 * Late departures (Policies & Terms → Running late): after a five-minute grace period at the end
 * of a child's reserved session, the fee is $10 for each additional 10 minutes (Settings → Attendance).
 *
 * A late sign-out is only FLAGGED, internally: nothing is invoiced and the family isn't told. There are
 * many reasons a sign-out can be late (an agreed extension, a family who forgot to check out at the
 * kiosk, staff signing a child out afterwards), so an admin reviews each one and either approves the
 * fee (then it's invoiced and the family is emailed) or dismisses it.
 */
import { and, eq } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB } from "@/lib/db";
import { attendanceRecords, bookingItems, children, invoices, lateFees, programs, sessions } from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { addonsFor } from "@/lib/booking/addons";
import { fmtDate } from "@/lib/time";
import { createInvoice, invoiceTotals, usd, voidInvoice } from "./billing";
import { getPolicy } from "./settings";

/** Whole minutes after the end, the fee for them, given the grace period and fee per period. */
export function lateFeeFor(minutesLate: number, rules: { graceMinutes: number; periodMinutes: number; feeCents: number }) {
  if (minutesLate <= rules.graceMinutes) return 0;
  return Math.ceil((minutesLate - rules.graceMinutes) / rules.periodMinutes) * rules.feeCents;
}

/** When the child's reserved time ends: the session's end, extended by a booked late stay. */
async function reservedEnd(db: DB, rec: typeof attendanceRecords.$inferSelect, session: typeof sessions.$inferSelect, program: typeof programs.$inferSelect) {
  let end = session.endsAt.getTime();
  if (rec.bookingItemId) {
    const [item] = await db.select().from(bookingItems).where(eq(bookingItems.id, rec.bookingItemId));
    const chosen = addonsFor(program.kind, program.slug).filter((a) => item?.addons.includes(a.key));
    // A half day ends earlier (e.g. Yalla Flex at 12:00pm).
    const short = chosen.find((a) => a.endsAfterStartMinutes);
    if (short) end = session.startsAt.getTime() + short.endsAfterStartMinutes! * 60_000;
    const extra = chosen.filter((a) => a.extendsEndMinutes).reduce((m, a) => Math.max(m, a.extendsEndMinutes!), 0);
    end += extra * 60_000;
  }
  return new Date(end);
}

/** Flag a late sign-out for review, if it's past the grace period. Nothing is charged. Once per child and session. */
export async function flagLateCheckout(db: DB, actor: Actor, input: { sessionId: string; childId: string }) {
  const [rec] = await db
    .select()
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.sessionId, input.sessionId), eq(attendanceRecords.childId, input.childId)));
  if (!rec?.checkedOutAt) return null;
  const [x] = await db.select({ s: sessions, p: programs }).from(sessions).innerJoin(programs, eq(programs.id, sessions.programId)).where(eq(sessions.id, input.sessionId));
  if (!x) return null;
  const end = await reservedEnd(db, rec, x.s, x.p);
  const minutesLate = Math.floor((rec.checkedOutAt.getTime() - end.getTime()) / 60_000);
  const rules = {
    graceMinutes: await getPolicy(db, "attendance.lateGraceMinutes"),
    periodMinutes: await getPolicy(db, "attendance.latePeriodMinutes"),
    feeCents: await getPolicy(db, "attendance.lateFeeCents"),
  };
  const amount = lateFeeFor(minutesLate, rules);
  if (amount <= 0) return null;
  const [child] = await db.select().from(children).where(eq(children.id, input.childId));
  const [fee] = await db
    .insert(lateFees)
    .values({ familyId: child.familyId, childId: child.id, sessionId: x.s.id, minutesLate, amountCents: amount, status: "flagged" })
    .onConflictDoNothing({ target: [lateFees.childId, lateFees.sessionId] })
    .returning();
  if (!fee) return null; // already flagged for this session
  await audit(db, actor, { action: "attendance.late_checkout", entityType: "child", entityId: child.id, summary: `Late sign-out flagged for review: ${minutesLate} minutes after the end (possible fee ${usd(amount)}). Not charged.` });
  return fee;
}

/** An admin approves a flagged late fee: it's invoiced and the family is emailed. The amount can be lowered. */
export async function approveLateFee(db: DB, actor: Actor, input: { feeId: string; amountCents?: number | null }) {
  // Only a person, signed in to Admin with billing access, ever charges a late fee. Never a sign-out, the kiosk or a job.
  if (actor.type !== "staff" || !actor.permissions?.includes("billing.manage")) throw new OpsError("forbidden", "Only an admin with billing access can charge a late fee.");
  const [fee] = await db.select().from(lateFees).where(eq(lateFees.id, input.feeId));
  if (!fee) throw new OpsError("not_found", "Late fee not found.");
  if (fee.status !== "flagged") throw new OpsError("invalid", fee.status === "charged" ? "This fee has already been charged." : "This late sign-out was dismissed.");
  const amount = input.amountCents ?? fee.amountCents;
  if (!Number.isInteger(amount) || amount <= 0) throw new OpsError("invalid", "Enter an amount above $0, or dismiss it instead.");
  if (amount > fee.amountCents) throw new OpsError("invalid", `The fee can’t be more than ${usd(fee.amountCents)} for ${fee.minutesLate} minutes.`);
  const [x] = await db.select({ s: sessions, p: programs }).from(sessions).innerJoin(programs, eq(programs.id, sessions.programId)).where(eq(sessions.id, fee.sessionId));
  const [child] = await db.select().from(children).where(eq(children.id, fee.childId));
  const name = child.preferredName || child.firstName;
  const inv = await createInvoice(db, actor, {
    familyId: fee.familyId,
    description: `Late departure · ${name} · ${fmtDate(x.s.localDate, "EEE MMM d")}`,
    lines: [{ kind: "fee", description: `Late departure fee: ${name}, ${fee.minutesLate} minutes after ${x.s.title ?? x.p.name} ended (${fmtDate(x.s.localDate, "EEE MMM d")})`, unitCents: amount }],
  });
  const [done] = await db.update(lateFees).set({ status: "charged", amountCents: amount, invoiceId: inv.id, waivedBy: null, waivedReason: null }).where(eq(lateFees.id, fee.id)).returning();
  await audit(db, actor, { action: "billing.late_fee", entityType: "child", entityId: child.id, summary: `Late departure fee ${usd(amount)} approved (${fee.minutesLate} minutes late)` });
  await notifyFamily(db, {
    key: "late_fee",
    familyId: fee.familyId,
    vars: { child_name: name, minutes_late: String(fee.minutesLate), date: fmtDate(x.s.localDate, "EEEE, MMMM d"), amount: usd(amount) },
    related: { type: "invoice", id: inv.id },
  });
  return done;
}

/** Late sign-outs waiting for an admin to approve or dismiss, oldest first. */
export async function flaggedLateCheckouts(db: DB) {
  const { asc, desc } = await import("drizzle-orm");
  const { families } = await import("@/lib/db/schema");
  const rows = await db
    .select({ fee: lateFees, c: children, s: sessions, p: programs, f: families })
    .from(lateFees)
    .innerJoin(children, eq(children.id, lateFees.childId))
    .innerJoin(sessions, eq(sessions.id, lateFees.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(families, eq(families.id, lateFees.familyId))
    .where(eq(lateFees.status, "flagged"))
    .orderBy(asc(sessions.localDate), desc(lateFees.createdAt));
  return rows;
}

/** Waive a late fee or dismiss a flagged one (with a reason). An unpaid fee's invoice is voided; a paid one needs a refund or credit in Billing. */
export async function waiveLateFee(db: DB, actor: Actor, input: { feeId: string; reason: string }) {
  if (!input.reason.trim()) throw new OpsError("invalid", "Say why (for example, an agreed extension or they forgot to check out).");
  const [fee] = await db.select().from(lateFees).where(eq(lateFees.id, input.feeId));
  if (!fee) throw new OpsError("not_found", "Late fee not found.");
  if (fee.status === "waived") return fee;
  if (fee.invoiceId) {
    const t = (await invoiceTotals(db, [fee.invoiceId])).get(fee.invoiceId);
    if (t && (t.paid > 0 || t.creditApplied > 0)) throw new OpsError("paid", "This fee has already been paid. Refund or credit it from the invoice in Billing.");
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, fee.invoiceId));
    if (inv && inv.status !== "void") await voidInvoice(db, actor, inv.id, `Late fee waived: ${input.reason}`);
  }
  const [done] = await db.update(lateFees).set({ status: "waived", waivedBy: actor.name, waivedReason: input.reason }).where(eq(lateFees.id, fee.id)).returning();
  await audit(db, actor, { action: "billing.late_fee_waived", entityType: "child", entityId: fee.childId, summary: fee.status === "flagged" ? `Late sign-out dismissed, no fee: ${input.reason}` : `Late fee of ${usd(fee.amountCents)} waived: ${input.reason}` });
  return done;
}
