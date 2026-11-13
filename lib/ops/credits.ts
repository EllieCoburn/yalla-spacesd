/**
 * Returning money when a reservation is cancelled (Policies & Terms → Canceling a reservation).
 *
 * - Family cancels 24+ hours ahead: what they paid comes back to their Yalla Wallet. Play Pass and
 *   credit funds return to where they came from; card payments become Yalla credit (24 months).
 *   No cash refunds.
 * - Yalla cancels: the family chooses Yalla credit plus 5%, or a full refund to the original
 *   payment method (lib/ops/yalla-cancellations.ts).
 */
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import { bookingItems, invoices, payments, refunds } from "@/lib/db/schema";
import { addonsFor } from "@/lib/booking/addons";
import { refundPayment } from "./billing";

/** What one booked item cost: its price plus its add-ons. */
export function itemValue(item: Pick<typeof bookingItems.$inferSelect, "priceCents" | "addons">, kind: string, slug: string) {
  return (item.priceCents ?? 0) + addonsFor(kind, slug).filter((a) => item.addons.includes(a.key)).reduce((s, a) => s + a.priceCents, 0);
}

/** How much of each successful payment on a booking can still be returned, wallet payments first. */
async function returnablePayments(db: Executor, opts: { bookingId?: string; invoiceIds?: string[] }) {
  const invs = opts.invoiceIds ?? (await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.bookingId, opts.bookingId!), ne(invoices.status, "void")))).map((i) => i.id);
  if (!invs.length) return [];
  const pays = await db
    .select()
    .from(payments)
    .where(and(inArray(payments.invoiceId, invs), eq(payments.status, "succeeded")))
    .orderBy(asc(payments.succeededAt));
  const out: { p: typeof payments.$inferSelect; left: number }[] = [];
  for (const p of pays) {
    const [{ back }] = await db
      .select({ back: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
      .from(refunds)
      .where(and(eq(refunds.paymentId, p.id), inArray(refunds.status, ["succeeded", "pending"])));
    if (p.amountCents - back > 0) out.push({ p, left: p.amountCents - back });
  }
  // Wallet and credit payments go back first; then card and offline payments.
  return out.sort((a, b) => Number(a.p.method !== "wallet" && a.p.method !== "credit") - Number(b.p.method !== "wallet" && b.p.method !== "credit"));
}

/** The total still returnable on a booking (or set of invoices). */
export async function returnableCents(db: Executor, opts: { bookingId?: string; invoiceIds?: string[] }) {
  return (await returnablePayments(db, opts)).reduce((s, r) => s + r.left, 0);
}

/**
 * Return up to `amountCents` of what was paid on a booking (or set of invoices).
 * `to: "wallet"` sends card payments to the Yalla Wallet as credit; `to: "original"` refunds them to
 * the card. Play Pass and credit funds always go back to the wallet. Idempotent per `key`.
 */
export async function returnPaid(
  db: DB,
  actor: Actor,
  input: { bookingId?: string; invoiceIds?: string[]; amountCents: number; key: string; reason: string; to: "wallet" | "original" },
) {
  let want = input.amountCents;
  let toWallet = 0;
  let toCard = 0;
  for (const { p, left } of await returnablePayments(db, input)) {
    if (want <= 0) break;
    const amount = Math.min(want, left);
    const walletish = p.method === "wallet" || p.method === "credit";
    await refundPayment(db, actor, {
      paymentId: p.id,
      amountCents: amount,
      reason: input.reason,
      reduceAmountOwed: true,
      idempotencyKey: `${input.key}:${p.id}`,
      toWallet: !walletish && input.to === "wallet",
    });
    if (walletish || input.to === "wallet") toWallet += amount;
    else toCard += amount;
    want -= amount;
  }
  return { toWallet, toCard, total: toWallet + toCard };
}
