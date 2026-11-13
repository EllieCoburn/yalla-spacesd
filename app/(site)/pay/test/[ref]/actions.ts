"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { randomToken } from "@/lib/auth/crypto";
import { getDb } from "@/lib/db";
import { bookings, invoices, payments, playPassSubscriptions, spaceReservationGroups } from "@/lib/db/schema";
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
  const [space] = inv.spaceGroupId ? await db.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, inv.spaceGroupId)) : [];
  redirect(
    b
      ? `/book/confirmation/${b.reference}`
      : space
        ? `/portal/spaces/confirmation/${space.reference}${outcome === "decline" ? "?cancelled=1" : ""}`
        : `/pay/complete?invoice=${encodeURIComponent(inv.number)}`,
  );
}

/** Test stand-in for completing a Play Pass subscription checkout, via signed webhooks. */
export async function simulateMembership(form: FormData) {
  const checkoutRef = String(form.get("checkoutRef") ?? "");
  const outcome = String(form.get("outcome") ?? "");
  if (paymentsStatus().provider !== "test" || !testPaymentsAllowed()) redirect("/play-passes");
  const db = getDb();
  const [sub] = await db.select().from(playPassSubscriptions).where(eq(playPassSubscriptions.checkoutRef, checkoutRef));
  if (!sub) redirect("/play-passes");
  // Stripe keeps a declined card on its checkout page; nothing is created.
  if (outcome === "decline") redirect(`/play-passes/join?declined=1`);
  const { baseUrl } = await requestContext();
  const subscriptionRef = sub.subscriptionRef ?? `tsubref_${randomToken(10)}`;
  const send = async (event: Record<string, unknown>) => {
    const body = JSON.stringify(event);
    await fetch(`${baseUrl}/api/webhooks/test`, { method: "POST", headers: { "Content-Type": "application/json", "x-yalla-test-signature": signTestPayload(body) }, body, cache: "no-store" });
  };
  const completed = { id: `evt_test_${randomToken(10)}`, type: "membership.checkout_completed", checkoutRef, customerRef: `tcus_${sub.familyId.slice(0, 8)}`, subscriptionRef, localId: sub.id };
  const paid = { id: `evt_test_${randomToken(10)}`, type: "membership.invoice_paid", invoiceRef: `tin_${randomToken(10)}`, subscriptionRef, localId: sub.id, amountCents: sub.initialChargeCents, reason: "initial", chargeRef: `tpi_${randomToken(10)}` };
  await send(completed);
  await send(paid);
  if (outcome === "duplicate" && process.env.NODE_ENV !== "production") await send(paid);
  redirect(`/play-passes/welcome?ref=${sub.id}`);
}
