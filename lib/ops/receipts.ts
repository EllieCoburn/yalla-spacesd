/**
 * The payment receipt families get by email: what they paid for, every service and extra on its
 * own line, each discount or coupon broken out, and how it was paid.
 */
import { asc, eq } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { invoiceLines, invoices } from "@/lib/db/schema";
import { fmtDateTime } from "@/lib/time";
import { invoiceTotals, usd } from "./billing";
import { checkoutLabel } from "./bookings";

const money = (cents: number) => (cents < 0 ? "−" + usd(-cents) : usd(cents));

export async function receiptVars(db: Executor, invoiceId: string, opts: { paidCents: number; paidAt?: Date; baseUrl: string }) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.createdAt));
  const t = (await invoiceTotals(db, [invoiceId])).get(invoiceId)!;
  // What the family paid for, in words they recognize ("Camp Yalla · Wed, Nov 25").
  const service = inv.bookingId ? (await checkoutLabel(db, inv.bookingId)).name : (inv.description ?? "your Yalla booking");

  const row = (l: (typeof lines)[number]) => {
    const qty = l.quantity > 1 ? ` (×${l.quantity})` : "";
    return `${l.description}${qty} | ${money(l.amountCents)}`;
  };
  const charges = lines.filter((l) => l.kind === "charge" || l.kind === "fee");
  const discounts = lines.filter((l) => l.kind === "discount");
  const other = lines.filter((l) => l.kind === "tax" || l.kind === "adjustment");
  const out: string[] = charges.map((l) => `$$ ${row(l)}`);
  if (discounts.length || other.length) out.push(`$$= Subtotal | ${money(charges.reduce((s, l) => s + l.amountCents, 0))}`);
  for (const l of discounts) out.push(`$$- ${row(l)}`);
  for (const l of other) out.push(`$$ ${row(l)}`);
  out.push(`$$= Total | ${money(t.total)}`);
  if (t.walletApplied) out.push(`$$- Paid from your Play Pass | ${money(-t.walletApplied)}`);
  if (t.creditApplied - t.walletApplied > 0) out.push(`$$- Paid from your Yalla Wallet credit | ${money(-(t.creditApplied - t.walletApplied))}`);
  if (opts.paidCents) out.push(`$$- Paid by card | ${money(-opts.paidCents)}`);
  if (t.paid - opts.paidCents > 0) out.push(`$$- Paid earlier | ${money(-(t.paid - opts.paidCents))}`);
  if (t.refunded) out.push(`$$ Refunded | ${money(t.refunded)}`);
  out.push(`$$= Remaining balance | ${money(Math.max(t.balance, 0))}`);

  return {
    service,
    invoice_number: inv.number,
    amount: usd(opts.paidCents),
    paid_at: fmtDateTime(opts.paidAt ?? new Date()),
    receipt: out.join("\n"),
    // Kept for templates edited in Admin before receipts were itemized.
    line_items: lines.map((l) => `• ${l.description}: ${money(l.amountCents)}`).join("\n"),
    balance: usd(Math.max(t.balance, 0)),
    book_link: `${opts.baseUrl}/book`,
  };
}
