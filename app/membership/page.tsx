import type { Metadata } from "next";
import { Mark } from "@/components/brand/Mark";
import { CtaBand, PageHero, Section } from "@/components/site/PageParts";
import { TuitionExplorer } from "@/components/site/TuitionExplorer";
import { ToConfirm } from "@/components/ui/Draft";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { fees, membershipIncludes, tuitionYear, workspace } from "@/content/tuition";

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

      {/* Tuition */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Index n="01">{tuitionYear} tuition</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Small cohorts, <em>by design.</em>
              </h2>
            </div>
            <p className="text-[1.05rem] text-ink-soft lg:col-span-6 lg:col-start-7 lg:pt-14">
              Children are cared for in four cohorts, each with a low caregiver-to-child ratio and a small maximum size. Choose full days or half
              days, one to five days a week. <ToConfirm>Cohort age ranges</ToConfirm>
            </p>
          </div>
          <div className="mt-14">
            <TuitionExplorer />
          </div>
        </div>
      </Section>

      {/* Included + fees */}
      <Section>
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Index n="02">Every membership includes</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Everything, <em>considered.</em>
            </h2>
            <ul className="mt-10 space-y-4">
              {membershipIncludes.map((x) => (
                <li key={x} className="flex items-start gap-4 text-[1.02rem]">
                  <Mark name="sun" className="mt-1.5 h-3 w-3 shrink-0 text-blue" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <p className="eyebrow text-ink-soft">Fees</p>
            <dl className="mt-6 divide-y divide-line border-y border-line">
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
            <p className="mt-3 text-[0.95rem] text-ink-soft">Communal coworking is included. For more privacy, add a desk or office of your own.</p>
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
