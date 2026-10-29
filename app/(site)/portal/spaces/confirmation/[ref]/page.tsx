import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { ResumeCheckout } from "@/components/spaces/ReservationActions";
import { getDb, isDbConfigured } from "@/lib/db";
import { myReservation } from "@/lib/spaces/availability";
import { BOOKING_TYPE_LABEL, CATEGORY_LABEL } from "@/lib/spaces/config";
import { describeWhen } from "@/lib/spaces/engine";
import { getGuardian } from "../../../session";

export const metadata: Metadata = { title: "Your reservation", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

/**
 * Where checkout returns. The reservation is only shown as confirmed once the payment provider's
 * webhook has confirmed it — never because the family landed here.
 */
export default async function SpaceConfirmation({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { ref } = await params;
  const { cancelled } = await searchParams;
  if (!isDbConfigured()) notFound();
  const g = await getGuardian();
  if (!g) redirect(`/portal?signin=1&next=/portal/spaces/confirmation/${encodeURIComponent(ref)}`);
  const r = await myReservation(getDb(), g.familyId, ref);
  if (!r) notFound();
  const waiting = r.status === "held" || r.status === "pending_payment";
  const confirmed = r.status === "confirmed";

  return (
    <section className="pt-32 pb-28 lg:pt-40">
      {waiting && !cancelled ? <meta httpEquiv="refresh" content="4" /> : null}
      <div className="shell">
        <div className="mx-auto max-w-xl">
          <Mark name={confirmed ? "dotsun" : "window"} className="h-12 w-auto text-blue" />
          <h1 className="display mt-8 text-[clamp(2.4rem,1.8rem+2vw,3.6rem)]">
            {confirmed ? (
              <>
                Your space is <em>all yours.</em>
              </>
            ) : waiting && cancelled ? (
              <>
                Payment <em>not completed.</em>
              </>
            ) : waiting ? (
              <>
                Confirming your <em>payment…</em>
              </>
            ) : r.status === "needs_attention" ? (
              <>
                We’re <em>looking into it.</em>
              </>
            ) : (
              <>
                This reservation <em>isn’t active.</em>
              </>
            )}
          </h1>
          <p className="mt-5 text-ink-soft">
            {confirmed
              ? "We’ve saved it to your reservations."
              : waiting && cancelled
                ? "Your time is held for a few more minutes. You can finish paying, or let it go."
                : waiting
                  ? "This usually takes a few seconds. This page updates on its own."
                  : r.status === "needs_attention"
                    ? "Your payment arrived after the time was released, and it’s since been reserved. The Yalla team will be in touch to rebook or refund you."
                    : "It was cancelled or the hold expired. You’re welcome to book again."}
          </p>
          <dl className="mt-10 divide-y divide-line border-y border-line">
            {[
              ["Space", `${r.workspace.name} · ${CATEGORY_LABEL[r.workspace.category]}`],
              ["When", describeWhen(r.intervals.map((i) => ({ localDate: i.localDate, startsAt: i.start, endsAt: i.end })))],
              ["Booking", BOOKING_TYPE_LABEL[r.bookingType]],
              ["Status", confirmed ? "Confirmed" : waiting ? "Awaiting payment" : r.status === "needs_attention" ? "Needs attention" : "Not active"],
              ["Confirmation", r.reference],
              ["Price", r.totalCents ? `${usd(r.totalCents)} · ${r.paymentStatus}` : "Included with tuition"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-6 py-3">
                <dt className="text-[0.85rem] text-ink-soft">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-10 flex flex-wrap gap-3">
            {waiting && cancelled ? <ResumeCheckout reference={r.reference} /> : null}
            <Link href="/portal/spaces/reservations" className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[0.9rem] text-chalk hover:bg-blue">
              View my reservations
            </Link>
            <Link href="/portal/spaces" className="inline-flex h-12 items-center rounded-full border border-ink/20 px-6 text-[0.9rem] hover:border-ink">
              Book another space
            </Link>
            {confirmed ? (
              <a href={`/portal/spaces/ics/${r.reference}`} className="inline-flex h-12 items-center px-2 text-[0.9rem] text-blue underline-offset-4 hover:underline">
                Add to calendar
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
