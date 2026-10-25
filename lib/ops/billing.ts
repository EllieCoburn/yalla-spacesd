/**
 * Billing ledger.
 *
 * Amounts are derived, never stored as a single mutable "balance":
 *   total     = Σ invoice lines (charges, fees, tax, minus discounts, ± adjustments)
 *   paid      = Σ succeeded payments (card / offline)
 *   credit    = Σ succeeded credit applications
 *   refunded  = Σ succeeded refunds
 *   balance   = total − paid − credit + refunded
 * Corrections are new adjustment lines or refund rows. Settled history is never rewritten.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { credits, invoiceLines, invoices, payments, refunds } from "@/lib/db/schema";
import { providerFor } from "@/lib/payments/provider";
import { randomToken } from "@/lib/auth/crypto";
import { getPolicy } from "./settings";

export const usd = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type InvoiceTotals = {
  invoiceId: string;
  charges: number;
  discounts: number;
  tax: number;
  adjustments: number;
  total: number;
  paid: number;
  creditApplied: number;
  refunded: number;
  balance: number;
};

export async function invoiceTotals(db: Executor, invoiceIds: string[]): Promise<Map<string, InvoiceTotals>> {
  const out = new Map<string, InvoiceTotals>();
  if (!invoiceIds.length) return out;
  for (const id of invoiceIds) out.set(id, { invoiceId: id, charges: 0, discounts: 0, tax: 0, adjustments: 0, total: 0, paid: 0, creditApplied: 0, refunded: 0, balance: 0 });
  const lines = await db
    .select({ invoiceId: invoiceLines.invoiceId, kind: invoiceLines.kind, amount: sql<number>`sum(${invoiceLines.amountCents})::int` })
    .from(invoiceLines)
    .where(inArray(invoiceLines.invoiceId, invoiceIds))
    .groupBy(invoiceLines.invoiceId, invoiceLines.kind);
  for (const l of lines) {
    const t = out.get(l.invoiceId)!;
    if (l.kind === "charge" || l.kind === "fee") t.charges += l.amount;
    else if (l.kind === "discount") t.discounts += l.amount;
    else if (l.kind === "tax") t.tax += l.amount;
    else t.adjustments += l.amount;
  }
  const pays = await db
    .select({ invoiceId: payments.invoiceId, method: payments.method, amount: sql<number>`sum(${payments.amountCents})::int` })
    .from(payments)
    .where(and(inArray(payments.invoiceId, invoiceIds), eq(payments.status, "succeeded")))
    .groupBy(payments.invoiceId, payments.method);
  for (const p of pays) {
    const t = out.get(p.invoiceId)!;
    if (p.method === "credit") t.creditApplied += p.amount;
    else t.paid += p.amount;
  }
  const refs = await db
    .select({ invoiceId: refunds.invoiceId, amount: sql<number>`sum(${refunds.amountCents})::int` })
    .from(refunds)
    .where(and(inArray(refunds.invoiceId, invoiceIds), eq(refunds.status, "succeeded")))
    .groupBy(refunds.invoiceId);
  for (const r of refs) out.get(r.invoiceId)!.refunded += r.amount;
  for (const t of out.values()) {
    t.total = t.charges + t.discounts + t.tax + t.adjustments;
    t.balance = t.total - t.paid - t.creditApplied + t.refunded;
  }
  return out;
}

async function nextInvoiceNumber(db: Executor) {
  const [r] = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int + 1001 AS n FROM invoices`);
  return `INV-${r.n}-${randomToken(2).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
}

export type LineInput = { kind: "charge" | "discount" | "fee" | "tax" | "adjustment"; description: string; quantity?: number; unitCents: number; bookingItemId?: string | null };

export async function createInvoice(
  db: Executor,
  actor: Actor,
  input: { familyId: string; bookingId?: string | null; membershipId?: string | null; description: string; dueOn?: string | null; periodStart?: string | null; periodEnd?: string | null; lines: LineInput[] },
) {
  const [inv] = await db
    .insert(invoices)
    .values({
      number: await nextInvoiceNumber(db),
      familyId: input.familyId,
      bookingId: input.bookingId ?? null,
      membershipId: input.membershipId ?? null,
      description: input.description,
      dueOn: input.dueOn ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      status: "open",
    })
    .returning();
  const taxPercent = await getPolicy(db, "billing.taxPercent");
  const lines = [...input.lines];
  if (taxPercent > 0) {
    const taxable = lines.filter((l) => l.kind !== "tax").reduce((s, l) => s + (l.quantity ?? 1) * l.unitCents, 0);
    if (taxable > 0) lines.push({ kind: "tax", description: `Tax (${taxPercent}%)`, unitCents: Math.round((taxable * taxPercent) / 100) });
  }
  if (lines.length)
    await db.insert(invoiceLines).values(
      lines.map((l) => ({
        invoiceId: inv.id,
        kind: l.kind,
        description: l.description,
        quantity: l.quantity ?? 1,
        unitCents: l.unitCents,
        amountCents: (l.quantity ?? 1) * l.unitCents,
        bookingItemId: l.bookingItemId ?? null,
        createdBy: actor.name,
      })),
    );
  await audit(db, actor, { action: "billing.invoice_create", entityType: "invoice", entityId: inv.id, summary: `Created invoice ${inv.number}` });
  await refreshInvoiceStatus(db, inv.id);
  return inv;
}

/** Recomputes paid/open from the ledger. Void invoices stay void. */
export async function refreshInvoiceStatus(db: Executor, invoiceId: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.status === "void" || inv.status === "draft" || inv.status === "uncollectible") return inv;
  const t = (await invoiceTotals(db, [invoiceId])).get(invoiceId)!;
  const status = t.total > 0 && t.balance <= 0 ? "paid" : t.total <= 0 && t.paid === 0 ? "paid" : "open";
  if (status !== inv.status) await db.update(invoices).set({ status, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
  return { ...inv, status };
}

export async function addAdjustment(db: Executor, actor: Actor, invoiceId: string, amountCents: number, description: string) {
  if (!description.trim()) throw new OpsError("invalid", "Describe the adjustment.");
  if (!amountCents) throw new OpsError("invalid", "Enter an amount.");
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.status === "void") throw new OpsError("invalid", "This invoice can’t be adjusted.");
  await db.insert(invoiceLines).values({ invoiceId, kind: "adjustment", description, unitCents: amountCents, amountCents, createdBy: actor.name });
  await audit(db, actor, { action: "billing.adjustment", entityType: "invoice", entityId: invoiceId, summary: `Adjustment ${usd(amountCents)} on ${inv.number}: ${description}` });
  return refreshInvoiceStatus(db, invoiceId);
}

