/** Late departures: flagged for an admin to review; only charged ($10 per 10 minutes after a five-minute grace period) if approved. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { checkIn, checkOut, undoAttendance } from "@/lib/ops/attendance";
import { createHold, startCheckout } from "@/lib/ops/bookings";
import { approveLateFee, flaggedLateCheckouts, lateFeeFor, waiveLateFee } from "@/lib/ops/late-fees";
import { processEvent } from "@/lib/payments/webhooks";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const rules = { graceMinutes: 5, periodMinutes: 10, feeCents: 1000 };

describe("Late fee arithmetic", () => {
  it("allows five minutes, then charges $10 per 10 minutes or part of 10", () => {
    expect(lateFeeFor(5, rules)).toBe(0);
    expect(lateFeeFor(6, rules)).toBe(1000);
    expect(lateFeeFor(15, rules)).toBe(1000);
    expect(lateFeeFor(16, rules)).toBe(2000);
    expect(lateFeeFor(35, rules)).toBe(3000);
  });
});

async function booked(kind: "drop_in" | "camp", addons: string[] = []) {
  const p = await program({ kind, slug: `${kind === "camp" ? "camp" : "flex"}-test-${Math.random().toString(36).slice(2, 7)}`, priceCents: 15000 });
  // A few days out: Camp shows Full to families within 24 hours when no one has booked (AUTO_FULL).
  const sess = await session(p.id, {}, 3, "09:00", "15:00");
  const f = await family("Late");
  const hold = await createHold(db(), owner, { familyId: f.family.id, items: [{ sessionId: sess.id, childId: f.children[0].id, addons }], source: "public", acknowledgePaperwork: true });
  await startCheckout(db(), owner, hold.booking.id, { base: "http://test" });
  const [card] = await db()
    .select({ p: s.payments })
    .from(s.payments)
    .innerJoin(s.invoices, eq(s.invoices.id, s.payments.invoiceId))
    .where(and(eq(s.invoices.bookingId, hold.booking.id), eq(s.payments.method, "card")));
  await processEvent(db(), "test", { id: `evt_late_${Math.random()}`, type: "payment.succeeded", checkoutRef: card.p.checkoutRef!, providerRef: "tpi", amountCents: card.p.amountCents });
  return { f, sess };
}

const out = async (sess: typeof s.sessions.$inferSelect, f: Awaited<ReturnType<typeof family>>, minutesAfterEnd: number) => {
  await checkIn(db(), owner, { sessionId: sess.id, childId: f.children[0].id, at: new Date(sess.startsAt.getTime()) });
  return checkOut(db(), owner, { sessionId: sess.id, childId: f.children[0].id, pickupId: `guardian:${f.guardian.id}`, at: new Date(sess.endsAt.getTime() + minutesAfterEnd * 60_000) });
};

describe("Signing out late", () => {
  it("charges nothing within the grace period", async () => {
    const { f, sess } = await booked("drop_in");
    const r = await out(sess, f, 4);
    expect(r.lateFee).toBeNull();
  });

  it("flags a 17-minute-late sign-out for review without charging or telling the family", async () => {
    const { f, sess } = await booked("drop_in");
    const r = await out(sess, f, 17);
    expect(r.lateFee).toMatchObject({ minutesLate: 17, amountCents: 2000, status: "flagged", invoiceId: null });
    const before = await db().select().from(s.invoices).where(eq(s.invoices.familyId, f.family.id));
    expect(before.every((i) => !/Late departure/.test(i.description ?? ""))).toBe(true);
    expect(await db().select().from(s.messages).where(eq(s.messages.templateKey, "late_fee"))).toHaveLength(0);
    expect((await flaggedLateCheckouts(db())).map((x) => x.fee.id)).toEqual([r.lateFee!.id]);
  });

  it("an admin can approve it (invoiced once, family emailed), at a lower amount if they choose", async () => {
    const { f, sess } = await booked("drop_in");
    const r = await out(sess, f, 17);
    await expect(approveLateFee(db(), owner, { feeId: r.lateFee!.id, amountCents: 5000 })).rejects.toThrow(/can’t be more than \$20.00/);
    const fee = await approveLateFee(db(), owner, { feeId: r.lateFee!.id, amountCents: 1000 });
    expect(fee).toMatchObject({ status: "charged", amountCents: 1000 });
    const [line] = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, fee.invoiceId!));
    expect(line).toMatchObject({ kind: "fee", amountCents: 1000 });
    expect(await db().select().from(s.messages).where(eq(s.messages.templateKey, "late_fee"))).toHaveLength(1);
    await expect(approveLateFee(db(), owner, { feeId: fee.id })).rejects.toThrow(/already been charged/);
    expect(await flaggedLateCheckouts(db())).toHaveLength(0);
  });

  it("an admin can dismiss it with a reason: no invoice, no email", async () => {
    const { f, sess } = await booked("drop_in");
    const r = await out(sess, f, 40);
    const fee = await waiveLateFee(db(), owner, { feeId: r.lateFee!.id, reason: "Forgot to check out at the kiosk" });
    expect(fee).toMatchObject({ status: "waived", invoiceId: null, waivedReason: "Forgot to check out at the kiosk" });
    expect(await db().select().from(s.messages).where(eq(s.messages.templateKey, "late_fee"))).toHaveLength(0);
    await expect(approveLateFee(db(), owner, { feeId: fee.id })).rejects.toThrow(/dismissed/);
  });

  it("counts from the end of a booked late stay", async () => {
    const { f, sess } = await booked("camp", ["late"]);
    const r = await out(sess, f, 60); // 3:00pm + 60 minutes is before the 4:30pm late-stay end
    expect(r.lateFee).toBeNull();
  });

  it("an approved fee can still be waived, voiding the unpaid invoice; a flag is cleared if attendance is reset", async () => {
    const { f, sess } = await booked("drop_in");
    const r = await out(sess, f, 30);
    const charged = await approveLateFee(db(), owner, { feeId: r.lateFee!.id });
    const fee = await waiveLateFee(db(), owner, { feeId: r.lateFee!.id, reason: "Traffic accident on the 163" });
    expect(fee.status).toBe("waived");
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.id, charged.invoiceId!));
    expect(inv.status).toBe("void");

    const second = await booked("drop_in");
    const r2 = await out(second.sess, second.f, 30);
    await undoAttendance(db(), owner, { sessionId: second.sess.id, childId: second.f.children[0].id });
    const [after] = await db().select().from(s.lateFees).where(eq(s.lateFees.id, r2.lateFee!.id));
    expect(after.status).toBe("waived");
  });
});

describe("Recording the real time a child left", () => {
  /** A booked Flex day moved to yesterday, so times on it are in the past. */
  async function yesterday() {
    const { addDaysISO, todayLA, zonedDateTime } = await import("@/lib/time");
    const { f, sess } = await booked("drop_in");
    const d = addDaysISO(todayLA(), -1);
    const [moved] = await db().update(s.sessions).set({ localDate: d, startsAt: zonedDateTime(d, "09:00"), endsAt: zonedDateTime(d, "15:00") }).where(eq(s.sessions.id, sess.id)).returning();
    const at = (t: string) => zonedDateTime(d, t);
    const ids = { sessionId: moved.id, childId: f.children[0].id };
    await checkIn(db(), owner, { ...ids, at: at("09:00") });
    return { f, ids, at };
  }

  it("checking out after the fact with the real time (2:55pm) flags nothing", async () => {
    const { f, ids, at } = await yesterday();
    const r = await checkOut(db(), owner, { ...ids, pickupId: `guardian:${f.guardian.id}`, at: at("14:55") });
    expect(r.checkedOutAt!.getTime()).toBe(at("14:55").getTime());
    expect(r.lateFee).toBeNull();
    await expect(checkOut(db(), owner, { ...ids, pickupId: `guardian:${f.guardian.id}`, at: at("08:00") })).rejects.toThrow();
  });

  it("fixing a 4:00pm sign-out to 2:55pm clears the late flag; to 3:30pm re-flags it at 30 minutes", async () => {
    const { correctTimes } = await import("@/lib/ops/attendance");
    const { f, ids, at } = await yesterday();
    const r = await checkOut(db(), owner, { ...ids, pickupId: `guardian:${f.guardian.id}`, at: at("16:00") });
    expect(r.lateFee).toMatchObject({ minutesLate: 60, status: "flagged" });
    const fixed = await correctTimes(db(), owner, { ...ids, outTime: "14:55" });
    expect(fixed).toMatchObject({ changed: true, lateFee: null });
    expect(await db().select().from(s.lateFees)).toHaveLength(0);
    const [rec] = await db().select().from(s.attendanceRecords).where(eq(s.attendanceRecords.childId, ids.childId));
    expect(rec.checkedOutAt!.getTime()).toBe(at("14:55").getTime());
    expect((await correctTimes(db(), owner, { ...ids, outTime: "15:30" })).lateFee).toMatchObject({ minutesLate: 30, status: "flagged" });
    // Not before they arrived, and not in the future.
    await expect(correctTimes(db(), owner, { ...ids, outTime: "08:30" })).rejects.toThrow(/leave after they arrived/);
    const audit = await db().select().from(s.auditLog).where(eq(s.auditLog.action, "attendance.time_corrected"));
    expect(audit[0].summary).toContain("left 4:00pm → 2:55pm");
  });

  it("an already-charged fee is left for an admin to waive", async () => {
    const { correctTimes } = await import("@/lib/ops/attendance");
    const { f, ids, at } = await yesterday();
    const r = await checkOut(db(), owner, { ...ids, pickupId: `guardian:${f.guardian.id}`, at: at("16:00") });
    await approveLateFee(db(), owner, { feeId: r.lateFee!.id });
    const fixed = await correctTimes(db(), owner, { ...ids, outTime: "14:55" });
    expect(fixed.chargedFee).toMatchObject({ status: "charged" });
  });
});
