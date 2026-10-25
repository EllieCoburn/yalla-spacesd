import type { Metadata } from "next";
import { Mark } from "@/components/brand/Mark";
import { CtaBand, Facts, PageHero, Section } from "@/components/site/PageParts";
import { Draft, ToConfirm } from "@/components/ui/Draft";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Membership & Tuition",
  description: "Recurring enrollment at Yalla: what tuition includes and how families get started.",
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
        lede="Membership is our recurring enrollment for Yalla Everyday: a steady place for your child in their classroom, and for you in the coworking space."
        image={{ src: "/photos/dinosaurs.jpg", alt: "A child absorbed in play outdoors" }}
      />

      <Section tone="paper">
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Index n="01">Enrollment options</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              A rhythm that <em>fits.</em>
            </h2>
            <p className="mt-6 text-ink-soft">Choose the weekly schedule that suits your family. Extended care can be added.</p>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Draft note="Yalla to provide plans & tuition">
              <div className="grid gap-px overflow-hidden bg-line sm:grid-cols-3">
                {["Plan one", "Plan two", "Plan three"].map((name, i) => (
                  <div key={name} className="flex flex-col bg-chalk p-8">
                    <Mark name={(["arch", "window", "balcony"] as const)[i]} className="h-10 w-auto self-start text-blue" />
                    <p className="display mt-8 text-[1.6rem]">{name}</p>
                    <p className="mt-2 text-[0.9rem] text-ink-soft">Days per week, hours and tuition</p>
                    <p className="mt-6">
                      <ToConfirm />
                    </p>
                  </div>
                ))}
              </div>
            </Draft>
          </div>
        </div>
      </Section>

      <Section>
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Index n="02">What tuition includes</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Everything, <em>considered.</em>
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Facts
              items={[
                { label: "Childcare", value: "Play-based care with Yalla educators, weekdays 8:30am – 4:30pm" },
                { label: "Coworking", value: <>Onsite workspace for parents & caregivers <ToConfirm /></> },
                { label: "Extended care", value: <>Optional add-on <ToConfirm>Pricing</ToConfirm></> },
                { label: "Meals & snacks", value: <ToConfirm /> },
                { label: "Materials", value: <ToConfirm /> },
                { label: "Community", value: <>Family gatherings & events <ToConfirm /></> },
              ]}
            />
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
