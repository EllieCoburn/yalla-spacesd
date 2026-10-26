import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHero, Section } from "@/components/site/PageParts";
import { TuitionExplorer } from "@/components/site/TuitionExplorer";
import { Arrow, Index } from "@/components/ui/primitives";
import { cohorts, earlyBirdDaily, fees, hours, tuitionYear, workspace } from "@/content/tuition";

export const metadata: Metadata = {
  title: "Membership Rates",
  description: "Club Yalla membership tuition by cohort and number of days, fees and workspace upgrades.",
};

export default function MembershipPage() {
  return (
    <>
      <PageHero
        eyebrow="Club Yalla · Membership"
        mark="balcony"
        title={
          <>
            Membership <em>rates.</em>
          </>
        }
        lede="Monthly Club Yalla tuition for each cohort, for one to five days a week: full days, half days or a custom day, along with fees and workspace upgrades."
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
            <TuitionExplorer cohorts={cohorts} hours={hours} earlyBirdDaily={earlyBirdDaily} />
          </div>
        </div>
      </Section>

      <Section>
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Index n="02">Fees & upgrades</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Everything else, <em>up front.</em>
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

            <p className="eyebrow mt-16 text-ink-soft">Workspace upgrades</p>
            <p className="mt-3 text-[0.95rem] text-ink-soft">Communal coworking is part of every membership. For more privacy, add a desk or office of your own.</p>
            <div className="mt-6 grid gap-px overflow-hidden bg-line sm:grid-cols-2">
              {workspace.map((w) => (
                <div key={w.name} className="bg-paper p-6">
                  <p className="display text-[1.5rem]">{w.name}</p>
                  <dl className="mt-4 space-y-2">
                    {w.rates.map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[0.95rem]">
                        <dt className="text-ink-soft">{k}</dt>
                        <dd className="font-serif">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <CtaBand
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
