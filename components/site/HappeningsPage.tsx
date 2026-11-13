import Image from "next/image";
import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import { HappeningsCalendar } from "@/components/site/HappeningsCalendar";
import { ProgramDates } from "@/components/site/ProgramDates";
import { Arrow, Button, Chevron, Eyebrow } from "@/components/ui/primitives";
import { IMMERSIVE_FAQ } from "@/content/happenings";
import type { ProgramContent } from "@/content/programs";

const kinds = [
  {
    id: "immersive-play",
    dot: "bg-blue",
    name: "Immersive Play Sessions",
    body: "Three-hour blocks for children to settle in, follow their curiosity and go deep in their play.",
    facts: ["Ages 3 – 8", "9:00am – 12:00pm", "$45 per child", "Coworking for you +$15"],
  },
  {
    id: "weekend-play",
    dot: "bg-oxblood",
    name: "Weekend Play Sessions",
    body: "A morning or afternoon of play, with children in separate groups alongside others close to their age.",
    facts: ["Ages 18 months – 10 years", "Morning 9:00am – 12:00pm", "Afternoon 1:00 – 4:00pm", "$60 per child"],
  },
  {
    id: "calendar",
    dot: "bg-ink/40",
    name: "Pop-ups & gatherings",
    body: "Workshops, seasonal events and community gatherings that make family life feel a little less solitary.",
    facts: ["Details with each event"],
  },
];

