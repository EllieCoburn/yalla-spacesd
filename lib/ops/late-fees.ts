/**
 * Late departures (Policies & Terms → Running late): after a five-minute grace period at the end
 * of a child's reserved session, a late fee of $10 is charged for each additional 10 minutes
 * (Settings → Attendance). It's worked out when the child is signed out, invoiced to the family
 * and can be waived by staff with a reason. Letting Yalla know about a delay doesn't waive it.
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
    const extra = addonsFor(program.kind, program.slug)
      .filter((a) => item?.addons.includes(a.key) && a.extendsEndMinutes)
      .reduce((m, a) => Math.max(m, a.extendsEndMinutes!), 0);
    end += extra * 60_000;
  }
  return new Date(end);
}

/** Charge a late fee for a sign-out, if one applies. Runs once per child and session. */
export async function chargeLateFee(db: DB, actor: Actor, input: { sessionId: string; childId: string }) {
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
    .values({ familyId: child.familyId, childId: child.id, sessionId: x.s.id, minutesLate, amountCents: amount })
    .onConflictDoNothing({ target: [lateFees.childId, lateFees.sessionId] })
    .returning();
  if (!fee) return null; // already charged for this session
  const name = child.preferredName || child.firstName;
  const inv = await createInvoice(db, actor, {
    familyId: child.familyId,
    description: `Late departure · ${name} · ${fmtDate(x.s.localDate, "EEE MMM d")}`,
    lines: [{ kind: "fee", description: `Late departure fee: ${name}, ${minutesLate} minutes after ${x.s.title ?? x.p.name} ended (${fmtDate(x.s.localDate, "EEE MMM d")})`, unitCents: amount }],
  });
  await db.update(lateFees).set({ invoiceId: inv.id }).where(eq(lateFees.id, fee.id));
  await audit(db, actor, { action: "billing.late_fee", entityType: "child", entityId: child.id, summary: `Late departure fee ${usd(amount)} (${minutesLate} minutes late)` });
  await notifyFamily(db, {
    key: "late_fee",
    familyId: child.familyId,
    vars: { child_name: name, minutes_late: String(minutesLate), date: fmtDate(x.s.localDate, "EEEE, MMMM d"), amount: usd(amount) },
    related: { type: "invoice", id: inv.id },
  });
  return { ...fee, invoiceId: inv.id };
}

/** Waive a late fee (staff, with a reason). An unpaid fee's invoice is voided; a paid one needs a refund or credit in Billing. */
export async function waiveLateFee(db: DB, actor: Actor, input: { feeId: string; reason: string }) {
  if (!input.reason.trim()) throw new OpsError("invalid", "Say why the fee is being waived.");
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
  await audit(db, actor, { action: "billing.late_fee_waived", entityType: "child", entityId: fee.childId, summary: `Late fee of ${usd(fee.amountCents)} waived: ${input.reason}` });
  return done;
}
