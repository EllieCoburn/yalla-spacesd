/**
 * A backup for Stripe's "paid" webhook: ask Stripe directly about checkouts still waiting.
 *
 * Bookings are confirmed by Stripe's webhook. If that message is delayed or never arrives, a family
 * who paid would see "waiting for payment" and their hold could lapse. So when they land back on the
 * confirmation page (and in the daily housekeeping run, before holds expire) any pending Stripe
 * checkout is checked with Stripe, and a paid one is recorded through the very same path as the
 * webhook (processEvent), so it's only ever applied once.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { bookings, invoices, payments } from "@/lib/db/schema";
import { providerFor } from "./provider";
import { processEvent } from "./webhooks";

/** Checks pending Stripe checkouts (for one booking, or every recent one) and records any that were paid. */
export async function checkPendingPayments(db: DB, opts: { bookingId?: string; now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 3 * 24 * 3600_000);
  const rows = await db
    .select({ id: payments.id, checkoutRef: payments.checkoutRef })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(
        eq(payments.status, "pending"),
        eq(payments.provider, "stripe"),
        gte(payments.createdAt, since),
        opts.bookingId ? eq(invoices.bookingId, opts.bookingId) : undefined,
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(opts.limit ?? 50);
  let recorded = 0;
  for (const r of rows) {
    if (!r.checkoutRef) continue;
    try {
      const provider = providerFor("stripe");
      const evt = await provider.checkPayment?.(r.checkoutRef);
      if (!evt) continue;
      const res = await processEvent(db, "stripe", evt);
      if (res.status === 200) recorded++;
    } catch (e) {
      console.error("[payment check failed]", (e as Error).message?.slice(0, 160));
    }
  }
  return { checked: rows.length, recorded };
}

/** For the confirmation page: only bookings still waiting on a card payment. */
export async function checkBookingPayment(db: DB, reference: string) {
  const [b] = await db.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.reference, reference));
  if (!b || !["pending_payment", "held", "expired"].includes(b.status)) return;
  await checkPendingPayments(db, { bookingId: b.id, limit: 3 });
}