/** Yalla Happenings: one calendar for Immersive Play, weekend play sessions, pop-ups and more. */
export function HappeningsPage({ p }: { p: ProgramContent }) {
  return (
    <>
      {/* Header */}
      <section className="pt-32 pb-14 lg:pt-40 lg:pb-16">
        <div className="shell">
          <Link href="/programs" className="eyebrow inline-flex items-center gap-3 text-ink-soft hover:text-ink">
            <Arrow className="h-3 w-4 rotate-180" /> All programs
          </Link>
          <div className="mt-10 grid items-end gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Eyebrow className="flex items-center gap-3">
                {p.motif ? <Mark name={p.motif} className="h-5 w-auto text-blue" /> : null}
                {p.name}
              </Eyebrow>
              <h1 className="display mt-6 text-[clamp(2.8rem,1.6rem+4.4vw,5.6rem)]">
                Play, gatherings <em>and more.</em>
              </h1>
              <p className="mt-6 max-w-lg text-[1.1rem] text-ink-soft">
                Happenings are how we gather: immersive play, weekend play sessions, workshops and community events, all in one calendar.
              </p>
              <div className="mt-10">
                <Button href="#calendar" size="lg">
                  See what’s on
                </Button>
              </div>
            </div>
            <div className="hidden lg:col-span-4 lg:col-start-9 lg:block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-t-[999px] bg-sand">
                <Image src={p.image} alt={p.imageAlt} fill priority sizes="30vw" className="object-cover" />
              </div>
            </div>
          </div>

          {/* The kinds of Happenings */}
          <div className="mt-16 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
            {kinds.map((k) => (
              <a key={k.name} href={`#${k.id}`} className="group bg-chalk p-7 transition-colors hover:bg-paper">
                <p className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${k.dot}`} aria-hidden />
                  <span className="display text-[1.45rem]">{k.name}</span>
                </p>
                <p className="mt-3 text-[0.95rem] text-ink-soft">{k.body}</p>
                <ul className="mt-5 space-y-1 text-[0.85rem]">
                  {k.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Master calendar */}
      <section id="calendar" className="scroll-mt-24 bg-paper py-16 lg:py-24">
        <div className="shell">
          <div className="max-w-4xl">
            <h2 className="display text-[clamp(2rem,1.5rem+1.6vw,3rem)]">
              What’s <em>on.</em>
            </h2>
            <p className="mt-3 text-ink-soft">Every upcoming Happening. Choose one to book, or join the waitlist when it’s full.</p>
            <div className="mt-8">
              <HappeningsCalendar />
            </div>
          </div>
        </div>
      </section>

      {/* Immersive Play */}
      <section id="immersive-play" className="scroll-mt-24 py-16 lg:py-24">
        <div className="shell">
          <Eyebrow className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-blue" aria-hidden /> Immersive Play Sessions
          </Eyebrow>
          <div className="mt-6 grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h2 className="display text-[clamp(2.2rem,1.5rem+2.2vw,3.6rem)]">
                Three hours of <em>deep play.</em>
              </h2>
              <div className="mt-6 space-y-5 text-[1.05rem] leading-relaxed">
                <p>
                  Our Immersive Play Sessions offer three-hour blocks for children to settle in, follow their curiosity, and go deep in their play. Thoughtfully prepared play
                  landscapes invite them to build, imagine, experiment, and take their ideas in unexpected directions. Guides stay close to offer gentle redirection, help navigate
                  social-emotional conflicts, and support as needed, while giving children space to lead.
                </p>
                <p className="font-serif text-[1.3rem] text-blue italic">
                  This is time for their imaginations to wander, their play to unfold, and the magic of their own ideas to come to life.
                </p>
              </div>
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {[
                  ["Hours", "9:00am – 12:00pm"],
                  ["Ages", "3 – 8 years"],
                  ["Price", "$45 per child"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <dt className="eyebrow text-[0.6rem] text-ink-soft">{l}</dt>
                    <dd className="mt-1 font-serif text-[1.35rem]">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 max-w-xl border-l-2 border-blue/40 pl-3 text-[0.92rem] leading-relaxed">
                Staying while they play? Add coworking for you, +$15 per session. Or say goodbye at arrival and come back for departure at 12:00pm.
              </p>
            </div>
            <dl className="space-y-4 lg:col-span-4 lg:col-start-9 lg:pt-4">
              {[
                ["9:00am", "Arrival. Children settle in and the play begins."],
                ["11:30am", "The group gathers for lunch together. Please pack a lunch from home."],
                ["12:00pm", "Departure. Children rejoin their families."],
              ].map(([t, d]) => (
                <div key={t} className="grid grid-cols-[5rem_1fr] gap-3">
                  <dt className="font-serif text-[1.1rem]">{t}</dt>
                  <dd className="text-ink-soft">{d}</dd>
                </div>
              ))}
            </dl>
          </div>

          <h3 className="display mt-16 text-[clamp(1.7rem,1.3rem+1.2vw,2.4rem)]">
            Choose your <em>sessions.</em>
          </h3>
          <div className="mt-6 max-w-4xl">
            <ProgramDates kind="happening" program="immersive-play" groups={[{ key: "a", label: "3 – 8 yrs", minAge: 36, maxAge: 107, priceCents: 4500 }]} unit="day" horizonDays={365} />
          </div>

          <div className="mt-20 grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Eyebrow>Questions</Eyebrow>
              <h3 className="display mt-5 text-[clamp(1.8rem,1.4rem+1.4vw,2.6rem)]">
                About <em>Immersive Play.</em>
              </h3>
            </div>
            <div className="hairline border-t lg:col-span-8">
              {IMMERSIVE_FAQ.map((it) => (
                <details key={it.q} className="group hairline border-b">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 [&::-webkit-details-marker]:hidden">
                    <span className="display text-[1.3rem] leading-snug! sm:text-[1.5rem]">{it.q}</span>
                    <Chevron className="mt-3 h-2.5 w-4 shrink-0 text-ink" />
                  </summary>
                  <div className="max-w-2xl space-y-4 pb-8 text-[1.02rem] text-ink-soft">
                    {it.a.map((para) => (
                      <p key={para.slice(0, 40)}>{para}</p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Weekend Play */}
      <section id="weekend-play" className="scroll-mt-24 bg-paper py-16 lg:py-24">
        <div className="shell grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Eyebrow className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-oxblood" aria-hidden /> Weekend Play Sessions
            </Eyebrow>
            <h2 className="display mt-6 text-[clamp(2.2rem,1.5rem+2.2vw,3.6rem)]">
              A little room <em>in your weekend.</em>
            </h2>
            <p className="mt-6 text-[1.05rem] leading-relaxed">
              Weekend Play Sessions bring Yalla’s calm and creativity to the weekend: a morning or afternoon of play for your child while you work, run errands or simply rest.
              Children spend the session in a separate group with others close to their own age, each with plans suited to them.
            </p>
            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
              {[
                ["Morning", "9:00am – 12:00pm"],
                ["Afternoon", "1:00 – 4:00pm"],
                ["Price", "$60 per child"],
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="eyebrow text-[0.6rem] text-ink-soft">{l}</dt>
                  <dd className="mt-1 font-serif text-[1.35rem]">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-10">
              <Button href="#calendar">Find a weekend play session</Button>
            </div>
          </div>
          <div className="lg:col-span-4 lg:col-start-9">
            <p className="eyebrow text-[0.62rem] text-ink-soft">Separate age groups</p>
            <div className="mt-3 space-y-0.5">
              <p>18 months – 4 years</p>
              <p>4 – 7 years</p>
              <p>7 – 10 years</p>
            </div>
            <p className="mt-8 eyebrow text-[0.62rem] text-ink-soft">Questions?</p>
            <p className="mt-3">
              <Link href="/faq" className="underline underline-offset-4 hover:text-blue">
                Read the FAQ
              </Link>{" "}
              or{" "}
              <Link href="/visit" className="underline underline-offset-4 hover:text-blue">
                book a tour
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
