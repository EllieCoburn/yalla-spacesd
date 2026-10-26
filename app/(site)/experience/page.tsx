import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import type { MarkName } from "@/components/brand/marks";
import { CtaBand, PageHero, Section, SectionTitle } from "@/components/site/PageParts";
import { Arrow, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { getProgram, programHref } from "@/content/programs";

export const metadata: Metadata = {
  title: "The Yalla Experience",
  description: "What every Yalla program shares, and the many ways families take part: weekly membership, drop-in days, camps, weekends, evenings, pop-ups and private celebrations.",
};

const principles = [
  { title: "Play is the work", body: "Children learn by doing: building, pouring, painting, digging, pretending. Whatever the occasion, time at Yalla is built around open-ended play." },
  { title: "Relationships first", body: "Children thrive with adults they trust. Our caregivers take the time to know each child, and each family, by name." },
  { title: "Guided with intention", body: "Every material, invitation and transition is chosen on purpose. The environment does a great deal of quiet teaching." },
  { title: "Raised in community", body: "Raising children is personal and communal. Yalla is a place for children and their grown-ups to share in it together." },
];

/** Ways to take part, each with a plain line on how it works. */
const ways: { mark: MarkName; title: string; intro: string; items: { slug: string; how: string }[] }[] = [
  {
    mark: "window",
    title: "Care when you need it",
    intro: "Book online, one session at a time.",
    items: [
      { slug: "yalla-flex", how: "Childcare and coworking by the day, Monday to Friday, when there’s space." },
      { slug: "camp-yalla", how: "Themed weeks, booked as a set so friends and educators stay the same." },
      { slug: "yalla-weekends", how: "A few hours of weekend care while you work, run errands or rest." },
      { slug: "yalla-after-hours", how: "An evening of play for children while parents enjoy a night out." },
    ],
  },
  {
    mark: "sun",
    title: "Moments together",
    intro: "Gatherings and occasions for the whole family.",
    items: [
      { slug: "yalla-happenings", how: "Pop-ups, workshops and community gatherings on a changing calendar." },
      { slug: "yalla-celebrations", how: "Private parties and special occasions, planned with you." },
    ],
  },
  {
    mark: "balcony",
    title: "A weekly rhythm",
    intro: "A weekly home for a small community of families.",
    items: [{ slug: "club-yalla", how: "Consistent weekdays in a small cohort, with parents working onsite in our coworking space." }],
  },
];

export default function ExperiencePage() {
  return (
    <>
      <PageHero
        eyebrow="The Yalla Experience"
        mark="arch"
        title={
          <>
            One way of caring, <em>many ways in.</em>
          </>
        }
        lede="A drop-in day, a camp week, a weekend morning, an evening out, a celebration or a weekly rhythm: every way of joining Yalla rests on the same things. Attentive people, thoughtful spaces, and room to play and connect."
        image={{ src: "/photos/disco-ball.jpg", alt: "A toddler reaching for a mirrored ball that scatters light across the wall" }}
      />

      {/* What every experience shares */}
      <Section tone="paper">
        <div className="shell grid items-start gap-14 lg:grid-cols-12">
          <div className="lg:sticky lg:top-32 lg:col-span-5">
            <Index n="01">What every visit shares</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Childhood, given <em>room to unfold.</em>
            </h2>
            <div className="relative mt-12 aspect-[4/5] w-[80%] overflow-hidden rounded-t-[999px] bg-sand">
              <Image src="/photos/instruments.jpg" alt="An infant exploring a drum, bells and a tambourine" fill sizes="(min-width:1024px) 30vw, 80vw" className="object-cover" />
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <p className="lede text-ink-soft">
              Our approach to care is rooted in the Reggio Emilia and RIE traditions: play-based, relationship-led and unhurried. Children are
              given beautiful materials, time and full attention, and curiosity sets the pace.
            </p>
            <div className="mt-14 space-y-12">
              {principles.map((a, i) => (
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

      {/* Ways to take part */}
      <Section>
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Index n="02">Ways to take part</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                We’re here <em>when you need us.</em>
              </h2>
            </div>
            <p className="text-[1.05rem] text-ink-soft lg:col-span-6 lg:col-start-7 lg:pt-14">
              Each program has its own shape: some let you head out for a while, some keep you close by, some are for the whole family. Every program page
              explains how it works.
            </p>
          </div>

          <div className="mt-16 space-y-16 lg:space-y-20">
            {ways.map((w) => (
              <div key={w.title} className="grid gap-8 border-t border-line pt-10 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <Mark name={w.mark} className="h-12 w-auto text-blue" />
                  <h3 className="display mt-6 text-[1.9rem]">{w.title}</h3>
                  <p className="mt-2 text-ink-soft">{w.intro}</p>
                </div>
                <ul className="grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:col-span-8">
                  {w.items.map((it, i) => {
                    const p = getProgram(it.slug)!;
                    return (
                      <Reveal as="li" key={it.slug} delay={i * 80} className={`bg-chalk ${w.items.length === 1 ? "sm:col-span-2" : ""}`}>
                        <Link href={programHref(p)} className="group flex h-full flex-col p-7 lg:p-8">
                          <p className="eyebrow text-[0.58rem] text-ink-soft">{p.short}</p>
                          <p className="display mt-2 text-[1.55rem] transition-colors group-hover:text-blue">{p.name}</p>
                          <p className="mt-3 flex-1 text-[0.95rem] text-ink-soft">{it.how}</p>
                          <span className="mt-6 inline-flex items-center gap-3 text-[0.82rem]">
                            <span className="link-underline">Learn more</span>
                            <Arrow className="h-3 w-5" />
                          </span>
                        </Link>
                      </Reveal>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Community */}
      <Section tone="paper">
        <div className="shell grid items-center gap-14 lg:grid-cols-12">
          <SectionTitle
            className="lg:col-span-5"
            eyebrow="03 · Community"
            title={
              <>
                Your village, <em>however you join.</em>
              </>
            }
          >
            <p>
              Some families are here every week. Others come for a camp, a weekend session or a night out, and everyone is welcome at our
              Happenings. However often you’re here, you’re part of a community of children and grown-ups who make family life feel a
              little less solitary.
            </p>
          </SectionTitle>
          <div className="relative lg:col-span-6 lg:col-start-7">
            <div className="relative aspect-[5/4] overflow-hidden bg-sand">
              <Image src="/photos/collage-wall.jpg" alt="A collaborative cardboard collage on the play garden fence" fill sizes="(min-width:1024px) 45vw, 90vw" className="object-cover" />
            </div>
            <Mark name="palm" className="absolute -top-14 -right-2 h-40 w-auto text-blue sm:-right-8" />
          </div>
        </div>
      </Section>

      <CtaBand
        title={
          <>
            Find your <em>way in.</em>
          </>
        }
        body="Browse every program, or come and see the space for yourself."
        primary={{ href: "/programs", label: "Explore programs" }}
        secondary={{ href: "/visit", label: "Book a tour" }}
      />
    </>
  );
}
