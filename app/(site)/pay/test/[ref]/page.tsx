import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Mark } from "@/components/brand/Mark";
import { getDb, isDbConfigured } from "@/lib/db";
import { bookings, invoiceLines, invoices, payments, spaceReservationGroups } from "@/lib/db/schema";
import { bookingLines, describeLine } from "@/lib/ops/bookings";
import { paymentsStatus } from "@/lib/payments/provider";
import { testPaymentsAllowed } from "@/lib/payments/test-mode";
import { fmtDateTime } from "@/lib/time";
import { simulatePayment } from "./actions";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function TestCheckout({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!isDbConfigured() || paymentsStatus().provider !== "test") notFound();
  if (!testPaymentsAllowed())
    return (
      <section className="shell pt-40 pb-32 text-center">
        <h1 className="display text-[2.4rem]">Online payments aren’t enabled yet.</h1>
        <p className="mt-4 text-ink-soft">Please contact Yalla to complete your booking.</p>
      </section>
    );
  const db = getDb();
  const [p] = await db.select().from(payments).where(eq(payments.checkoutRef, ref));
  if (!p) notFound();
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, p.invoiceId));
  const [b] = inv.bookingId ? await db.select().from(bookings).where(eq(bookings.id, inv.bookingId)) : [];
  const lines = b ? (await bookingLines(db, b.id)).filter((r) => r.item.status === "held" || r.item.status === "confirmed") : [];
  const [space] = inv.spaceGroupId ? await db.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, inv.spaceGroupId)) : [];
  const spaceLines = space ? await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)) : [];

  return (
    <section className="pt-32 pb-28 lg:pt-40">
      <div className="shell">
        <div className="mx-auto max-w-lg">
          <div className="mb-6 flex items-center gap-3 border border-dashed border-oxblood/50 bg-oxblood/[0.04] px-4 py-3 text-[0.82rem] text-oxblood">
            <span className="eyebrow text-[0.6rem]">Test checkout</span>
            <span>No card is charged and no money moves. This stands in for the payment provider.</span>
          </div>
          <div className="bg-paper p-8 sm:p-10">
            <Mark name="window" className="h-9 w-auto text-blue" />
            <p className="eyebrow mt-6 text-ink-soft">{space ? `Workspace ${space.reference}` : `Booking ${b?.reference}`}</p>
            <p className="display mt-3 text-[2.6rem]">{usd(p.amountCents)}</p>
            <ul className="mt-6 divide-y divide-line border-y border-line text-[0.9rem]">
              {lines.map((r) => (
                <li key={r.item.id} className="py-3">
                  {describeLine(r)}
                </li>
              ))}
              {spaceLines.map((l) => (
                <li key={l.id} className="py-3">
                  {l.description}
                </li>
              ))}
            </ul>
            {b?.holdExpiresAt ? <p className="mt-4 text-[0.8rem] text-ink-soft">Spots held until {fmtDateTime(b.holdExpiresAt)}.</p> : null}
            {space?.holdExpiresAt ? <p className="mt-4 text-[0.8rem] text-ink-soft">Held until {fmtDateTime(space.holdExpiresAt)}.</p> : null}
            {p.status !== "pending" ? (
              <p className="mt-6 text-[0.9rem] text-ink-soft">This checkout is {p.status === "succeeded" ? "already paid" : p.status}.</p>
            ) : (
              <form action={simulatePayment} className="mt-8 space-y-3">
                <input type="hidden" name="checkoutRef" value={ref} />
                <button name="outcome" value="pay" className="h-14 w-full rounded-full bg-ink text-[0.95rem] text-chalk transition-colors hover:bg-blue">
                  Pay {usd(p.amountCents)} (test)
                </button>
                <button name="outcome" value="decline" className="h-12 w-full rounded-full border border-ink/25 text-[0.9rem] transition-colors hover:border-ink">
                  Simulate a declined payment
                </button>
                {process.env.NODE_ENV !== "production" ? (
                  <button name="outcome" value="duplicate" className="w-full pt-2 text-[0.78rem] text-ink-soft underline underline-offset-4">
                    Pay and send a duplicate notification (development)
                  </button>
                ) : null}
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