export async function voidInvoice(db: Executor, actor: Actor, invoiceId: string, reason: string) {
  const t = (await invoiceTotals(db, [invoiceId])).get(invoiceId)!;
  if (t.paid || t.creditApplied) throw new OpsError("has_payments", "This invoice has payments. Refund or adjust instead of voiding.");
  const [inv] = await db.update(invoices).set({ status: "void", updatedAt: new Date() }).where(eq(invoices.id, invoiceId)).returning();
  await audit(db, actor, { action: "billing.void", entityType: "invoice", entityId: invoiceId, summary: `Voided ${inv.number}: ${reason}` });
}

export async function recordOfflinePayment(
  db: Executor,
  actor: Actor,
  input: { invoiceId: string; amountCents: number; method: "offline_cash" | "offline_check" | "offline_other"; note: string; idempotencyKey: string },
) {
  if (input.amountCents <= 0) throw new OpsError("invalid", "Enter a positive amount.");
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId));
  if (!inv || inv.status === "void") throw new OpsError("invalid", "Invoice not found or void.");
  const inserted = await db
    .insert(payments)
    .values({
      invoiceId: inv.id,
      familyId: inv.familyId,
      amountCents: input.amountCents,
      method: input.method,
      status: "succeeded",
      provider: "offline",
      providerRef: input.note.slice(0, 200),
      idempotencyKey: input.idempotencyKey,
      recordedBy: actor.name,
      succeededAt: new Date(),
    })
    .onConflictDoNothing({ target: payments.idempotencyKey })
    .returning();
  if (!inserted.length) return null; // duplicate submit
  await audit(db, actor, { action: "billing.offline_payment", entityType: "invoice", entityId: inv.id, summary: `Recorded ${usd(input.amountCents)} ${input.method.replace("offline_", "")} payment on ${inv.number}` });
  await refreshInvoiceStatus(db, inv.id);
  return inserted[0];
}

