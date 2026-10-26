import type { Metadata } from "next";
import { ApplicationForm } from "@/components/site/ApplicationForm";
import { Mark } from "@/components/brand/Mark";
import type { MarkName } from "@/components/brand/marks";
import { PageHero } from "@/components/site/PageParts";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Apply",
  description: "Apply for a Club Yalla membership. Applications are accepted year-round, first come, first served, depending on cohort availability.",
};

const steps: { mark: MarkName; title: string; body: string }[] = [
  {
    mark: "sun",
    title: "The cohort year",
    body: "Club Yalla runs year-round, August through July. Children move up to their next cohort at the beginning of each new cohort year.",
  },
  {
    mark: "balcony",
    title: "Applying for next year",
    body: "We strongly recommend applying for the next cohort year. Onboarding for the coming year’s cohorts happens each May.",
  },
  {
    mark: "window",
    title: "Joining mid-year",
    body: "If you apply mid-year and are accepted, your child is matched with the cohort of peers that best aligns with their age and developmental readiness.",
  },
  {
    mark: "arch",
    title: "The cohort waitlist",
    body: "If there are no spots, your family is placed on a cohort waitlist and matched with Club Yalla’s soonest available spot.",
  },
];

export default function ApplyPage() {
  return (
    <>
      <PageHero
        eyebrow="Apply · Club Yalla"
        mark="balcony"
        title={
          <>
            We’d love to welcome you <em>to the Yalla family.</em>
          </>
        }
        lede="Applications are accepted year-round, on a first-come, first-served basis depending on cohort availability."
      />
      <section className="pb-16 lg:pb-20">
        <div className="shell">
          <p className="eyebrow text-ink-soft">How enrollment works</p>
          <ol className="mt-8 grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 90} className="bg-chalk p-7 lg:p-8">
                <Mark name={s.mark} className="h-10 w-auto text-blue" />
                <h2 className="display mt-8 text-[1.45rem]">{s.title}</h2>
                <p className="mt-3 text-[0.95rem] text-ink-soft">{s.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="pb-24 lg:pb-32">
        <div className="shell">
          <div className="mx-auto max-w-3xl bg-paper p-7 sm:p-12">
            <ApplicationForm />
          </div>
        </div>
      </section>
    </>
  );
}
