import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cohortMarks } from "@/components/brand/CohortMarks";
import { Mark } from "@/components/brand/Mark";
import { ClubYallaDay } from "@/components/site/ClubYallaDay";
import { CtaBand, Facts, Section } from "@/components/site/PageParts";
import { ToConfirm } from "@/components/ui/Draft";
import { Arrow, Button, Eyebrow, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { membershipIncludes, publicCohorts } from "@/content/pricing-public";
import { clubYalla as p } from "@/content/programs";

export const metadata: Metadata = {
  title: "Club Yalla",
  description: p.summary,
};

const steps = [
  { mark: "window" as const, title: "Apply", body: "Tell us about your family, your child and the schedule you’re hoping for." },
  { mark: "arch" as const, title: "Visit", body: "When a space opens for your family, we’ll reach out and invite you to tour Yalla and meet the team." },
  { mark: "balcony" as const, title: "Welcome", body: "Set up your Family Portal, add your children’s profiles and complete the required forms." },
  { mark: "sun" as const, title: "First days", body: "We’ll plan a gentle start together, so your child (and you) feel at home." },
];

export default function ClubYallaPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 lg:pt-40 lg:pb-24">
        <div className="shell grid items-end gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Reveal>
              <Eyebrow>Weekday membership</Eyebrow>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="display mt-6 text-[clamp(3rem,1.6rem+5vw,6.2rem)]">{p.name}</h1>
            </Reveal>
            <Reveal delay={180}>
              <p className="display mt-5 text-[clamp(1.4rem,1.1rem+1vw,2rem)] text-blue italic">{p.tagline}</p>
            </Reveal>
            <Reveal delay={260}>
              <p className="mt-8 max-w-xl text-[1.08rem] text-ink-soft">{p.summary}</p>
            </Reveal>
            <Reveal delay={340} className="mt-10 flex flex-wrap gap-3">
              <Button href={p.cta.href} size="lg">
                {p.cta.label}
              </Button>
              <Button href="/membership" variant="outline" size="lg">
                View membership rates
              </Button>
            </Reveal>
          </div>
          <Reveal delay={150} className="lg:col-span-4 lg:col-start-9">
            <div className="relative aspect-[3/4] overflow-hidden rounded-t-[999px] bg-sand">
              <Image src={p.image} alt={p.imageAlt} fill priority sizes="(min-width:1024px) 30vw, 90vw" className="object-cover" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* The details */}
      <section className="bg-paper py-20 lg:py-28">
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Mark name="roofline" className="h-4 w-auto text-blue" />
            <div className="mt-10 space-y-6 text-[1.08rem] text-ink-soft">
              {p.body.map((para) => (
                <p key={para}>{para}</p>
              ))}
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <Eyebrow className="mb-6">The details</Eyebrow>
            <Facts
              items={[
                { label: "Ages", value: p.ages },
                { label: "Schedule", value: p.schedule },
                { label: "Parents", value: "Parents and caregivers work onsite in our coworking space" },
                { label: "How to join", value: "Recurring membership. Apply, and we’ll reach out when a space opens for your family." },
                {
                  label: "Tuition",
                  value: (
                    <Link href="/membership" className="inline-flex items-center gap-2 hover:text-blue">
                      <span className="link-underline">View membership rates</span>
                      <Arrow className="h-3 w-4" />
                    </Link>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </section>

      <ClubYallaDay start={1} />

      {/* The membership model */}
      <Section>
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Index n="03">How membership works</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Small cohorts, <em>consistent days.</em>
              </h2>
            </div>
            <div className="space-y-5 text-[1.05rem] text-ink-soft lg:col-span-6 lg:col-start-7 lg:pt-14">
              <p>
                Members choose a recurring weekly schedule of one to five days, full or half days, and keep those same days each week.
                Tuition is monthly. Your child joins one of four small cohorts, each with a low caregiver-to-child ratio, while you work
                onsite in the coworking space. <ToConfirm>Cohort age ranges</ToConfirm>
              </p>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-4">
            {publicCohorts.map((c, i) => {
              const Illustration = cohortMarks[c.name as keyof typeof cohortMarks];
              return (
                <Reveal key={c.name} delay={i * 90} className="group">
                  <div className="relative flex aspect-[4/5] items-end justify-center overflow-hidden rounded-t-[999px] bg-mist">
                    <span className="absolute top-[18%] font-serif text-[0.85rem] text-blue/60 italic">0{i + 1}</span>
                    <Illustration
                      title={c.name}
                      className="mb-[4%] w-[86%] text-blue transition-transform duration-[1.2s] ease-[var(--ease-soft)] group-hover:-translate-y-1.5 group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="display mt-6 text-[1.7rem] sm:text-[1.9rem]">{c.name}</p>
                  <dl className="hairline mt-4 grid grid-cols-2 border-t pt-4">
                    <div>
                      <dt className="eyebrow text-[0.55rem] text-ink-soft">Ratio</dt>
                      <dd className="mt-1 font-serif text-[1.25rem]">{c.ratio}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow text-[0.55rem] text-ink-soft">Cohort</dt>
                      <dd className="mt-1 font-serif text-[1.25rem]">
                        {c.maxSize} <span className="font-sans text-[0.75rem] text-ink-soft">max</span>
                      </dd>
                    </div>
                  </dl>
                </Reveal>
              );
            })}
          </div>

          <div className="mt-20 grid gap-14 border-t border-line pt-14 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h3 className="display text-[clamp(1.8rem,1.4rem+1.4vw,2.6rem)]">
                Every membership <em>includes.</em>
              </h3>
              <p className="mt-4 text-ink-soft">Communal coworking is part of every membership. Private desks and offices are available for more privacy.</p>
            </div>
            <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
              {membershipIncludes.map((x) => (
                <li key={x} className="hairline flex items-start gap-4 border-t pt-5 text-[1.02rem]">
                  <Mark name="sun" className="mt-1.5 h-3 w-3 shrink-0 text-blue" />
                  {x}
                </li>
              ))}
            </ul>
          </div>

          {/* Rates callout */}
          <Reveal className="mt-20 flex flex-col items-start justify-between gap-8 bg-mist p-8 sm:p-12 md:flex-row md:items-center">
            <div>
              <p className="eyebrow text-ink-soft">Membership rates</p>
              <p className="display mt-3 text-[clamp(1.7rem,1.3rem+1.2vw,2.4rem)]">
                Tuition by cohort and schedule, <em>openly shared.</em>
              </p>
              <p className="mt-3 text-ink-soft">Monthly tuition for every cohort, plus fees and workspace upgrades.</p>
            </div>
            <Button href="/membership" size="lg">
              View membership rates
            </Button>
          </Reveal>
        </div>
      </Section>

      {/* Joining */}
      <Section tone="paper">
        <div className="shell">
          <Index n="04">Joining Club Yalla</Index>
          <h2 className="display mt-6 max-w-2xl text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
            Four steps <em>to your first day.</em>
          </h2>
          <ol className="mt-16 grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 100} className="bg-paper p-8 lg:p-10">
                <Mark name={s.mark} className="h-12 w-auto text-blue" />
                <p className="mt-10 font-serif text-ink-soft italic">0{i + 1}</p>
                <h3 className="display mt-2 text-[1.8rem]">{s.title}</h3>
                <p className="mt-3 text-ink-soft">{s.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      <CtaBand
        title={
          <>
            Begin with <em>an application.</em>
          </>
        }
        body="Spaces open rarely. Apply, and we’ll reach out when there’s a place for your family."
        primary={{ href: "/apply", label: "Apply for membership" }}
        secondary={{ href: "/membership", label: "View membership rates" }}
      />
    </>
  );
}
