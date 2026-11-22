"use server";

import { redirect } from "next/navigation";
import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { requestMeta } from "@/lib/auth/session";
import {
  addAdjustment,
  applyCredit,
  grantCredit,
  invoiceDueCharges,
  recordOfflinePayment,
  refundPayment,
  saveDiscount,
  sendInvoicePaymentLink,
  skipScheduledCharge,
  voidInvoice,
  usd,
} from "@/lib/ops/billing";
import { todayLA } from "@/lib/time";
import { trustedBaseUrl } from "@/lib/base-url";

async function baseUrl() {
  return trustedBaseUrl((await requestMeta()).host);
}

const required = (v: number | null, label: string) => {
  if (v == null || v <= 0) throw new OpsError("invalid", `Enter ${label}.`);
  return v;
};

export const offlinePaymentAction = adminAction("billing.manage", async ({ db, actor, str, cents }) => {
  const method = str("method") as "offline_cash" | "offline_check" | "offline_other";
  if (!["offline_cash", "offline_check", "offline_other"].includes(method)) throw new OpsError("invalid", "Choose how it was paid.");
  if (!str("note")) throw new OpsError("invalid", "Add a reference (check number, receipt, who approved it).");
  const p = await recordOfflinePayment(db, actor, { invoiceId: str("invoiceId"), amountCents: required(cents("amount"), "the amount received"), method, note: str("note"), idempotencyKey: str("idempotencyKey") });
  return p ? `Recorded ${usd(p.amountCents)}.` : "That payment was already recorded.";
});

export const applyCreditAction = adminAction("billing.manage", async ({ db, actor, str, cents }) => {
  await applyCredit(db, actor, str("invoiceId"), required(cents("amount"), "an amount"), str("idempotencyKey"));
  return "Credit applied.";
});

export const refundAction = adminAction("billing.refund", async ({ db, actor, str, cents, bool }) => {
  const r = await refundPayment(db, actor, {
    paymentId: str("paymentId"),
    amountCents: required(cents("amount"), "the refund amount"),
    reason: str("reason"),
    reduceAmountOwed: bool("reduceAmountOwed"),
    idempotencyKey: str("idempotencyKey"),
  });
  return r.status === "pending" ? "Refund submitted — the provider is still processing it." : `Refunded ${usd(r.amountCents)}.`;
});

export const adjustmentAction = adminAction("billing.manage", async ({ db, actor, str, cents }) => {
  const amount = cents("amount");
  if (!amount) throw new OpsError("invalid", "Enter an amount (negative to reduce what’s owed).");
  await addAdjustment(db, actor, str("invoiceId"), amount, str("description"));
  return "Adjustment added.";
});

export const voidAction = adminAction("billing.manage", async ({ db, actor, str }) => {
  if (!str("reason")) throw new OpsError("invalid", "Give a reason for voiding.");
  await voidInvoice(db, actor, str("invoiceId"), str("reason"));
  return "Invoice voided.";
});

export const paymentLinkAction = adminAction("billing.manage", async ({ db, actor, str }) => {
  const res = await sendInvoicePaymentLink(db, actor, str("invoiceId"), await baseUrl());
  return { message: res.provider === "test" ? "Payment request captured (test mode — nothing was emailed). The family’s link uses the test checkout." : "Payment request sent.", data: res };
});

export const grantCreditAction = adminAction("billing.manage", async ({ db, actor, str, cents }) => {
  if (!str("familyId")) throw new OpsError("invalid", "Choose a family.");
  await grantCredit(db, actor, str("familyId"), required(cents("amount"), "an amount"), str("reason"));
  return "Credit granted.";
});

export const invoiceDueAction = adminAction("billing.manage", async ({ db, actor, str }) => {
  const through = /^\d{4}-\d{2}-\d{2}$/.test(str("through")) ? str("through") : todayLA();
  const r = await invoiceDueCharges(db, actor, through);
  return r.created ? `Created ${r.created} invoice${r.created === 1 ? "" : "s"}.` : "No charges were due — nothing new was invoiced.";
});

export const skipChargeAction = adminAction("billing.manage", async ({ db, actor, str }) => {
  await skipScheduledCharge(db, actor, str("chargeId"), str("reason"));
  return "Charge skipped.";
});

export const discountAction = adminAction("billing.manage", async ({ db, actor, str, num, cents, bool, all }) => {
  const kind = str("kind") === "fixed" ? "fixed" : "percent";
  await saveDiscount(db, actor, {
    id: str("id") || undefined,
    code: str("code") || null,
    name: str("name"),
    kind,
    value: kind === "fixed" ? (cents("value") ?? 0) : (num("value") ?? 0),
    programIds: all("programIds").filter(Boolean),
    active: bool("active"),
    startsOn: str("startsOn") || null,
    endsOn: str("endsOn") || null,
    maxUses: num("maxUses"),
    oncePerFamily: bool("oncePerFamily"),
    firstBookingOnly: bool("firstBookingOnly"),
  });
  return "Discount saved.";
});

/** Owners only: permanently delete one invoice (test data), then back to the invoice list. */
export const deleteInvoiceAction = adminAction("staff.manage", async ({ db, actor, staff, str }) => {
  if (staff.roleKey !== "owner") throw new OpsError("forbidden", "Only an owner can permanently delete an invoice.");
  const { deleteInvoicePermanently } = await import("@/lib/ops/test-data");
  await deleteInvoicePermanently(db, actor, { invoiceId: str("invoiceId"), confirmNumber: str("confirmNumber") });
  redirect("/admin/billing/invoices");
});
