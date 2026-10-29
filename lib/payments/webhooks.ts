/**
 * Payment webhook processing.
 *
 * - Signatures are verified by the provider adapter before anything else.
 * - Each provider event id is recorded once; duplicates are acknowledged without side effects.
 * - Payment status changes only from verified provider events, never from a success page.
 * - A payment that arrives after its checkout hold expired re-checks capacity; if the spots are
 *   gone the booking is flagged for staff rather than overbooked.
 */
import { eq, sql } from "drizzle-orm";
import { audit, type Actor } from "@/lib/audit";
import type { DB } from "@/lib/db";
import { bookings, invoices, payments, refunds, spaceReservationGroups, webhookEvents } from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { refreshInvoiceStatus, invoiceTotals, usd } from "@/lib/ops/billing";
import { confirmBooking } from "@/lib/ops/bookings";
import { confirmSpaceGroup } from "@/lib/spaces/engine";
import { fmtDateTime } from "@/lib/time";
import type { NormalizedEvent, PaymentProvider } from "./provider";

const WEBHOOK: Actor = { type: "webhook", name: "Payment provider" };

export type WebhookResult = { status: number; body: string };

export async function handleWebhook(db: DB, provider: PaymentProvider, rawBody: string, headers: Headers): Promise<WebhookResult> {
  let evt: NormalizedEvent;
  try {
    evt = provider.parseWebhook(rawBody, headers);
  } catch {
    return { status: 400, body: "Invalid signature" };
  }
  return processEvent(db, provider.name, evt);
}

export async function processEvent(db: DB, providerName: string, evt: NormalizedEvent): Promise<WebhookResult> {
  // Claim the event id. If it already exists and was processed, it's a duplicate.
  const claimed = await db.transaction(async (tx) => {
    await tx.insert(webhookEvents).values({ id: evt.id, provider: providerName, type: evt.type }).onConflictDoNothing();
    const [row] = await tx.select().from(webhookEvents).where(eq(webhookEvents.id, evt.id)).for("update");
    if (row.status === "processed" || row.status === "ignored") return false;
    return true;
  });
  if (!claimed) return { status: 200, body: "Duplicate event ignored" };

  try {
    const outcome = await apply(db, evt);
    await db.update(webhookEvents).set({ status: outcome === "ignored" ? "ignored" : "processed", processedAt: new Date(), error: null }).where(eq(webhookEvents.id, evt.id));
    return { status: 200, body: outcome };
  } catch (e) {
    await db.update(webhookEvents).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(webhookEvents.id, evt.id));
    // Non-2xx so the provider retries.
    return { status: 500, body: "Processing failed" };
  }
}

