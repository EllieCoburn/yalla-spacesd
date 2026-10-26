"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { randomToken } from "@/lib/auth/crypto";
import { getDb } from "@/lib/db";
import { bookings, invoices, payments } from "@/lib/db/schema";
import { paymentsStatus, signTestPayload } from "@/lib/payments/provider";
import { testPaymentsAllowed } from "@/lib/payments/test-mode";
import { requestContext } from "../../../portal/session";

/**
 * The sandbox checkout sends a signed event to our own webhook endpoint over HTTP, so the same
 * verification and idempotency path as a real provider runs.
 */
export async function simulatePayment(form: FormData) {
  const checkoutRef = String(form.get("checkoutRef") ?? "");
  const outcome = String(form.get("outcome") ?? "");
  if (paymentsStatus().provider !== "test" || !testPaymentsAllowed()) redirect("/book");
  const db = getDb();
  const [p] = await db.select().from(payments).where(eq(payments.checkoutRef, checkoutRef));
  if (!p) redirect("/book");
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, p.invoiceId));
  const [b] = inv.bookingId ? await db.select().from(bookings).where(eq(bookings.id, inv.bookingId)) : [];
  const evtId = `evt_test_${randomToken(10)}`;
  const event =
    outcome === "decline"
      ? { id: evtId, type: "payment.failed", checkoutRef, reason: "Card declined (test)" }
      : { id: evtId, type: "payment.succeeded", checkoutRef, providerRef: `pi_test_${randomToken(10)}`, amountCents: p.amountCents };
  const body = JSON.stringify(event);
  const { baseUrl } = await requestContext();
  const send = () =>
    fetch(`${baseUrl}/api/webhooks/test`, { method: "POST", headers: { "Content-Type": "application/json", "x-yalla-test-signature": signTestPayload(body) }, body, cache: "no-store" });
  await send();
  // Development aid: deliver the identical event again to show duplicates are ignored.
  if (outcome === "duplicate" && process.env.NODE_ENV !== "production") await send();
  redirect(b ? `/book/confirmation/${b.reference}` : `/pay/complete?invoice=${encodeURIComponent(inv.number)}`);
}
