import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { invoiceTotals, usd } from "@/lib/ops/billing";
import { Mark } from "@/components/brand/Mark";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Shown after paying an invoice link. Status comes from the database (verified by webhook), never from this page. */
export default async function PayComplete({ searchParams }: { searchParams: Promise<{ invoice?: string; cancelled?: string }> }) {
  const sp = await searchParams;
  const inv = isDbConfigured() && sp.invoice ? (await getDb().select().from(invoices).where(eq(invoices.number, sp.invoice)))[0] : undefined;
  const t = inv ? (await invoiceTotals(getDb(), [inv.id])).get(inv.id) : undefined;
  const paid = inv?.status === "paid";
  return (
    <section className="flex min-h-[70vh] items-center justify-center px-6 pt-32 pb-20">
      <div className="max-w-md text-center">
        <Mark name={paid ? "sun" : "arch"} className="mx-auto h-12 w-auto text-blue" />
        <h1 className="display mt-8 text-[2.4rem]">{!inv ? "Payment" : paid ? "Thank you." : sp.cancelled ? "Payment not completed" : "Confirming your payment…"}</h1>
        <p className="mt-4 text-ink-soft">
          {!inv
            ? "We couldn’t find that invoice. Please use the link in your email."
            : paid
              ? `Invoice ${inv.number} is paid. A receipt is on its way.`
              : sp.cancelled
                ? `Nothing was charged. Invoice ${inv.number} still has ${usd(Math.max(t?.balance ?? 0, 0))} due.`
                : "This usually takes a few seconds. Refresh this page in a moment."}
        </p>
      </div>
    </section>
  );
}
