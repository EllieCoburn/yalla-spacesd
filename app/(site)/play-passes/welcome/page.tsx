import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Mark } from "@/components/brand/Mark";
import { AutoRefresh } from "@/components/booking/AutoRefresh";
import { getDb, isDbConfigured } from "@/lib/db";
import { playPassPlans, playPassSubscriptions } from "@/lib/db/schema";
import { walletSummary } from "@/lib/playpass/wallet";
import { fmtDate } from "@/lib/time";
import { getGuardian } from "../../portal/session";

export const metadata: Metadata = { title: "Welcome to your Play Pass", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/**
 * Shown after checkout. It only reports what the verified payment webhook has recorded; arriving
 * here never activates anything.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const g = isDbConfigured() ? await getGuardian() : null;
  const db = isDbConfigured() ? getDb() : null;
  const [sub] = db && ref ? await db.select().from(playPassSubscriptions).where(eq(playPassSubscriptions.id, ref)) : [];
  // Only the family's own signed-in guardians see the details.
  const mine = sub && g && sub.familyId === g.familyId ? sub : null;
  const [plan] = mine ? await db!.select().from(playPassPlans).where(eq(playPassPlans.id, mine.planId)) : [];
  const wallet = mine ? await walletSummary(db!, mine.familyId) : null;
  const active = mine?.status === "active";

  return (
    <section className="pt-32 pb-28 lg:pt-44">
      <div className="shell">
        <div className="mx-auto max-w-xl text-center">
          <Mark name="sun" className="mx-auto h-12 w-auto text-blue" />
          {active && plan && wallet ? (
            <>
              <h1 className="display mt-8 text-[clamp(2.4rem,1.6rem+3vw,4rem)]">
                Welcome to <em>{plan.name}.</em>
              </h1>
              <p className="mt-5 text-[1.05rem] text-ink-soft">Your Play Pass is active, and your balance is ready to use.</p>
              <dl className="mx-auto mt-10 max-w-sm divide-y divide-line border-y border-line text-left">
                {[
                  ["Available to spend", usd(wallet.availableCents)],
                  ["Paid today", usd(mine.initialChargeCents)],
                  ["Next renewal", mine.nextRenewalOn ? `${fmtDate(mine.nextRenewalOn, "MMMM d")} · ${usd(plan.priceCents)}` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-3">
                    <dt className="text-ink-soft">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link href="/programs/yalla-happenings#calendar" className="inline-flex h-12 items-center rounded-full bg-ink px-7 text-[0.9rem] text-chalk hover:bg-blue">
                  Browse experiences
                </Link>
                <Link href="/portal/play-pass" className="inline-flex h-12 items-center rounded-full border border-ink/25 px-7 text-[0.9rem] hover:border-ink">
                  My Play Pass
                </Link>
              </div>
            </>
          ) : mine && (mine.status === "pending" || mine.status === "abandoned") ? (
            <>
              <h1 className="display mt-8 text-[clamp(2.2rem,1.6rem+2.4vw,3.4rem)]">Finishing up…</h1>
              <p className="mt-5 text-ink-soft">We’re confirming your payment with our payment provider. This usually takes a few seconds.</p>
              <AutoRefresh seconds={3} maxTries={20} />
            </>
          ) : (
            <>
              <h1 className="display mt-8 text-[clamp(2.2rem,1.6rem+2.4vw,3.4rem)]">Thank you.</h1>
              <p className="mt-5 text-ink-soft">We’ll email you as soon as your Play Pass is active. You can also see it under My Play Pass in the Family Portal.</p>
              <Link href="/portal/play-pass" className="mt-8 inline-flex h-12 items-center rounded-full bg-ink px-7 text-[0.9rem] text-chalk hover:bg-blue">
                My Play Pass
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
