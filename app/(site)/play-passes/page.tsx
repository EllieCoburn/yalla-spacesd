import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Mark } from "@/components/brand/Mark";
import { Arrow, Chevron, Eyebrow } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { PLAN_DEFAULTS, PLAN_LOOK, PLAY_PASS_FAQ, WALLET_EXPLAINER } from "@/content/playpass";
import { getDb, isDbConfigured } from "@/lib/db";
import { programs } from "@/lib/db/schema";
import { offeredPlans } from "@/lib/playpass/membership";

export const metadata: Metadata = {
  title: "Yalla Play Passes",
  description: "Monthly Play Passes for Yalla Happenings: a family spending balance for immersive play, weekend play and evenings out.",
};
export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0 })}`;

export default async function PlayPassesPage() {
  const db = isDbConfigured() ? getDb() : null;
  const plans = db ? await offeredPlans(db) : [];
  const shown = plans.length ? plans : PLAN_DEFAULTS;
  // What Play Pass funds can be spent on, straight from Admin → Programs.
  const eligible = db
    ? await db
        .select({ name: programs.name })
        .from(programs)
        .where(and(eq(programs.playPassEligible, true), eq(programs.walletRedemptionAllowed, true), eq(programs.status, "published")))
    : [];

  return (
    <>
      <section className="pt-32 pb-14 lg:pt-44 lg:pb-16">
        <div className="shell">
          <Link href="/programs/yalla-happenings" className="eyebrow inline-flex items-center gap-3 text-ink-soft hover:text-ink">
            <Arrow className="h-3 w-4 rotate-180" /> Yalla Happenings
          </Link>
          <div className="mt-10 max-w-3xl">
            <Eyebrow className="flex items-center gap-3">
              <Mark name="sun" className="h-5 w-auto text-blue" />
              Monthly memberships
            </Eyebrow>
            <h1 className="display mt-6 text-[clamp(2.8rem,1.6rem+4.4vw,5.6rem)]">Yalla Play Passes</h1>
            <p className="display mt-4 text-[clamp(1.4rem,1.1rem+1vw,2rem)] text-blue italic">More room for play. More flexibility for your family.</p>
            <p className="mt-8 max-w-2xl text-[1.1rem] text-ink-soft">
              Make more of your favorite Yalla experiences with a monthly Play Pass. From immersive weekend play to evenings out and coworking days, choose the experiences
              that work for your family and enjoy more for less.
            </p>
          </div>
        </div>
      </section>

      {/* The three passes: equally welcoming, different only in how much there is to spend. */}
      <section className="pb-20">
        <div className="shell">
          <ul className="grid gap-5 md:grid-cols-3">
            {shown.map((p, i) => {
              const look = PLAN_LOOK[p.tier] ?? PLAN_LOOK.play;
              return (
                <Reveal as="li" key={p.tier} delay={i * 90} className={`flex flex-col rounded-t-[12rem] ${look.bg} px-7 pt-14 pb-8 text-center sm:px-9`}>
                  <Mark name={look.mark} className="mx-auto h-12 w-auto text-blue" />
                  <h2 className="display mt-6 text-[2.4rem]">{p.name}</h2>
                  <p className="mt-4 font-serif text-[1.5rem]">
                    {usd(p.priceCents)}
                    <span className="text-[1rem] text-ink-soft">/month</span>
                  </p>
                  <p className="mt-6 text-[1.15rem]">
                    <strong className="font-medium">{usd(p.allocationCents)}</strong> to spend each month
                  </p>
                  <p className="mt-1 text-ink-soft">At least {p.minExperiences} experiences</p>
                  <p className="mt-5 text-[0.85rem] text-blue">{usd(p.allocationCents - p.priceCents)} more to spend than you pay, every month</p>
                  <div className="mt-auto pt-8">
                    <Link
                      href={`/play-passes/join?plan=${p.tier}`}
                      className="group inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-ink text-[0.9rem] text-chalk transition-colors hover:bg-blue"
                      aria-label={`Choose the ${p.name} Play Pass`}
                    >
                      Choose Pass <Arrow className="h-3 w-5 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </ul>

          <div className="mt-14 grid gap-10 lg:grid-cols-12">
            <p className="display text-[clamp(1.5rem,1.2rem+1vw,2rem)] leading-snug lg:col-span-7">{WALLET_EXPLAINER}</p>
            <div className="lg:col-span-4 lg:col-start-9">
              <p className="eyebrow text-[0.62rem] text-ink-soft">Use your balance on</p>
              <ul className="mt-3 space-y-1">
                {(eligible.length ? eligible.map((e) => e.name) : ["Immersive Play Sessions", "Weekend Play Sessions", "After Hours Evenings"]).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-4 text-[0.85rem] text-ink-soft">
                Members and pay-as-you-go families book from the same calendar.{" "}
                <Link href="/programs/yalla-happenings#calendar" className="underline underline-offset-4 hover:text-blue">
                  See what’s on
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-paper py-20 lg:py-24">
        <div className="shell">
          <Eyebrow>How it works</Eyebrow>
          <ol className="mt-8 grid gap-10 md:grid-cols-3">
            {[
              ["Choose your pass", "Pick Play, Gather or Belong. Your balance is added as soon as your first payment goes through."],
              ["Book as usual", "Choose any eligible experience for any of your children. Your balance is applied at checkout automatically."],
              ["Renews on the 1st", "Each month brings a fresh balance. Change or stop your pass anytime in the Family Portal."],
            ].map(([t, b], i) => (
              <li key={t}>
                <p className="font-serif text-[1rem] text-blue italic">0{i + 1}</p>
                <p className="display mt-2 text-[1.5rem]">{t}</p>
                <p className="mt-2 text-ink-soft">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 lg:py-28">
        <div className="shell grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="display mt-5 text-[clamp(2rem,1.5rem+1.6vw,3rem)]">
              About <em>Play Passes.</em>
            </h2>
          </div>
          <div className="hairline border-t lg:col-span-8">
            {PLAY_PASS_FAQ.map((it) => (
              <details key={it.q} className="group hairline border-b">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 [&::-webkit-details-marker]:hidden">
                  <span className="display text-[1.3rem] leading-snug! sm:text-[1.5rem]">{it.q}</span>
                  <Chevron className="mt-3 h-2.5 w-4 shrink-0 text-ink" />
                </summary>
                <div className="max-w-2xl space-y-4 pb-8 text-[1.02rem] text-ink-soft">
                  {it.a.map((para) => (
                    <p key={para.slice(0, 40)}>{para}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
