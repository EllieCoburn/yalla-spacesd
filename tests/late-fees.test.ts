/** Late departures: $10 for each 10 minutes after a five-minute grace period, waivable by staff. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { checkIn, checkOut, undoAttendance } from "@/lib/ops/attendance";
import { createHold, startCheckout } from "@/lib/ops/bookings";
import { lateFeeFor, waiveLateFee } from "@/lib/ops/late-fees";
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
  const sess = await session(p.id, {}, 1, "09:00", "15:00");
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

  it("invoices the family once when a child is collected 17 minutes late", async () => {
    const { f, sess } = await booked("drop_in");
    const r = await out(sess, f, 17);
    expect(r.lateFee).toMatchObject({ minutesLate: 17, amountCents: 2000 });
    const [line] = await db().select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, r.lateFee!.invoiceId!));
    expect(line).toMatchObject({ kind: "fee", amountCents: 2000 });
    const notes = await db().select().from(s.messages).where(eq(s.messages.templateKey, "late_fee"));
    expect(notes).toHaveLength(1);
  });

  it("counts from the end of a booked late stay", async () => {
    const { f, sess } = await booked("camp", ["late"]);
    const r = await out(sess, f, 60); // 3:00pm + 60 minutes is before the 4:30pm late-stay end
    expect(r.lateFee).toBeNull();
  });

  it("can be waived, voiding the unpaid invoice, and is cleared if attendance is reset", async () => {
    const { f, sess } = await booked("drop_in");
    const r = await out(sess, f, 30);
    const fee = await waiveLateFee(db(), owner, { feeId: r.lateFee!.id, reason: "Traffic accident on the 163" });
    expect(fee.status).toBe("waived");
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.id, r.lateFee!.invoiceId!));
    expect(inv.status).toBe("void");

    const second = await booked("drop_in");
    const r2 = await out(second.sess, second.f, 30);
    await undoAttendance(db(), owner, { sessionId: second.sess.id, childId: second.f.children[0].id });
    const [after] = await db().select().from(s.lateFees).where(eq(s.lateFees.id, r2.lateFee!.id));
    expect(after.status).toBe("waived");
  });
});
