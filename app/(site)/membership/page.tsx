import type { Metadata } from "next";
import { cohortMarks } from "@/components/brand/CohortMarks";
import { Mark } from "@/components/brand/Mark";
import { CtaBand, PageHero, Section } from "@/components/site/PageParts";
import { ToConfirm } from "@/components/ui/Draft";
import { Button, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { membershipIncludes, publicCohorts } from "@/content/pricing-public";
import { cohorts, fees, hours, tuitionYear, workspace } from "@/content/tuition";
import { TuitionExplorer } from "@/components/site/TuitionExplorer";

export const metadata: Metadata = {
  title: "Membership & Tuition",
  description: "Club Yalla tuition by cohort and schedule, what every membership includes, and how families get started.",
};

const steps = [
  { mark: "window" as const, title: "Apply", body: "Tell us about your family, your child and the schedule you’re hoping for." },
  { mark: "arch" as const, title: "Visit", body: "When a space opens for your family, we’ll reach out and invite you to tour Yalla and meet the team." },
  { mark: "balcony" as const, title: "Welcome", body: "Set up your Family Portal, add your children’s profiles and complete the required forms." },
  { mark: "sun" as const, title: "First days", body: "We’ll plan a gentle start together, so your child (and you) feel at home." },
];

export default function MembershipPage() {
  return (
    <>
      <PageHero
        eyebrow="Membership & Tuition"
        mark="balcony"
        title={
          <>
            Belong here, <em>week after week.</em>
          </>
        }
        lede="Club Yalla is our membership for daily and weekly families: a steady place for your child in their cohort, and for you in the coworking space."
        image={{ src: "/photos/dinosaurs.jpg", alt: "A child absorbed in play outdoors" }}
      />

      {/* Cohorts & tuition overview */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Index n="01">Cohorts & tuition</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Small cohorts, <em>by design.</em>
              </h2>
            </div>
            <p className="text-[1.05rem] text-ink-soft lg:col-span-6 lg:col-start-7 lg:pt-14">
              Children are cared for in one of our four cohorts, each with a low caregiver-to-child ratio and a small maximum size. Families
              join our core community through a recurring membership, creating a familiar weekly rhythm with consistent days of care. <ToConfirm>Cohort age ranges</ToConfirm>
            </p>
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

          <div className="mt-20 border-t border-line pt-14">
            <h3 className="display text-[clamp(1.8rem,1.4rem+1.4vw,2.6rem)]">
              {tuitionYear} <em>tuition.</em>
            </h3>
            <p className="mt-3 max-w-2xl text-ink-soft">
              Monthly tuition for one to five days a week, full or half days. Each table ends with the Yalla Flex drop-in rate for that cohort.
            </p>
            <div className="mt-10">
              <TuitionExplorer cohorts={cohorts} hours={hours} />
            </div>
          </div>
        </div>
      </Section>

      {/* Included */}
      <Section>
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Index n="02">Every membership includes</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Everything, <em>considered.</em>
            </h2>
            <p className="mt-6 text-ink-soft">Communal coworking is part of every membership. Private desks and offices are available for more privacy.</p>
          </div>
          <div className="lg:col-span-7 lg:col-start-6 lg:pt-4">
            <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {membershipIncludes.map((x) => (
                <li key={x} className="hairline flex items-start gap-4 border-t pt-5 text-[1.02rem]">
                  <Mark name="sun" className="mt-1.5 h-3 w-3 shrink-0 text-blue" />
                  {x}
                </li>
              ))}
            </ul>

            <p className="eyebrow mt-16 text-ink-soft">Fees</p>
            <dl className="mt-5 divide-y divide-line border-y border-line">
              {fees.map((f) => (
                <div key={f.label} className="flex items-baseline justify-between gap-6 py-5">
                  <dt>
                    <span className="block text-[1rem]">{f.label}</span>
                    <span className="text-[0.82rem] text-ink-soft">{f.note}</span>
                  </dt>
                  <dd className="font-serif text-[1.35rem] whitespace-nowrap">{f.amount}</dd>
                </div>
              ))}
            </dl>

            <p className="eyebrow mt-16 text-ink-soft">Workspace upgrades</p>
            <p className="mt-3 text-[0.95rem] text-ink-soft">For more privacy, add a desk or office of your own.</p>
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

      <section className="roofline-edge bg-blue text-blue">
        <div className="py-20 text-chalk lg:py-32">
          <div className="shell">
            <p className="eyebrow text-chalk/60">03 · Getting started</p>
            <h2 className="display mt-6 max-w-2xl text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Four steps <em className="text-mist!">to your first day.</em>
            </h2>
            <ol className="mt-16 grid gap-px overflow-hidden bg-chalk/20 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 100} className="bg-blue p-8 lg:p-10">
                  <Mark name={s.mark} className="h-12 w-auto text-chalk" />
                  <p className="mt-10 font-serif text-mist italic">0{i + 1}</p>
                  <h3 className="display mt-2 text-[1.8rem]">{s.title}</h3>
                  <p className="mt-3 text-chalk/75">{s.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <CtaBand
        title={
          <>
            Begin with <em>an application.</em>
          </>
        }
        body="Spaces open rarely. Apply, and we’ll reach out when there’s a place for your family."
        primary={{ href: "/apply", label: "Apply now" }}
        secondary={{ href: "/faq", label: "Read the FAQ" }}
      />
    </>
  );
}
