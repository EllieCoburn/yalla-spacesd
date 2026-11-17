/** Owners can permanently delete a test family's bookings and invoices; nothing else is touched. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { submitPublicBooking } from "@/lib/ops/public-booking";
import { deleteInvoicePermanently, familyTestDataCounts, purgeFamilyBookingsAndInvoices } from "@/lib/ops/test-data";
import { processEvent } from "@/lib/payments/webhooks";
import { db, owner, program, reset, session } from "./helpers";

beforeEach(reset);

async function paidBooking(email: string, last: string, sessionId: string) {
  const r = await submitPublicBooking(db(), {
    guardian: { firstName: "Test", lastName: last, email, phone: "619-555-0100" },
    children: [{ key: "a", firstName: "Kid", lastName: last, birthDate: "2022-02-01", allergies: "", medications: "" }],
    lines: [{ sessionId, childKeys: ["a"] }],
    signatures: [],
    meta: {},
    baseUrl: "http://test",
  });
  if (!r.ok) throw new Error(r.error);
  const [g] = await db().select().from(s.guardians).where(eq(s.guardians.email, email));
  const [b] = await db().select().from(s.bookings).where(eq(s.bookings.familyId, g.familyId));
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, b.id));
  const [pay] = await db().select().from(s.payments).where(eq(s.payments.invoiceId, inv.id));
  await processEvent(db(), "test", { id: "evt_" + pay.id, type: "payment.succeeded", checkoutRef: pay.checkoutRef!, providerRef: "pi_t", amountCents: pay.amountCents });
  return { familyId: g.familyId, bookingId: b.id, invoice: inv };
}

describe("Deleting test bookings and invoices", () => {
  it("removes one family's bookings, invoices and payments for good, keeping the family and everyone else's records", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 4 });
    const test = await paidBooking("test.coburn@example.com", "Testfam", sess.id);
    const other = await paidBooking("real.family@example.com", "Realfam", sess.id);
    const [f] = await db().select().from(s.families).where(eq(s.families.id, test.familyId));

    expect(await familyTestDataCounts(db(), test.familyId)).toMatchObject({ bookings: 1, invoices: 1, paidPayments: 1 });
    await expect(purgeFamilyBookingsAndInvoices(db(), owner, { familyId: test.familyId, confirmName: "wrong" })).rejects.toThrow(/type the family name/);
    // Nothing was removed by the wrong confirmation.
    expect((await db().select().from(s.bookings)).length).toBe(2);

    const r = await purgeFamilyBookingsAndInvoices(db(), owner, { familyId: test.familyId, confirmName: f.name.toUpperCase() });
    expect(r).toMatchObject({ bookings: 1, invoices: 1, payments: 1 });
    expect(await db().select().from(s.bookings).where(eq(s.bookings.familyId, test.familyId))).toHaveLength(0);
    expect(await db().select().from(s.invoices).where(eq(s.invoices.familyId, test.familyId))).toHaveLength(0);
    expect(await db().select().from(s.payments).where(eq(s.payments.familyId, test.familyId))).toHaveLength(0);
    // The family, guardian and child stay.
    expect(await db().select().from(s.families).where(eq(s.families.id, test.familyId))).toHaveLength(1);
    expect(await db().select().from(s.children).where(eq(s.children.familyId, test.familyId))).toHaveLength(1);
    // The other family is untouched.
    expect(await db().select().from(s.bookings).where(eq(s.bookings.id, other.bookingId))).toHaveLength(1);
    expect(await db().select().from(s.invoices).where(eq(s.invoices.id, other.invoice.id))).toHaveLength(1);
    // It's recorded.
    const [a] = await db().select().from(s.auditLog).where(eq(s.auditLog.action, "family.purge_test_data"));
    expect(a.summary).toMatch(/Permanently deleted .* 1 booking\(s\)/);
  });

  it("deletes a single invoice (and its payment) when its number is typed", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 4 });
    const t = await paidBooking("one.invoice@example.com", "Oneinv", sess.id);
    await expect(deleteInvoicePermanently(db(), owner, { invoiceId: t.invoice.id, confirmNumber: "INV-NOPE" })).rejects.toThrow(/invoice number/);
    await deleteInvoicePermanently(db(), owner, { invoiceId: t.invoice.id, confirmNumber: t.invoice.number.toLowerCase() });
    expect(await db().select().from(s.invoices).where(eq(s.invoices.id, t.invoice.id))).toHaveLength(0);
    expect(await db().select().from(s.payments).where(eq(s.payments.invoiceId, t.invoice.id))).toHaveLength(0);
    // The booking itself stays.
    expect(await db().select().from(s.bookings).where(eq(s.bookings.id, t.bookingId))).toHaveLength(1);
  });
});
