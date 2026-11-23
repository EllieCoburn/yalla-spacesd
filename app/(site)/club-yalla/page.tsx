import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cohortMarks } from "@/components/brand/CohortMarks";
import { Mark } from "@/components/brand/Mark";
import { ClubYallaDay } from "@/components/site/ClubYallaDay";
import { CtaBand, Facts, Section } from "@/components/site/PageParts";
import { ContextualFaq } from "@/components/faq/ContextualFaq";
import { Arrow, Button, Eyebrow, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { publicCohorts } from "@/content/pricing-public";
import { clubYalla as p } from "@/content/programs";
import { LoopDivider } from "@/components/brand/LoopDivider";

export const metadata: Metadata = {
  title: "Club Yalla",
  description: p.summary,
};

const steps = [
  { mark: "window" as const, title: "Apply", body: "Tell us about your family, your child and the days you’re hoping for." },
  { mark: "arch" as const, title: "Visit", body: "When there’s a spot in your child’s cohort, or as you near the top of the waitlist, we’ll invite you to tour Yalla and meet the team." },
  { mark: "dotsun" as const, title: "Welcome", body: "Set up your Family Portal, add your children’s profiles and complete the required forms." },
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
              <Button href="/membership" size="lg">
                View membership rates
              </Button>
              <Button href={p.cta.href} variant="outline" size="lg">
                {p.cta.label}
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

      <LoopDivider />

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
            <div className="relative mt-12 aspect-[4/3] overflow-hidden rounded-t-[999px] bg-sand">
              <Image src="/photos/cowork-desk.webp" alt="A quiet desk for two in the coworking space, steps from where children play" fill sizes="(min-width:1024px) 40vw, 90vw" className="object-cover" />
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <Eyebrow className="mb-6">The details</Eyebrow>
            <Facts
              items={[
                { label: "Ages", value: p.ages },
                { label: "Days & hours", value: p.days },
                { label: "Parents", value: "Parents and caregivers work onsite in our coworking space" },
                { label: "How to join", value: "Recurring membership. Applications are accepted year-round, first come, first served, depending on cohort availability." },
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
              <Index n="02">How membership works</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Small cohorts, <em>consistent days.</em>
              </h2>
            </div>
            <div className="space-y-5 text-[1.05rem] text-ink-soft lg:col-span-6 lg:col-start-7 lg:pt-14">
              <p>
                Members choose a recurring weekly rhythm of one to five days, full or half days, and keep those same days each week.
                Tuition is monthly. Your child joins one of four small cohorts, each with a low caregiver-to-child ratio, while you work
                onsite in the coworking space.
              </p>
              <p>
                The cohort year runs August through July, and children move up to their next cohort at the start of each new cohort year.
                Onboarding for the coming year happens each May, so we recommend applying for the next cohort year. Families who join
                mid-year are matched with the cohort that best fits their child’s age and developmental readiness.
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
                  <p className="mt-1 text-[0.92rem] text-ink-soft">{c.ages}</p>
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
        </div>
      </Section>

      {/* Coworking: details live on the coworking page */}
      <section className="roofline-edge bg-blue text-blue">
        <div className="py-20 text-chalk lg:py-24">
          <div className="shell grid items-end gap-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <h2 className="display text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Coworking, <em className="text-mist!">included.</em>
              </h2>
            </div>
            <div className="lg:col-span-5 lg:col-start-8">
              <p className="text-chalk/80">Every Club Yalla membership includes communal coworking for a parent or guardian, with private desks and offices available too.</p>
              <Link href="/coworking" className="mt-6 inline-flex items-center gap-3 border-b border-chalk/50 pb-1 text-chalk hover:border-chalk">
                Explore coworking <Arrow className="h-3 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Joining */}
      <Section tone="paper">
        <div className="shell">
          <Index n="03">Joining Club Yalla</Index>
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

          {/* Rates callout */}
          <Reveal className="mt-20 flex flex-col items-start justify-between gap-8 bg-mist p-8 sm:p-12 md:flex-row md:items-center">
            <div>
              <p className="eyebrow text-ink-soft">Club Yalla membership</p>
              <p className="display mt-3 text-[clamp(1.7rem,1.3rem+1.2vw,2.4rem)]">
                Explore our 2026–2027 <em>membership rates.</em>
              </p>
              <p className="mt-3 text-ink-soft">View monthly tuition by age group and weekly schedule, along with additional fees and coworking options.</p>
            </div>
            <Button href="/membership" size="lg">
              View membership rates
            </Button>
          </Reveal>
        </div>
      </Section>

      {/* No bottom padding: the closing band sits close under the FAQ. */}
      <ContextualFaq page="club-yalla" className="pt-20 lg:pt-28" />

      <CtaBand
        title={
          <>
            Begin with <em>an application.</em>
          </>
        }
        body="Applications are accepted year-round, first come, first served, depending on cohort availability."
        primary={{ href: "/apply", label: "Apply for Club Yalla" }}
        tight
      />
    </>
  );
}
