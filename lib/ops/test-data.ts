/**
 * Permanently removing test bookings and invoices (owners only, from Admin). Unlike cancelling or
 * voiding, nothing is kept: the bookings, their days, invoices, payments, refunds, wallet entries
 * and extras are deleted. Signed paperwork and messages are kept (unlinked from the booking), and
 * the family, guardians and children stay. Everything happens in one transaction, and an entry in
 * the audit trail records who did it and what was removed.
 *
 * Deleting a payment record doesn't refund a real card: refund in Stripe first if money was taken.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { DB, Tx } from "@/lib/db";
import { bookingItems, bookings, families, invoices, payments, spaceReservationGroups } from "@/lib/db/schema";

type Removed = { bookings: number; invoices: number; payments: number; spaceReservations: number };

const ids = (list: string[]) => sql.join(list.map((i) => sql`${i}`), sql`, `);

async function removeInvoices(tx: Tx, invoiceIds: string[]) {
  if (!invoiceIds.length) return { invoices: 0, payments: 0 };
  const pays = await tx.select({ id: payments.id }).from(payments).where(inArray(payments.invoiceId, invoiceIds));
  const payIds = pays.map((p) => p.id);
  const I = ids(invoiceIds);
  if (payIds.length) {
    const P = ids(payIds);
    await tx.execute(sql`DELETE FROM refunds WHERE payment_id IN (${P}) OR invoice_id IN (${I})`);
    await tx.execute(sql`DELETE FROM wallet_entries WHERE payment_id IN (${P})`);
  } else await tx.execute(sql`DELETE FROM refunds WHERE invoice_id IN (${I})`);
  await tx.execute(sql`DELETE FROM wallet_entries WHERE invoice_id IN (${I})`);
  await tx.execute(sql`DELETE FROM wallet_reservations WHERE invoice_id IN (${I})`);
  await tx.execute(sql`DELETE FROM credits WHERE invoice_id IN (${I})`);
  await tx.execute(sql`UPDATE scheduled_charges SET invoice_id = NULL WHERE invoice_id IN (${I})`);
  await tx.execute(sql`DELETE FROM late_fees WHERE invoice_id IN (${I})`);
  await tx.execute(sql`DELETE FROM booking_extras WHERE invoice_id IN (${I})`);
  await tx.execute(sql`DELETE FROM invoice_lines WHERE invoice_id IN (${I})`);
  await tx.execute(sql`DELETE FROM payments WHERE invoice_id IN (${I})`);
  await tx.execute(sql`DELETE FROM invoices WHERE id IN (${I})`);
  return { invoices: invoiceIds.length, payments: payIds.length };
}

async function removeBookings(tx: Tx, bookingIds: string[]) {
  if (!bookingIds.length) return 0;
  const B = ids(bookingIds);
  const itemIds = (await tx.select({ id: bookingItems.id }).from(bookingItems).where(inArray(bookingItems.bookingId, bookingIds))).map((r) => r.id);
  if (itemIds.length) {
    const IT = ids(itemIds);
    await tx.execute(sql`DELETE FROM attendance_records WHERE booking_item_id IN (${IT})`);
    await tx.execute(sql`DELETE FROM booking_extras WHERE booking_item_id IN (${IT})`);
    await tx.execute(sql`UPDATE invoice_lines SET booking_item_id = NULL WHERE booking_item_id IN (${IT})`);
  }
  await tx.execute(sql`DELETE FROM wallet_entries WHERE booking_id IN (${B})`);
  await tx.execute(sql`DELETE FROM wallet_reservations WHERE booking_id IN (${B})`);
  await tx.execute(sql`DELETE FROM cancellation_offers WHERE booking_id IN (${B})`);
  await tx.execute(sql`DELETE FROM capacity_overrides WHERE booking_id IN (${B})`);
  await tx.execute(sql`DELETE FROM booking_events WHERE booking_id IN (${B})`);
  // Signed paperwork and notes are kept, no longer tied to the deleted booking.
  await tx.execute(sql`UPDATE form_submissions SET booking_id = NULL WHERE booking_id IN (${B})`);
  await tx.execute(sql`UPDATE family_notes SET booking_id = NULL WHERE booking_id IN (${B})`);
  await tx.execute(sql`UPDATE waitlist_entries SET offer_booking_id = NULL WHERE offer_booking_id IN (${B})`);
  await tx.execute(sql`DELETE FROM booking_items WHERE booking_id IN (${B})`);
  await tx.execute(sql`DELETE FROM bookings WHERE id IN (${B})`);
  return bookingIds.length;
}

/** Every booking (care and workspace) and every invoice of one family, gone for good. */
export async function purgeFamilyBookingsAndInvoices(db: DB, actor: Actor, input: { familyId: string; confirmName: string }): Promise<Removed> {
  const [f] = await db.select().from(families).where(eq(families.id, input.familyId));
  if (!f) throw new OpsError("not_found", "Family not found.");
  if (input.confirmName.trim().toLowerCase() !== f.name.trim().toLowerCase()) throw new OpsError("invalid", `To confirm, type the family name exactly: ${f.name}`);
  return db.transaction(async (tx) => {
    const bookingIds = (await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.familyId, f.id))).map((r) => r.id);
    const groupIds = (await tx.select({ id: spaceReservationGroups.id }).from(spaceReservationGroups).where(eq(spaceReservationGroups.familyId, f.id))).map((r) => r.id);
    const invoiceIds = (await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.familyId, f.id))).map((r) => r.id);
    const inv = await removeInvoices(tx, invoiceIds);
    const removedBookings = await removeBookings(tx, bookingIds);
    if (groupIds.length) {
      const G = ids(groupIds);
      await tx.execute(sql`DELETE FROM cancellation_offers WHERE space_group_id IN (${G})`);
      await tx.execute(sql`DELETE FROM space_reservations WHERE group_id IN (${G})`);
      await tx.execute(sql`DELETE FROM space_reservation_groups WHERE id IN (${G})`);
    }
    const removed = { bookings: removedBookings, invoices: inv.invoices, payments: inv.payments, spaceReservations: groupIds.length };
    await audit(tx, actor, {
      action: "family.purge_test_data",
      entityType: "family",
      entityId: f.id,
      summary: `Permanently deleted ${f.name}’s ${removed.bookings} booking(s), ${removed.spaceReservations} workspace reservation(s), ${removed.invoices} invoice(s) and ${removed.payments} payment record(s) (test data)`,
    });
    return removed;
  });
}

