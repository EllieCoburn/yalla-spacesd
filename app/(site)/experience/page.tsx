import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import type { MarkName } from "@/components/brand/marks";
import { CtaBand, PageHero, Section, SectionTitle } from "@/components/site/PageParts";
import { Arrow, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { getProgram, programHref } from "@/content/programs";
import { LoopDivider } from "@/components/brand/LoopDivider";

export const metadata: Metadata = {
  title: "The Yalla Experience",
  description: "What every Yalla program shares, and the many ways families take part: weekly membership, drop-in days, camps, and Happenings like immersive play, weekend play and evenings out.",
};

const principles: { mark: MarkName; title: string; body: string }[] = [
  { mark: "bunting", title: "Play is the work", body: "Children learn by doing: building, pouring, painting, digging, pretending. Whatever the occasion, time at Yalla is built around open-ended play." },
  { mark: "waves", title: "Relationships first", body: "Children thrive with adults they trust. Our caregivers take the time to know each child, and each family, by name." },
  { mark: "sprig", title: "Guided with intention", body: "Every material, invitation and transition is chosen on purpose. The environment does a great deal of quiet teaching." },
  { mark: "balcony", title: "Raised in community", body: "Raising children is personal and communal. Yalla is a place for children and their grown-ups to share in it together." },
];

/** Ways to take part, each with a plain line on how it works. */
const ways: { mark: MarkName; title: string; intro: string; items: { slug: string; how: string }[] }[] = [
  {
    mark: "window",
    title: "Care when you need it",
    intro: "Book online, one session at a time.",
    items: [
      { slug: "yalla-flex", how: "Childcare and coworking by the day, Monday to Friday, when a spot opens in your child’s age group." },
      { slug: "camp-yalla", how: "We offer seasonal, play-based camps grounded in our approach to care. Camp days bring art, storytelling, and outdoor discovery together, with time for children to make something of their own and share it with other campers." },
    ],
  },
  {
    mark: "sun",
    title: "Moments together",
    intro: "Play, gatherings and occasions for the whole family.",
    items: [
      { slug: "yalla-happenings", how: "Immersive Play, weekend play, After Hours evenings, pop-ups, workshops and community gatherings, all in one calendar." },
    ],
  },
  {
    mark: "sprig",
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
        lede="A drop-in day, a camp week, a weekend morning, an evening out or a weekly rhythm: every way of joining Yalla rests on the same things. Attentive people, thoughtful spaces, and room to play and connect."
        image={{ src: "/photos/disco-ball.jpg", alt: "A toddler reaching for a mirrored ball that scatters light across the wall" }}
      />

      {/* What every experience shares */}
      <Section tone="paper">
        <div className="shell grid items-center gap-14 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Index n="01">What every visit shares</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Childhood, given <em>room to unfold.</em>
            </h2>
            <p className="lede mt-8 text-ink-soft">
              Our approach to care is rooted in the Reggio Emilia and RIE traditions: play-based, relationship-led and unhurried. Children are
              given beautiful materials, time and full attention, and curiosity sets the pace.
            </p>
            <Link href="/approach" className="mt-6 inline-flex items-center gap-3 text-[0.9rem] hover:text-blue">
              <span className="link-underline">Read about our approach</span>
              <Arrow className="h-3 w-5" />
            </Link>
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <div className="relative ml-auto aspect-[4/5] w-[78%] overflow-hidden rounded-t-[999px] bg-sand lg:w-[85%]">
              <Image src="/photos/instruments.jpg" alt="An infant exploring a drum, bells and a tambourine" fill sizes="(min-width:1024px) 30vw, 78vw" className="object-cover" />
            </div>
          </div>
        </div>

        {/* What every visit shares, side by side (like the values on the About page). */}
        <div className="shell">
          <div className="mt-16 grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:mt-24 lg:grid-cols-4">
            {principles.map((a, i) => (
              <Reveal key={a.title} delay={i * 90} className="bg-paper p-8 lg:p-10">
                <Mark name={a.mark} className="h-12 w-auto text-blue" />
                <h3 className="display mt-10 text-[1.8rem]">{a.title}</h3>
                <p className="mt-3 text-ink-soft">{a.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <LoopDivider />

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
                          <p className="eyebrow flex items-center gap-2 text-[0.58rem] text-ink-soft">
                            {p.motif ? <Mark name={p.motif} className="h-3.5 w-auto text-blue" /> : null}
                            {p.short}
                          </p>
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
                There’s a place <em>for you here.</em>
              </>
            }
          >
            <p>
              Maybe we see you every week, or maybe you join us for camp, a weekend session, or a night out. You’re always welcome at our
              Happenings, too. However you join us, we want Yalla to feel like a place where your child is known, you feel welcome, and
              there’s always someone happy to see you.
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
        secondary={{ href: "/book-a-tour", label: "Book a tour" }}
      />
    </>
  );
}
