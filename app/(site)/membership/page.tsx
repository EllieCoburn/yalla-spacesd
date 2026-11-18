import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHero, Section } from "@/components/site/PageParts";
import { TuitionExplorer } from "@/components/site/TuitionExplorer";
import { Arrow, Index } from "@/components/ui/primitives";
import { cohorts, discounts, earlyBirdDaily, fees, hours, siblingDiscount, tuitionYear } from "@/content/tuition";

export const metadata: Metadata = {
  title: "Membership Rates",
  description: "Club Yalla membership tuition by cohort and number of days, fees and discounts. Communal coworking is included with every membership.",
};

export default function MembershipPage() {
  return (
    <>
      <PageHero
        eyebrow="Club Yalla · Membership"
        mark="sprig"
        title={
          <>
            Membership <em>rates.</em>
          </>
        }
        lede="Monthly Club Yalla tuition for each cohort, for one to five days a week: full days, half days or a custom day, along with fees and discounts."
      />

      <Section tone="paper">
        <div className="shell">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <Index n="01">Tuition</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                {tuitionYear} <em>tuition.</em>
              </h2>
            </div>
            <Link href="/club-yalla" className="inline-flex items-center gap-3 text-[0.9rem] hover:text-blue">
              <span className="link-underline">How Club Yalla membership works</span>
              <Arrow className="h-3 w-5" />
            </Link>
          </div>
          <div className="mt-12">
            <TuitionExplorer cohorts={cohorts} hours={hours} earlyBirdDaily={earlyBirdDaily} siblingDiscount={siblingDiscount} />
          </div>
        </div>
      </Section>

      <Section className="pb-8! lg:pb-10!">
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Index n="02">Fees & discounts</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Fees <em>&amp; discounts.</em>
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6 lg:pt-4">
            <p className="eyebrow text-ink-soft">Fees</p>
            <dl className="mt-5 divide-y divide-line border-y border-line">
              {fees.map((f) => (
                <div key={f.label} className="flex items-baseline justify-between gap-6 py-5">
                  <dt>
                    <span className="block text-[1rem]">{f.label}</span>
                    {f.note ? <span className="text-[0.82rem] text-ink-soft">{f.note}</span> : null}
                  </dt>
                  <dd className="font-serif text-[1.35rem] whitespace-nowrap">{f.amount}</dd>
                </div>
              ))}
            </dl>

            <p className="eyebrow mt-16 text-ink-soft">Discounts</p>
            <div className="mt-5 space-y-3">
              {discounts.map((d) => (
                <div key={d.label} className="flex items-start justify-between gap-6 bg-mist/60 p-6">
                  <div>
                    <p className="text-[1rem]">{d.label}</p>
                    <p className="mt-1.5 max-w-md text-[0.88rem] leading-relaxed text-ink-soft">{d.note}</p>
                  </div>
                  <p className="font-serif text-[1.35rem] whitespace-nowrap text-blue">{d.amount}</p>
                </div>
              ))}
            </div>

            <p className="eyebrow mt-16 text-ink-soft">Coworking</p>
            <div className="mt-5 bg-mist/60 p-6">
              <p className="text-[1rem]">Communal coworking is included with every Club Yalla membership.</p>
              <p className="mt-1.5 max-w-md text-[0.88rem] leading-relaxed text-ink-soft">Work from Yalla’s shared spaces on your child’s days, at no extra cost.</p>
              <Link href="/coworking" className="mt-4 inline-flex items-center gap-3 border-b border-ink/30 pb-1 text-[0.95rem] text-ink hover:border-blue hover:text-blue">
                Learn about coworking at Yalla <Arrow className="h-3 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <CtaBand
        tight
        title={
          <>
            Begin with <em>an application.</em>
          </>
        }
        body="Applications are accepted year-round, first come, first served, depending on cohort availability."
        primary={{ href: "/apply", label: "Apply for membership" }}
        secondary={{ href: "/club-yalla", label: "About Club Yalla" }}
      />
    </>
  );
}