/** One invoice (and its payments, refunds and wallet entries), gone for good. The booking stays. */
export async function deleteInvoicePermanently(db: DB, actor: Actor, input: { invoiceId: string; confirmNumber: string }) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId));
  if (!inv) throw new OpsError("not_found", "Invoice not found.");
  if (input.confirmNumber.trim().toUpperCase() !== inv.number.toUpperCase()) throw new OpsError("invalid", `To confirm, type the invoice number exactly: ${inv.number}`);
  return db.transaction(async (tx) => {
    const r = await removeInvoices(tx, [inv.id]);
    await audit(tx, actor, { action: "billing.invoice_delete", entityType: "invoice", entityId: inv.id, summary: `Permanently deleted invoice ${inv.number} and ${r.payments} payment record(s)` });
    return { number: inv.number, familyId: inv.familyId };
  });
}

/** For the confirmation: what deleting a family's test data would remove. */
export async function familyTestDataCounts(db: DB, familyId: string) {
  const [b] = await db.select({ n: sql<number>`count(*)::int` }).from(bookings).where(eq(bookings.familyId, familyId));
  const [i] = await db.select({ n: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.familyId, familyId));
  const [p] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.familyId, familyId), eq(payments.status, "succeeded")));
  const [s] = await db.select({ n: sql<number>`count(*)::int` }).from(spaceReservationGroups).where(eq(spaceReservationGroups.familyId, familyId));
  return { bookings: b.n, invoices: i.n, paidPayments: p.n, spaceReservations: s.n };
}
