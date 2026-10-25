import type { Metadata } from "next";
import Image from "next/image";
import { Mark } from "@/components/brand/Mark";
import { CtaBand, PageHero, Section, SectionTitle } from "@/components/site/PageParts";
import { Draft } from "@/components/ui/Draft";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "The Yalla Experience",
  description: "How parent-onsite childcare works at Yalla: our play-based approach, the rhythm of the day, and the community around it.",
};

const steps = [
  {
    mark: "arch" as const,
    title: "You arrive together",
    body: "Mornings begin side by side. Your child is welcomed into the classroom by educators who know them well.",
  },
  {
    mark: "window" as const,
    title: "You settle in to work",
    body: "Head to the coworking space and have a proper workday, with desks, quiet and a community of parents who understand.",
  },
  {
    mark: "sun" as const,
    title: "They spend the day playing",
    body: "Children play, explore, create and build friendships at their own pace, guided by educators who plan with intention.",
  },
  {
    mark: "palm" as const,
    title: "You're close the whole time",
    body: "You're never far away. At the end of the day you leave together, often with a story or two.",
  },
];

const approach = [
  { title: "Play is the work", body: "Children learn by doing: building, pouring, painting, digging, pretending. Our days are designed around open-ended play, not worksheets." },
  { title: "Relationships first", body: "Children thrive with adults they trust. Our cohorts let educators truly know each child, and each family." },
  { title: "Guided with intention", body: "Every material, invitation and transition is chosen on purpose. The environment does a great deal of quiet teaching." },
  { title: "Raised in community", body: "Raising children is personal and communal. At Yalla, families share the everyday rhythms of work, play and care." },
];

export default function ExperiencePage() {
  return (
    <>
      <PageHero
        eyebrow="The Yalla Experience"
        mark="arch"
        title={
          <>
            A day that works for <em>everyone</em> in it.
          </>
        }
        lede="Yalla was built around one idea: you shouldn't have to choose between being close to your child and doing meaningful work. Here's how a day comes together."
        image={{ src: "/photos/painting.jpg", alt: "Children painting together at a low table" }}
      />

      {/* Parent-onsite care */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Index n="01">Parent-onsite care</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Down the hall, <em>not across town.</em>
              </h2>
            </div>
            <ol className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
              {steps.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 100} className="hairline border-t pt-8">
                  <div className="flex items-start justify-between">
                    <span className="font-serif text-ink-soft italic">0{i + 1}</span>
                    <Mark name={s.mark} className="h-10 w-auto text-blue" />
                  </div>
                  <h3 className="display mt-6 text-[1.65rem]">{s.title}</h3>
                  <p className="mt-3 text-ink-soft">{s.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* Approach */}
      <Section>
        <div className="shell grid items-start gap-14 lg:grid-cols-12">
          <div className="lg:sticky lg:top-32 lg:col-span-5">
            <Index n="02">Our approach</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Childhood, given <em>room to unfold.</em>
            </h2>
            <div className="relative mt-12 aspect-[4/5] w-[80%] overflow-hidden rounded-t-[999px] bg-sand">
              <Image src="/photos/lemon-play.jpg" alt="A child exploring a water table with lemons" fill sizes="(min-width:1024px) 30vw, 80vw" className="object-cover" />
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <p className="lede text-ink-soft">
              Our programs are play-based, relationship-led and unhurried. We give children beautiful materials, time and trusted adults, and
              let their curiosity set the pace.
            </p>
            <div className="mt-14 space-y-12">
              {approach.map((a, i) => (
                <Reveal key={a.title} delay={i * 80} className="hairline grid gap-4 border-t pt-8 sm:grid-cols-[3rem_1fr]">
                  <span className="font-serif text-blue italic">0{i + 1}</span>
                  <div>
                    <h3 className="display text-[1.7rem]">{a.title}</h3>
                    <p className="mt-3 text-ink-soft">{a.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Daily rhythm */}
      <section className="roofline-edge bg-blue text-blue">
        <div className="py-20 text-chalk lg:py-32">
          <div className="shell grid gap-14 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="eyebrow text-chalk/60">03 · Daily rhythm</p>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Predictable, <em className="text-mist!">never rigid.</em>
              </h2>
              <p className="mt-6 text-chalk/75">
                Young children flourish with a gentle, familiar shape to the day, with plenty of space inside it for wonder.
              </p>
            </div>
            <div className="lg:col-span-7 lg:col-start-6">
              <Draft note="Yalla to confirm the day’s rhythm">
                <ol className="divide-y divide-chalk/20 border-y border-chalk/20">
                  {[
                    ["8:30", "Arrival & welcome", "Families arrive together; children ease in with open play."],
                    ["Morning", "Gathering & invitations", "A small-group gathering, then invitations to create, build and explore."],
                    ["Midday", "Lunch & rest", "Shared meals and rest, shaped to each child’s age and needs."],
                    ["Afternoon", "Outdoors", "Time in the yard and the neighbourhood: digging, climbing, noticing."],
                    ["4:30", "Together again", "Pick-up, a few stories from the day, and home. Extended care is available."],
                  ].map(([t, h, b]) => (
                    <li key={h} className="grid grid-cols-[5.5rem_1fr] gap-4 py-6 sm:grid-cols-[7rem_1fr]">
                      <span className="font-serif text-[1.05rem] text-mist italic">{t}</span>
                      <div>
                        <p className="display text-[1.4rem]">{h}</p>
                        <p className="mt-1 text-[0.95rem] text-chalk/70">{b}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Draft>
            </div>
          </div>
        </div>
      </section>

      {/* Community */}
      <Section>
        <div className="shell grid items-center gap-14 lg:grid-cols-12">
          <SectionTitle
            className="lg:col-span-5"
            eyebrow="04 · Community"
            title={
              <>
                Your village, <em>under one roof.</em>
              </>
            }
          >
            <p>
              Yalla is a living community of parents, children and educators who share the daily rhythms of work, play and care. Beyond the
              workday, we gather for moments that make modern family life feel a little less solitary.
            </p>
          </SectionTitle>
          <div className="relative lg:col-span-6 lg:col-start-7">
            <div className="relative aspect-[5/4] overflow-hidden bg-sand">
              <Image src="/photos/sunflowers.jpg" alt="Sunflowers arranged on a shared table" fill sizes="(min-width:1024px) 45vw, 90vw" className="object-cover" />
            </div>
            <Mark name="palm" className="absolute -top-14 -right-2 h-40 w-auto text-blue sm:-right-8" />
          </div>
        </div>
      </Section>

      <CtaBand
        title={
          <>
            See a Yalla day <em>for yourself.</em>
          </>
        }
        body="Tours are the best way to feel the rhythm of the place."
        primary={{ href: "/visit", label: "Schedule a tour" }}
        secondary={{ href: "/programs", label: "Explore programs" }}
      />
    </>
  );
}
