import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { AutoRefresh } from "@/components/booking/AutoRefresh";
import { getDb, isDbConfigured } from "@/lib/db";
import { bookingStatusView } from "@/lib/ops/public-booking";
import { CartBooked } from "@/components/booking/CartButton";
import { fmtDateTime } from "@/lib/time";
import { retryPaymentAction } from "../../actions";
import { PrivateLinkNotice } from "@/components/booking/PrivateLinkNotice";
import { mayViewStatus } from "@/lib/booking-access";
import { portalClaimFor } from "@/lib/family-auth";
import { claimPortalAction } from "../../../portal/actions";
import { getGuardian } from "../../../portal/session";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Status comes from the database only — reaching this page never marks anything paid. */
export default async function Confirmation({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ cancelled?: string; error?: string; k?: string }> }) {
  const { ref } = await params;
  const sp = await searchParams;
  if (!isDbConfigured()) notFound();
  const v = await bookingStatusView(getDb(), ref);
  // Without the private link (or the family's own sign-in) nothing about the booking is shown,
  // not even whether the reference exists.
  if (!v || !(await mayViewStatus("booking", ref, sp.k, v.familyId))) return <PrivateLinkNotice />;
  const holdValid = !!v.holdExpiresAt && new Date(v.holdExpiresAt) > new Date();
  const paymentFailed = v.latestPayment?.status === "failed";
  // A family's first booking opens their Family Portal straight away (no waiting on email).
  const claim = v.status === "confirmed" ? await portalClaimFor(getDb(), ref, sp.k) : null;
  const signedIn = v.status === "confirmed" && !claim ? !!(await getGuardian()) : false;
  const pending = !sp.cancelled && ((v.status === "pending_payment" && !paymentFailed) || (v.status === "held" && v.latestPayment?.status === "pending"));

  let mark: "mark" | "sun" | "window" = "mark";
  let title: React.ReactNode;
  let body: React.ReactNode;
  if (v.status === "confirmed") {
    title = (
      <>
        You’re <em>all set.</em>
      </>
    );
    body = "Your booking is confirmed and a confirmation is on its way to your email.";
  } else if (v.status === "requested") {
    mark = "sun";
    title = (
      <>
        Request <em>received.</em>
      </>
    );
    body = "Your spots are held while the Yalla team reviews your request. We’ll email you to confirm and arrange payment.";
  } else if (v.status === "needs_attention") {
    mark = "sun";
    title = (
      <>
        Thank you — <em>we’ll be in touch.</em>
      </>
    );
    body = "Your payment arrived after your hold ended and the spot was taken in the meantime. Our team will contact you shortly to move your booking or refund you.";
  } else if (pending) {
    mark = "window";
    title = (
      <>
        Confirming your <em>payment…</em>
      </>
    );
    body = "We’re waiting for confirmation from the payment provider. This usually takes a few seconds.";
  } else if ((v.status === "held" || v.status === "pending_payment") && holdValid) {
    mark = "window";
    title = paymentFailed ? (
      <>
        Your payment <em>didn’t go through.</em>
      </>
    ) : (
      <>
        Your spots <em>are held.</em>
      </>
    );
    body = paymentFailed ? `${v.latestPayment?.failureReason ?? "The payment was declined"}. Your spots are held until ${fmtDateTime(v.holdExpiresAt!)} — you can try again.` : `Complete payment by ${fmtDateTime(v.holdExpiresAt!)} to confirm.`;
  } else if (v.status === "cancelled") {
    mark = "sun";
    title = "This booking was cancelled.";
    body = "If you have questions, just get in touch.";
  } else {
    mark = "sun";
    title = (
      <>
        Your hold <em>has ended.</em>
      </>
    );
    body = "No payment was taken. Choose your sessions again to see current availability.";
  }

  // Booked and paid (or sent as a request): those days come out of the cart.
  const booked = v.status === "confirmed" || v.status === "requested" ? <CartBooked sessionIds={v.lines.map((l) => l.sessionId)} /> : null;
  return (
    <section className="pt-32 pb-28 lg:pt-40">
      {pending ? <AutoRefresh seconds={2} maxTries={30} /> : null}
      {booked}
      <div className="shell">
        <div className="mx-auto max-w-xl text-center">
          <Mark name={mark} className={`mx-auto w-auto text-blue ${mark === "mark" ? "h-28" : "h-12"}`} />
          <h1 className="display mt-10 text-[clamp(2.4rem,1.8rem+2vw,3.4rem)]">{title}</h1>
          <p className="mx-auto mt-4 max-w-md text-ink-soft">{body}</p>
          {sp.error ? <p className="mt-4 text-[0.88rem] text-oxblood">{sp.error}</p> : null}
          <p className="eyebrow mt-8 text-ink-soft">Reference {v.reference}</p>
        </div>
        {claim ? (
          <div className="mx-auto mt-10 max-w-xl rounded-3xl bg-blue p-7 text-chalk sm:p-9">
            <p className="eyebrow text-chalk/70">Your Family Portal is ready</p>
            <p className="display mt-3 text-[1.7rem] leading-tight">Welcome to Yalla, {claim.firstName}!</p>
            <p className="mt-3 text-[0.95rem] text-chalk/85">See your booking, finish any forms we need before your child’s first day, and explore all of our family resources. We’ve also emailed you a link to confirm your email; you can do that anytime.</p>
            <form action={claimPortalAction} className="mt-6">
              <input type="hidden" name="ref" value={v.reference} />
              <input type="hidden" name="k" value={sp.k ?? ""} />
              <button className="h-12 rounded-full bg-chalk px-7 text-[0.92rem] text-ink transition-colors hover:bg-sand">Open my Family Portal</button>
            </form>
          </div>
        ) : null}
        <div className="mx-auto mt-10 max-w-xl bg-paper p-7">
          <ul className="divide-y divide-line">
            {v.lines.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-4 py-3 text-[0.92rem]">
                <span className={l.status === "cancelled" ? "text-ink-soft line-through" : ""}>{l.label}</span>
                <span className="font-serif whitespace-nowrap">{l.priceCents != null ? usd(l.priceCents) : ""}</span>
              </li>
            ))}
          </ul>
          {v.totalCents ? (
            <div className="mt-4 flex justify-between border-t border-line pt-4 text-[0.92rem]">
              <span className="text-ink-soft">{v.balanceCents > 0 ? "Balance due" : "Paid"}</span>
              <span className="display text-[1.3rem]">{usd(v.balanceCents > 0 ? v.balanceCents : v.totalCents)}</span>
            </div>
          ) : null}
          {v.walletCents ? (
            <p className="mt-2 text-right text-[0.85rem] text-blue">
              {usd(v.walletCents)} from your Play Pass{v.cardCents ? ` · ${usd(v.cardCents)} by card` : ""}
            </p>
          ) : null}
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {(v.status === "held" || v.status === "pending_payment") && holdValid && (paymentFailed || sp.cancelled) ? (
            <form action={retryPaymentAction}>
              <input type="hidden" name="reference" value={v.reference} />
              <input type="hidden" name="k" value={sp.k ?? ""} />
              <button className="h-12 rounded-full bg-ink px-7 text-[0.9rem] text-chalk hover:bg-blue">Try payment again</button>
            </form>
          ) : null}
          {v.status === "confirmed" && !claim ? (
            <Link href={signedIn ? "/portal/home" : "/portal"} className="inline-flex h-12 items-center rounded-full bg-ink px-7 text-[0.9rem] text-chalk hover:bg-blue">
              View in Family Portal
            </Link>
          ) : null}
          <Link href="/book" className="inline-flex h-12 items-center rounded-full border border-ink/25 px-7 text-[0.9rem] hover:border-ink">
            {v.status === "confirmed" ? "Book more" : "Back to booking"}
          </Link>
        </div>
      </div>
    </section>
  );
}