export async function creditBalance(db: Executor, familyId: string) {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${credits.amountCents}), 0)::int` }).from(credits).where(eq(credits.familyId, familyId));
  return r.n;
}

export async function grantCredit(db: Executor, actor: Actor, familyId: string, amountCents: number, reason: string) {
  if (amountCents <= 0) throw new OpsError("invalid", "Enter a positive amount.");
  if (!reason.trim()) throw new OpsError("invalid", "Give a reason for the credit.");
  await db.insert(credits).values({ familyId, amountCents, reason, createdBy: actor.name });
  await audit(db, actor, { action: "billing.credit_grant", entityType: "family", entityId: familyId, summary: `Granted ${usd(amountCents)} credit: ${reason}` });
}

export async function applyCredit(db: Executor, actor: Actor, invoiceId: string, amountCents: number, idempotencyKey: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new OpsError("invalid", "Invoice not found.");
  const available = await creditBalance(db, inv.familyId);
  const t = (await invoiceTotals(db, [invoiceId])).get(invoiceId)!;
  if (amountCents <= 0 || amountCents > available) throw new OpsError("invalid", `The family has ${usd(available)} credit available.`);
  if (amountCents > t.balance) throw new OpsError("invalid", `The invoice balance is ${usd(t.balance)}.`);
  const inserted = await db
    .insert(payments)
    .values({ invoiceId, familyId: inv.familyId, amountCents, method: "credit", status: "succeeded", provider: "credit", idempotencyKey, recordedBy: actor.name, succeededAt: new Date() })
    .onConflictDoNothing({ target: payments.idempotencyKey })
    .returning();
  if (!inserted.length) return;
  await db.insert(credits).values({ familyId: inv.familyId, amountCents: -amountCents, reason: `Applied to ${inv.number}`, invoiceId, createdBy: actor.name });
  await audit(db, actor, { action: "billing.credit_apply", entityType: "invoice", entityId: invoiceId, summary: `Applied ${usd(amountCents)} credit to ${inv.number}` });
  await refreshInvoiceStatus(db, invoiceId);
}

/**
 * Refunds go to the provider first; the refund row records each step so a failure partway
 * through is visible and retryable with the same idempotency key (no double refunds).
 */
export async function refundPayment(
  db: Executor,
  actor: Actor,
  input: { paymentId: string; amountCents: number; reason: string; reduceAmountOwed: boolean; idempotencyKey: string },
) {
  const [p] = await db.select().from(payments).where(eq(payments.id, input.paymentId));
  if (!p || p.status !== "succeeded") throw new OpsError("invalid", "Only successful payments can be refunded.");
  if (!input.reason.trim()) throw new OpsError("invalid", "Give a reason for the refund.");
  const existing = await db.select().from(refunds).where(eq(refunds.idempotencyKey, input.idempotencyKey));
  if (existing[0]?.status === "succeeded") return existing[0];
  const [{ refunded }] = await db
    .select({ refunded: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, p.id), inArray(refunds.status, ["succeeded", "pending"]), sql`${refunds.idempotencyKey} <> ${input.idempotencyKey}`));
  if (input.amountCents <= 0 || input.amountCents > p.amountCents - refunded)
    throw new OpsError("invalid", `You can refund up to ${usd(p.amountCents - refunded)} of this payment.`);

  let refund = existing[0];
  if (!refund) {
    [refund] = await db
      .insert(refunds)
      .values({ paymentId: p.id, invoiceId: p.invoiceId, amountCents: input.amountCents, status: "pending", reason: input.reason, idempotencyKey: input.idempotencyKey, requestedBy: actor.name })
      .returning();
    await audit(db, actor, { action: "billing.refund_requested", entityType: "invoice", entityId: p.invoiceId, summary: `Requested ${usd(input.amountCents)} refund: ${input.reason}` });
  }

  if (p.method === "credit") {
    // Credit applications are reversed back to the family's credit balance.
    await db.insert(credits).values({ familyId: p.familyId, amountCents: input.amountCents, reason: `Reversed credit: ${input.reason}`, invoiceId: p.invoiceId, createdBy: actor.name });
    [refund] = await db.update(refunds).set({ status: "succeeded", completedAt: new Date() }).where(eq(refunds.id, refund.id)).returning();
  } else if (p.provider === "offline") {
    // Offline refunds are recorded as given by staff (cash/check returned).
    [refund] = await db.update(refunds).set({ status: "succeeded", completedAt: new Date(), providerRef: "offline" }).where(eq(refunds.id, refund.id)).returning();
  } else {
    let result: Awaited<ReturnType<ReturnType<typeof providerFor>["refund"]>>;
    try {
      result = await providerFor(p.provider).refund({ providerRef: p.providerRef!, amountCents: input.amountCents, idempotencyKey: input.idempotencyKey, reason: input.reason });
    } catch (e) {
      result = { status: "failed", failureReason: (e as Error).message };
    }
    [refund] = await db
      .update(refunds)
      .set({
        status: result.status,
        providerRef: result.providerRef ?? refund.providerRef,
        failureReason: result.failureReason ?? null,
        completedAt: result.status === "pending" ? null : new Date(),
      })
      .where(eq(refunds.id, refund.id))
      .returning();
  }

  if (refund.status === "failed") {
    await audit(db, actor, { action: "billing.refund_failed", entityType: "invoice", entityId: p.invoiceId, summary: `Refund of ${usd(input.amountCents)} failed: ${refund.failureReason}` });
    throw new OpsError("refund_failed", `The refund didn’t go through: ${refund.failureReason}. Nothing was changed on the invoice. You can retry.`, { refundId: refund.id });
  }
  if (refund.status === "succeeded") {
    if (input.reduceAmountOwed)
      await db.insert(invoiceLines).values({ invoiceId: p.invoiceId, kind: "adjustment", description: `Refund adjustment: ${input.reason}`, unitCents: -input.amountCents, amountCents: -input.amountCents, createdBy: actor.name });
    await audit(db, actor, { action: "billing.refund", entityType: "invoice", entityId: p.invoiceId, summary: `Refunded ${usd(input.amountCents)}${input.reduceAmountOwed ? " and reduced the amount owed" : ""}: ${input.reason}` });
    await refreshInvoiceStatus(db, p.invoiceId);
  }
  return refund;
}

export async function familyLedger(db: Executor, familyId: string) {
  const invs = await db.select().from(invoices).where(eq(invoices.familyId, familyId)).orderBy(desc(invoices.issuedAt));
  const totals = await invoiceTotals(
    db,
    invs.map((i) => i.id),
  );
  const outstanding = invs.filter((i) => i.status === "open").reduce((s, i) => s + Math.max(totals.get(i.id)!.balance, 0), 0);
  return { invoices: invs.map((i) => ({ ...i, totals: totals.get(i.id)! })), outstanding, credit: await creditBalance(db, familyId) };
}
