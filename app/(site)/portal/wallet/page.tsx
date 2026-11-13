import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { OfferChoice } from "@/components/portal/OfferChoice";
import { getDb, isDbConfigured } from "@/lib/db";
import { familyOffers, bonusFor } from "@/lib/ops/yalla-cancellations";
import { allocationsWithUse, walletActivity, walletSummary } from "@/lib/playpass/wallet";
import { PORTAL_OPEN_PREVIEW } from "@/lib/portal-preview";
import { fmtDate, todayLA } from "@/lib/time";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Yalla Wallet", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ENTRY: Record<string, string> = {
  allocation: "Play Pass balance added",
  credit: "Credit added",
  booking_debit: "Used for a booking",
  booking_refund: "Returned from a cancellation",
  adjustment: "Adjustment by Yalla",
  expiration: "Credit expired",
  payment_reversal: "Membership payment refunded",
};

/** The family's Yalla Wallet: cancellation credits, Play Pass balance, and choices after Yalla cancels. */
export default async function WalletPage({ searchParams }: { searchParams: Promise<{ chosen?: string }> }) {
  const sp = await searchParams;
  const g = isDbConfigured() ? await getGuardian() : null;
  if (!g) {
    if (!PORTAL_OPEN_PREVIEW) redirect("/portal?signin=1&next=/portal/wallet");
    redirect("/portal");
  }
  const db = getDb();
  const today = todayLA();
  const [wallet, allocations, activity, offers] = await Promise.all([walletSummary(db, g.familyId), allocationsWithUse(db, g.familyId), walletActivity(db, g.familyId, 30), familyOffers(db, g.familyId)]);
  const credits = allocations.filter((a) => a.kind === "credit" && a.leftCents > 0 && (!a.expiresOn || a.expiresOn >= today)).sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""));
  const pending = offers.filter((o) => o.status === "pending");
  const decided = offers.filter((o) => o.status !== "pending").slice(0, 5);

  return (
    <div className="pt-28 pb-24 lg:pt-36">
      <div className="shell">
        <Link href="/portal/home" className="eyebrow text-ink-soft hover:text-ink">
          ← Family Portal
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <Mark name="sun" className="h-7 w-auto text-blue" />
          <h1 className="display text-[clamp(2.4rem,1.8rem+2.4vw,4rem)]">
            Yalla <em>Wallet.</em>
          </h1>
        </div>
        <p className="mt-5 max-w-2xl text-ink-soft">Your family’s credits and Play Pass balance, applied automatically when you book. Credits from a cancellation can be used for any Yalla service or experience (except membership dues) for 24 months.</p>

        {sp.chosen ? (
          <p role="status" className="mt-8 border-l-2 border-blue/50 pl-4 text-[0.95rem] text-blue">
            {sp.chosen === "credit" ? "Done. Your credit, including the thank-you bonus, is in your Yalla Wallet." : "Done. Your refund is on its way to your original payment method. We process refunds within 7 business days; when it appears depends on your bank or card issuer."}
          </p>
        ) : null}

        {pending.length ? (
          <section className="mt-10 space-y-4" aria-labelledby="choose-title">
            <h2 id="choose-title" className="eyebrow text-ink-soft">
              We cancelled. How would you like your money back?
            </h2>
            {pending.map((o) => (
              <div key={o.id} className="border border-blue/30 bg-blue/[0.04] p-6 lg:p-8">
                <p className="display text-[1.4rem] leading-snug">{o.description}</p>
                <p className="mt-2 text-[0.92rem] text-ink-soft">
                  We’re sorry we had to cancel this. Reason: {o.reason}. You paid {usd(o.amountCents)}.
                </p>
                <OfferChoice offerId={o.id} creditLabel={`Yalla Wallet credit of ${usd(o.amountCents + bonusFor(o.amountCents, o.bonusPercent))}`} creditDetail={`The full ${usd(o.amountCents)} plus ${o.bonusPercent}% as a thank-you for your flexibility, for any Yalla booking within 24 months.`} refundLabel={`A full refund of ${usd(o.amountCents)}`} refundDetail="Back to your original payment method, processed within 7 business days." />
              </div>
            ))}
          </section>
        ) : null}

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="bg-mist p-8 lg:col-span-2">
            <p className="eyebrow text-[0.62rem] text-ink-soft">Available to spend</p>
            <p className="display mt-3 text-[clamp(2.6rem,2rem+2vw,3.6rem)]">{usd(wallet.availableCents)}</p>
            <dl className="mt-6 grid gap-4 text-[0.92rem] sm:grid-cols-2">
              <div>
                <dt className="text-ink-soft">Yalla credits</dt>
                <dd className="font-serif text-[1.3rem]">{usd(wallet.creditCents)}</dd>
                {wallet.nextCreditExpiry ? <dd className="text-[0.8rem] text-ink-soft">Next credit expires {fmtDate(wallet.nextCreditExpiry, "MMMM d, yyyy")}</dd> : null}
              </div>
              <div>
                <dt className="text-ink-soft">Play Pass balance</dt>
                <dd className="font-serif text-[1.3rem]">{usd(wallet.passCents)}</dd>
                <dd className="text-[0.8rem] text-ink-soft">
                  <Link href="/portal/play-pass" className="underline underline-offset-4 hover:text-blue">
                    My Play Pass
                  </Link>
                </dd>
              </div>
            </dl>
            {wallet.reservedCents ? <p className="mt-4 text-[0.85rem] text-ink-soft">{usd(wallet.reservedCents)} is set aside for a booking you’re checking out.</p> : null}
            <Link href="/book" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-6 text-[0.88rem] text-chalk hover:bg-blue">
              Explore Yalla
            </Link>
          </div>
          <div className="border border-line bg-paper p-7">
            <p className="eyebrow text-[0.6rem] text-ink-soft">Your credits</p>
            {credits.length ? (
              <ul className="mt-4 divide-y divide-line">
                {credits.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-4 py-2.5 text-[0.9rem]">
                    <span>
                      {usd(c.leftCents)}
                      {c.leftCents !== c.amountCents ? <span className="text-ink-soft"> of {usd(c.amountCents)}</span> : null}
                    </span>
                    <span className="text-[0.8rem] text-ink-soft">use by {fmtDate(c.expiresOn!, "MMM d, yyyy")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-[0.88rem] text-ink-soft">No credits right now. When you cancel a reservation at least 24 hours ahead, what you paid comes back here.</p>
            )}
            <p className="mt-5 text-[0.78rem] text-ink-soft">
              Credits are nontransferable and stay here even if you cancel your membership.{" "}
              <Link href="/policies#yalla-wallet" className="underline underline-offset-4 hover:text-blue">
                Wallet policy
              </Link>
            </p>
          </div>
        </div>

        {decided.length ? (
          <section className="mt-12">
            <h2 className="eyebrow text-ink-soft">Cancellations by Yalla</h2>
            <ul className="mt-4 divide-y divide-line border-y border-line text-[0.9rem]">
              {decided.map((o) => (
                <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                  <span>{o.description}</span>
                  <span className="text-ink-soft">{o.status === "credited" ? `Credit of ${usd(o.creditedCents ?? 0)}` : `Refund of ${usd(o.refundedCents ?? o.amountCents)}`}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-12">
          <h2 className="eyebrow text-ink-soft">Activity</h2>
          {activity.length ? (
            <ul className="mt-4 divide-y divide-line border-y border-line text-[0.9rem]">
              {activity.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                  <span>
                    {ENTRY[e.kind] ?? e.kind}
                    {e.note ? <span className="text-ink-soft"> · {e.note}</span> : null}
                  </span>
                  <span className={`tabular-nums ${e.amountCents > 0 ? "text-blue" : ""}`}>
                    {e.amountCents > 0 ? "+" : ""}
                    {usd(e.amountCents)}
                    <span className="ml-3 text-[0.78rem] text-ink-soft">{fmtDate(e.createdAt.toISOString().slice(0, 10), "MMM d")}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[0.9rem] text-ink-soft">Nothing yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
