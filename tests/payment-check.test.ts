/** The backup for Stripe's "paid" webhook: asking Stripe directly confirms a paid booking, once. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as s from "@/lib/db/schema";
import { createHold, startCheckout } from "@/lib/ops/bookings";
import { getPolicy } from "@/lib/ops/settings";
import { processEvent } from "@/lib/payments/webhooks";
import { db, family, owner, program, reset, session } from "./helpers";

// Stand in for Stripe: report "paid" for any checkout we ask about.
const stripeSays = vi.hoisted(() => ({ paid: true }));
vi.mock("@/lib/payments/provider", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/provider")>();
  return {
    ...real,
    providerFor: (name: string) =>
      name === "stripe"
        ? { checkPayment: async (ref: string) => (stripeSays.paid ? { id: `check:${ref}`, type: "payment.succeeded", checkoutRef: ref, providerRef: "pi_test_1", amountCents: 0 } : null) }
        : real.providerFor(name),
  };
});

beforeEach(reset);

async function paidOnStripeButNoWebhook() {
  const p = await program();
  const sess = await session(p.id, { capacity: 2 });
  const a = await family("Check");
  const hold = await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: sess.id, childId: a.children[0].id }], source: "public" });
  await startCheckout(db(), owner, hold.booking.id, { base: "http://localhost:3000" });
  // Pretend this checkout went to Stripe.
  await db().update(s.payments).set({ provider: "stripe", checkoutRef: "cs_test_backup" });
  return hold.booking;
}

describe("Checking Stripe directly", () => {
  it("confirms a booking Stripe says is paid, even if the webhook never came", async () => {
    const b = await paidOnStripeButNoWebhook();
    const { checkBookingPayment } = await import("@/lib/payments/check");
    await checkBookingPayment(db(), b.reference);
    const [after] = await db().select().from(s.bookings).where(eq(s.bookings.id, b.id));
    expect(after.status).toBe("confirmed");
    const [pay] = await db().select().from(s.payments);
    expect(pay.status).toBe("succeeded");
  });

  it("records it only once when Stripe's own webhook arrives afterwards", async () => {
    const b = await paidOnStripeButNoWebhook();
    const { checkPendingPayments } = await import("@/lib/payments/check");
    expect((await checkPendingPayments(db())).recorded).toBe(1);
    await processEvent(db(), "stripe", { id: "evt_real_webhook", type: "payment.succeeded", checkoutRef: "cs_test_backup", providerRef: "pi_test_1", amountCents: 0 });
    expect((await checkPendingPayments(db())).checked).toBe(0);
    const receipts = await db().select().from(s.messages).where(eq(s.messages.templateKey, "payment_receipt"));
    expect(receipts.length).toBeLessThanOrEqual(1);
    const [after] = await db().select().from(s.bookings).where(eq(s.bookings.id, b.id));
    expect(after.status).toBe("confirmed");
  });

  it("leaves an unpaid checkout alone", async () => {
    stripeSays.paid = false;
    const b = await paidOnStripeButNoWebhook();
    const { checkBookingPayment } = await import("@/lib/payments/check");
    await checkBookingPayment(db(), b.reference);
    const [after] = await db().select().from(s.bookings).where(eq(s.bookings.id, b.id));
    expect(after.status).toBe("pending_payment");
    stripeSays.paid = true;
  });

  it("holds spots for 35 minutes by default, longer than Stripe's 31-minute payment page", async () => {
    expect(await getPolicy(db(), "booking.holdMinutes")).toBe(35);
  });
});
