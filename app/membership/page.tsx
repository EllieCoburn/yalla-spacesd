import type { Metadata } from "next";
import { Mark } from "@/components/brand/Mark";
import { CtaBand, PageHero, Section } from "@/components/site/PageParts";
import { ToConfirm } from "@/components/ui/Draft";
import { Button, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { membershipIncludes, publicCohorts, publicPricing } from "@/content/pricing-public";

export const metadata: Metadata = {
  title: "Membership & Tuition",
  description: "Yalla Everyday tuition by cohort and schedule, what every membership includes, and how families get started.",
};

const steps = [
  { mark: "arch" as const, title: "Visit", body: "Tour Yalla, meet the team and ask everything you want to know." },
  { mark: "window" as const, title: "Apply", body: "Tell us about your family, your child and the schedule you’re hoping for." },
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
        lede="Membership is our recurring enrollment for Yalla Everyday: a steady place for your child in their cohort, and for you in the coworking space."
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

          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4">
            {publicCohorts.map((c, i) => (
              <Reveal key={c.name} delay={i * 80} className="bg-paper p-7 lg:p-9">
                <Mark name={(["sun", "arch", "window", "palm"] as const)[i]} className="h-10 w-auto text-blue" />
                <p className="display mt-8 text-[1.8rem]">{c.name}</p>
                <dl className="mt-5 space-y-2 text-[0.9rem]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-soft">Ratio</dt>
                    <dd className="font-serif text-[1.05rem]">{c.ratio} max</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-soft">Cohort size</dt>
                    <dd className="font-serif text-[1.05rem]">{c.maxSize} children max</dd>
                  </div>
                </dl>
              </Reveal>
            ))}
          </div>

          <div className="mt-16 grid gap-10 border-t border-line pt-12 lg:grid-cols-12">
            <div className="grid grid-cols-2 gap-8 lg:col-span-6">
              <div>
                <p className="eyebrow text-[0.6rem] text-ink-soft">Yalla Everyday</p>
                <p className="mt-3 text-[0.9rem] text-ink-soft">Monthly tuition from</p>
                <p className="display text-[3rem] text-blue">{publicPricing.tuitionFrom}</p>
                <p className="text-[0.85rem] text-ink-soft">{publicPricing.tuitionFromNote}</p>
              </div>
              <div>
                <p className="eyebrow text-[0.6rem] text-ink-soft">Yalla Flex</p>
                <p className="mt-3 text-[0.9rem] text-ink-soft">Drop-in care from</p>
                <p className="display text-[3rem] text-blue">{publicPricing.flexFrom}</p>
                <p className="text-[0.85rem] text-ink-soft">{publicPricing.flexFromNote}</p>
              </div>
            </div>
            <div className="lg:col-span-5 lg:col-start-8">
              <p className="display text-[1.6rem]">
                Current rates, <em>shared personally.</em>
              </p>
              <p className="mt-3 text-ink-soft">
                Full tuition by cohort and schedule, fees and workspace options are in our Prospective Family Portal. Reach out and we’ll send
                you access.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button href="/prospective">Request access</Button>
                <Button href="/prospective" variant="ghost">
                  I have a code
                </Button>
              </div>
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
          <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:col-span-7 lg:col-start-6 lg:pt-4">
            {membershipIncludes.map((x) => (
              <li key={x} className="hairline flex items-start gap-4 border-t pt-5 text-[1.02rem]">
                <Mark name="sun" className="mt-1.5 h-3 w-3 shrink-0 text-blue" />
                {x}
              </li>
            ))}
          </ul>
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
            Start with <em>a visit.</em>
          </>
        }
        body="Every family’s Yalla story begins with a tour."
        primary={{ href: "/visit", label: "Schedule a tour" }}
        secondary={{ href: "/faq", label: "Read the FAQ" }}
      />
    </>
  );
}
