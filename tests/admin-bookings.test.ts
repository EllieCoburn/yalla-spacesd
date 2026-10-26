import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { bookingDetail, derivePaymentState, listBookings, paperworkStates, sessionDetail } from "@/lib/admin/queries/bookings";
import { confirmAdminBooking, createHold, cancelBooking } from "@/lib/ops/bookings";
import { recordOfflinePayment } from "@/lib/ops/billing";
import { addRequirement, createTemplate } from "@/lib/ops/forms";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const t = (total: number, paid = 0, balance = total - paid) => ({ total, paid, creditApplied: 0, refunded: 0, balance });

describe("derivePaymentState", () => {
  it("covers each state", () => {
    expect(derivePaymentState([])).toBe("none");
    expect(derivePaymentState([t(0)])).toBe("free");
    expect(derivePaymentState([t(15000)])).toBe("unpaid");
    expect(derivePaymentState([t(15000, 5000)])).toBe("partial");
    expect(derivePaymentState([t(15000, 15000)])).toBe("paid");
    // Two invoices (original + price difference): one paid, one open → partial.
    expect(derivePaymentState([t(15000, 15000), t(3000)])).toBe("partial");
    // A refund reopens the balance unless the amount owed was adjusted.
    expect(derivePaymentState([{ total: 15000, paid: 15000, creditApplied: 0, refunded: 15000, balance: 15000 }])).toBe("unpaid");
  });
});

describe("listBookings", () => {
  async function setup() {
    const flex = await program({ name: "Flex" });
    const weekend = await program({ name: "Weekend", kind: "weekend" });
    const s1 = await session(flex.id, { capacity: 5 }, 3);
    const s2 = await session(weekend.id, { capacity: 5 }, 10);
    const ana = await family("Ana", [{ first: "Zelda", birth: "2023-01-01" }]);
    const ben = await family("Ben", [{ first: "Yusuf", birth: "2022-06-01" }]);
    const h1 = await createHold(db(), owner, { familyId: ana.family.id, items: [{ sessionId: s1.id, childId: ana.children[0].id }], source: "admin" });
    await confirmAdminBooking(db(), owner, h1.booking.id, { createInvoice: true, notify: false });
    const h2 = await createHold(db(), owner, { familyId: ben.family.id, items: [{ sessionId: s2.id, childId: ben.children[0].id }], source: "admin" });
    await confirmAdminBooking(db(), owner, h2.booking.id, { createInvoice: true, notify: false });
    const [inv2] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, h2.booking.id));
    await recordOfflinePayment(db(), owner, { invoiceId: inv2.id, amountCents: 15000, method: "offline_cash", note: "cash", idempotencyKey: "k1" });
    return { flex, weekend, s1, s2, ana, ben, h1, h2 };
  }

  it("filters by program, search, payment and status", async () => {
    const { flex, h1, h2 } = await setup();
    expect((await listBookings(db(), {})).total).toBe(2);
    const byProgram = await listBookings(db(), { program: flex.id });
    expect(byProgram.rows.map((r) => r.id)).toEqual([h1.booking.id]);
    expect((await listBookings(db(), { q: "Yusuf" })).rows.map((r) => r.id)).toEqual([h2.booking.id]);
    expect((await listBookings(db(), { q: h1.booking.reference })).rows.map((r) => r.id)).toEqual([h1.booking.id]);
    expect((await listBookings(db(), { payment: "paid" })).rows.map((r) => r.id)).toEqual([h2.booking.id]);
    expect((await listBookings(db(), { payment: "unpaid" })).rows.map((r) => r.id)).toEqual([h1.booking.id]);
    await cancelBooking(db(), owner, { bookingId: h1.booking.id, reason: "test", notify: false });
    expect((await listBookings(db(), { status: "cancelled" })).rows.map((r) => r.id)).toEqual([h1.booking.id]);
    const row = (await listBookings(db(), { status: "confirmed" })).rows[0];
    expect(row.children).toEqual(["Yusuf"]);
    expect(row.programs).toEqual(["Weekend"]);
  });

  it("filters by date range and paperwork", async () => {
    const { weekend, s2, h1, h2 } = await setup();
    expect((await listBookings(db(), { from: s2.localDate })).rows.map((r) => r.id)).toEqual([h2.booking.id]);
    const { template } = await createTemplate(db(), owner, { title: "Weekend waiver", kind: "waiver", perChild: true, requiresSignature: true, frequency: "once", enforcement: "before_attendance", body: "Placeholder" });
    await addRequirement(db(), owner, { templateId: template.id, scope: "program", programId: weekend.id });
    const pw = await paperworkStates(db(), [h1.booking.id, h2.booking.id]);
    expect(pw.get(h1.booking.id)).toBe("complete");
    expect(pw.get(h2.booking.id)).toBe("issues");
    expect((await listBookings(db(), { paperwork: "issues" })).rows.map((r) => r.id)).toEqual([h2.booking.id]);
  });

  it("assembles the connected booking and session detail", async () => {
    const { h2, s2 } = await setup();
    const d = await bookingDetail(db(), h2.booking.id);
    expect(d?.payment.state).toBe("paid");
    expect(d?.items).toHaveLength(1);
    expect(d?.events.map((e) => e.type)).toContain("confirmed");
    const sd = await sessionDetail(db(), s2.id);
    expect(sd?.availability.occupancy.booked).toBe(1);
    expect(sd?.attendees).toHaveLength(1);
  });
});
