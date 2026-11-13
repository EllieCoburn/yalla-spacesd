import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Mark } from "@/components/brand/Mark";
import { ConfirmPass, CreateAccount } from "@/components/playpass/PassForms";
import { SignInForm } from "@/components/portal/PortalForms";
import { Arrow } from "@/components/ui/primitives";
import { billingTerms, PLAN_LOOK } from "@/content/playpass";
import { getDb, isDbConfigured } from "@/lib/db";
import { playPassPlans } from "@/lib/db/schema";
import { openSubscription, proration } from "@/lib/playpass/membership";
import { fmtDate, todayLA } from "@/lib/time";
import { getGuardian } from "../../portal/session";

export const metadata: Metadata = { title: "Choose your Play Pass", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ plan?: string; cancelled?: string; declined?: string }> }) {
  const sp = await searchParams;
  if (!isDbConfigured())
    return (
      <section className="shell pt-40 pb-32 text-center">
        <h1 className="display text-[2.4rem]">Play Passes open soon.</h1>
      </section>
    );
  const db = getDb();
  const plans = await db.select().from(playPassPlans).where(eq(playPassPlans.active, true)).orderBy(playPassPlans.sortOrder);
  const plan = plans.find((p) => p.tier === sp.plan) ?? plans.find((p) => p.tier === "gather") ?? plans[0];
  const g = await getGuardian();
  const existing = g ? await openSubscription(db, g.familyId) : null;
  const today = todayLA();
  const p = proration(plan, today);
  const renewal = fmtDate(p.nextRenewalOn, "EEEE, MMMM d");
  const look = PLAN_LOOK[plan.tier] ?? PLAN_LOOK.play;
  const next = `/play-passes/join?plan=${plan.tier}`;

  return (
    <section className="pt-32 pb-28 lg:pt-40">
      <div className="shell">
        <Link href="/play-passes" className="eyebrow inline-flex items-center gap-3 text-ink-soft hover:text-ink">
          <Arrow className="h-3 w-4 rotate-180" /> All Play Passes
        </Link>
        <div className="mt-10 grid gap-12 lg:grid-cols-12">
          {/* What you're choosing */}
          <div className="lg:col-span-5">
            <div className={`rounded-t-[12rem] ${look.bg} px-8 pt-14 pb-10 text-center`}>
              <Mark name={look.mark} className="mx-auto h-12 w-auto text-blue" />
              <h1 className="display mt-6 text-[2.6rem]">{plan.name}</h1>
              <p className="mt-2 text-ink-soft">Yalla Play Pass</p>
              <p className="mt-6 font-serif text-[1.5rem]">
                {usd(plan.priceCents)}
                <span className="text-[1rem] text-ink-soft">/month</span>
              </p>
              <p className="mt-2">{usd(plan.allocationCents)} to spend each month</p>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label="Switch pass">
              {plans.map((o) => (
                <Link
                  key={o.tier}
                  href={`/play-passes/join?plan=${o.tier}`}
                  aria-current={o.tier === plan.tier ? "true" : undefined}
                  className={`rounded-full border px-4 py-1.5 text-[0.82rem] ${o.tier === plan.tier ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"}`}
                >
                  {o.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 lg:col-start-7">
            {sp.cancelled || sp.declined ? (
              <p role="status" className="mb-6 border-l-2 border-oxblood/40 pl-4 text-[0.9rem] text-oxblood">
                {sp.declined ? "That card didn’t go through, and nothing was charged. You can try again below." : "Payment wasn’t completed, and nothing was charged."}
              </p>
            ) : null}

            {/* The numbers, before anything is agreed */}
            <dl className="divide-y divide-line border-y border-line">
              {[
                ["Today", usd(p.chargeCents), p.full ? "A full month" : `For the ${p.remainingDays} days left in ${fmtDate(today, "MMMM")}`],
                ["Added to your Play Pass today", usd(p.allocationCents), "Ready to spend as soon as your payment goes through"],
                ["Then on the 1st of each month", `${usd(plan.priceCents)}`, `With ${usd(plan.allocationCents)} to spend. First renewal ${renewal}.`],
              ].map(([k, v, note]) => (
                <div key={k} className="grid grid-cols-[1fr_auto] gap-x-6 py-4">
                  <dt>{k}</dt>
                  <dd className="text-right font-serif text-[1.35rem]">{v}</dd>
                  <dd className="col-span-2 text-[0.82rem] text-ink-soft">{note}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-10">
              {existing && existing.status !== "pending" ? (
                <div className="bg-paper p-7">
                  <p className="display text-[1.6rem]">Your family already has a Play Pass.</p>
                  <p className="mt-2 text-ink-soft">You can switch passes or stop renewals anytime.</p>
                  <Link href="/portal/play-pass" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-6 text-[0.88rem] text-chalk hover:bg-blue">
                    Go to My Play Pass
                  </Link>
                </div>
              ) : g ? (
                <div>
                  <p className="eyebrow text-[0.62rem] text-ink-soft">Billing terms · {g.firstName} {g.lastName}</p>
                  <div className="mt-4">
                    <ConfirmPass
                      tier={plan.tier}
                      label={`Continue to payment · ${usd(p.chargeCents)}`}
                      terms={billingTerms({ name: plan.name, price: usd(plan.priceCents), allocation: usd(plan.allocationCents), today: usd(p.chargeCents), firstBalance: usd(p.allocationCents), renewal })}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-10 sm:grid-cols-2">
                  <div>
                    <p className="display text-[1.5rem]">Already with Yalla?</p>
                    <p className="mt-1 text-[0.9rem] text-ink-soft">Sign in, and we’ll bring you right back here.</p>
                    <SignInForm next={next} />
                  </div>
                  <div>
                    <p className="display text-[1.5rem]">New to Yalla?</p>
                    <p className="mt-1 text-[0.9rem] text-ink-soft">Create your family account. You’ll add your children when you book.</p>
                    <div className="mt-6">
                      <CreateAccount tier={plan.tier} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