async function apply(db: DB, evt: NormalizedEvent): Promise<string> {
  switch (evt.type) {
    case "payment.succeeded": {
      const changed = await db.transaction(async (tx) => {
        const [p] = await tx.select().from(payments).where(eq(payments.checkoutRef, evt.checkoutRef)).for("update");
        if (!p) throw new Error(`Unknown checkout ${evt.checkoutRef}`);
        if (p.status === "succeeded") return null;
        if (evt.amountCents && evt.amountCents !== p.amountCents) {
          await audit(tx, WEBHOOK, { action: "billing.amount_mismatch", entityType: "invoice", entityId: p.invoiceId, summary: `Provider reported ${usd(evt.amountCents)} for a ${usd(p.amountCents)} checkout` });
        }
        await tx
          .update(payments)
          .set({ status: "succeeded", providerRef: evt.providerRef, amountCents: evt.amountCents || p.amountCents, succeededAt: new Date(), failureReason: null })
          .where(eq(payments.id, p.id));
        await audit(tx, WEBHOOK, { action: "billing.payment_succeeded", entityType: "invoice", entityId: p.invoiceId, summary: `Payment of ${usd(evt.amountCents || p.amountCents)} succeeded` });
        await refreshInvoiceStatus(tx, p.invoiceId);
        return p;
      });
      // On a retried event the payment may already be recorded while the booking step failed;
      // confirming is idempotent, so always finish it.
      const [pay] = changed ? [changed] : await db.select().from(payments).where(eq(payments.checkoutRef, evt.checkoutRef));
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, pay.invoiceId));
      if (inv.bookingId) await confirmBooking(db, WEBHOOK, inv.bookingId, { reason: "Payment verified by provider" });
      if (inv.spaceGroupId) await confirmSpaceGroup(db, WEBHOOK, inv.spaceGroupId, { reason: "Payment verified by provider" });
      if (!changed) return "already processed";
      const t = (await invoiceTotals(db, [inv.id])).get(inv.id)!;
      await notifyFamily(db, {
        key: "payment_receipt",
        familyId: inv.familyId,
        vars: { invoice_number: inv.number, amount: usd(changed.amountCents), paid_at: fmtDateTime(new Date()), line_items: inv.description ?? "", balance: usd(Math.max(t.balance, 0)) },
        related: { type: "invoice", id: inv.id },
      });
      return "payment recorded";
    }
    case "payment.failed": {
      const res = await db.transaction(async (tx) => {
        const [p] = await tx.select().from(payments).where(eq(payments.checkoutRef, evt.checkoutRef)).for("update");
        if (!p) throw new Error(`Unknown checkout ${evt.checkoutRef}`);
        if (p.status !== "pending") return null;
        await tx.update(payments).set({ status: "failed", failureReason: evt.reason, failedAt: new Date() }).where(eq(payments.id, p.id));
        await audit(tx, WEBHOOK, { action: "billing.payment_failed", entityType: "invoice", entityId: p.invoiceId, summary: `Payment failed: ${evt.reason}` });
        return p;
      });
      if (!res) return "no change";
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, res.invoiceId));
      const [b] = inv.bookingId ? await db.select().from(bookings).where(eq(bookings.id, inv.bookingId)) : [];
      // The hold keeps running; the family can retry until it expires.
      if (b && b.status === "pending_payment") await db.update(bookings).set({ status: "held" }).where(eq(bookings.id, b.id));
      if (inv.spaceGroupId)
        await db
          .update(spaceReservationGroups)
          .set({ status: "held" })
          .where(sql`${spaceReservationGroups.id} = ${inv.spaceGroupId} AND ${spaceReservationGroups.status} = 'pending_payment'`);
      await notifyFamily(db, {
        key: "payment_failed",
        familyId: inv.familyId,
        vars: { invoice_number: inv.number, amount: usd(res.amountCents), reason: evt.reason, hold_until: b?.holdExpiresAt ? fmtDateTime(b.holdExpiresAt) : "—" },
        related: { type: "invoice", id: inv.id },
      });
      return "failure recorded";
    }
    case "checkout.expired": {
      await db.update(payments).set({ status: "cancelled" }).where(sql`${payments.checkoutRef} = ${evt.checkoutRef} AND ${payments.status} = 'pending'`);
      return "checkout expired";
    }
    case "refund.updated": {
      const [r] = await db.select().from(refunds).where(eq(refunds.providerRef, evt.refundRef));
      if (!r || r.status === evt.status) return "no change";
      await db.update(refunds).set({ status: evt.status, failureReason: evt.reason ?? null, completedAt: new Date() }).where(eq(refunds.id, r.id));
      await audit(db, WEBHOOK, { action: `billing.refund_${evt.status}`, entityType: "invoice", entityId: r.invoiceId, summary: `Refund ${evt.status} (${usd(r.amountCents)})` });
      await refreshInvoiceStatus(db, r.invoiceId);
      return "refund updated";
    }
    case "dispute.updated": {
      const [p] = await db.select().from(payments).where(eq(payments.providerRef, evt.paymentRef));
      if (!p) return "ignored";
      await db.update(payments).set({ disputeStatus: evt.status }).where(eq(payments.id, p.id));
      await audit(db, WEBHOOK, { action: "billing.dispute", entityType: "invoice", entityId: p.invoiceId, summary: `Payment dispute: ${evt.status}` });
      return "dispute recorded";
    }
    default:
      return "ignored";
  }
}
