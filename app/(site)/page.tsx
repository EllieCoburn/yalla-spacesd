import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AvailabilityGlance } from "@/components/booking/AvailabilityGlance";
import { Facade } from "@/components/brand/Facade";
import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";
import { Arrow, Button, Eyebrow, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { otherPrograms } from "@/content/programs";

export const metadata: Metadata = { title: "Home" };

export default function Home() {
  return (
    <>
      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden pt-28 lg:pt-36">
        <div className="shell grid items-center gap-12 pb-8 lg:grid-cols-12 lg:gap-8 lg:pb-10">
          <div className="lg:col-span-6 xl:col-span-6">
            <Reveal>
              <Eyebrow>Coworking. Childcare. Community.</Eyebrow>
            </Reveal>
            <Reveal delay={120}>
              <h1 className="display mt-7 text-[clamp(3.1rem,1.6rem+5.4vw,6.6rem)]">
                Early childhood, <em>reimagined.</em>
              </h1>
            </Reveal>
            <Reveal delay={240}>
              <p className="mt-8 max-w-[34rem] text-[1.05rem] leading-relaxed text-ink-soft lg:text-[1.125rem]">
                Yalla is a community for children and their grown-ups, offering thoughtfully designed childcare, coworking, and experiences for
                family life in San Diego.
              </p>
            </Reveal>
            <Reveal delay={360} className="mt-10 flex flex-wrap items-center gap-3">
              <Button href="/programs" size="lg">
                Explore programs
              </Button>
              <Button href="/book" variant="outline" size="lg">
                Book care
              </Button>
            </Reveal>
          </div>

          <Reveal delay={200} className="lg:col-span-6 xl:col-span-5 xl:col-start-8">
            <Facade
              tower={{ src: "/photos/cowork-atrium.webp", alt: "The coworking atrium at Yalla, seen from the balcony above" }}
              door={{ src: "/photos/garden-doorway.jpg", alt: "Toddlers at an open door looking out to the sunny play garden" }}
              porthole={{ src: "/photos/rainbow-light.jpg", alt: "A toddler standing in rainbow light on a wooden floor" }}
            />
          </Reveal>
        </div>
      </section>

      {/* ───────── Statement ───────── */}
      <section className="pt-12 pb-24 lg:pt-16 lg:pb-36">
        <div className="shell">
          <Reveal className="mx-auto max-w-5xl text-center">
            <Mark name="dotsun" className="mx-auto mb-10 h-11 w-11 text-blue" />
            <p className="display text-[clamp(1.9rem,1.2rem+2.6vw,3.6rem)] leading-[1.15]!">
              A community in the heart of San Diego, <em>built by and for modern families</em> with young children.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───────── Ways to belong ───────── */}
      <section className="pb-24 lg:pb-36">
        <div className="shell">
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Index n="01">Ways to belong</Index>
              <h2 className="display mt-6 text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
                There’s more than one <em>way to Yalla.</em>
              </h2>
              <p className="mt-6 text-ink-soft">
                From flexible childcare and seasonal camps to family gatherings and a weekly rhythm with Club Yalla, there are plenty of
                ways to make Yalla part of your family’s life.
              </p>
            </div>
            <ol className="grid gap-px overflow-hidden bg-line sm:grid-cols-3 lg:col-span-8">
              {[
                {
                  mark: "sprig" as const,
                  title: "A weekly rhythm",
                  body: "Club Yalla, our weekday membership: recurring childcare and coworking, with consistent days and a familiar cohort.",
                  href: "/club-yalla",
                  link: "Club Yalla",
                },
                {
                  mark: "window" as const,
                  title: "Care as you need it",
                  body: "Yalla Flex drop-in days, Camp Yalla, Yalla Weekends and Yalla After Hours, all bookable in one calendar.",
                  href: "/book",
                  link: "Book care",
                },
                {
                  mark: "sun" as const,
                  title: "Come together",
                  body: "Yalla Happenings bring pop-ups, workshops and gatherings. Yalla Celebrations host your private occasions.",
                  href: "/programs/yalla-happenings",
                  link: "Happenings",
                },
              ].map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 120} className="flex flex-col bg-chalk p-8 lg:p-10">
                  <Mark name={s.mark} className="h-14 w-auto self-start text-blue" />
                  <p className="mt-10 font-serif text-sm text-ink-soft italic">0{i + 1}</p>
                  <h3 className="display mt-2 text-[1.7rem]">{s.title}</h3>
                  <p className="mt-3 flex-1 text-[0.95rem] text-ink-soft">{s.body}</p>
                  <Link href={s.href} className="mt-6 inline-flex items-center gap-3 text-[0.85rem] hover:text-blue">
                    <span className="link-underline">{s.link}</span>
                    <Arrow className="h-3 w-5" />
                  </Link>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ───────── Programs ───────── */}
      <section className="bg-paper py-24 lg:py-36">
        <div className="shell">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div>
              <Index n="02">Programs</Index>
              <h2 className="display mt-6 max-w-2xl text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
                Find your <em>way in.</em>
              </h2>
            </div>
            <Button href="/programs" variant="outline">
              All programs
            </Button>
          </div>
        </div>
        <div className="shell">
          <ul className="mt-14 grid gap-x-6 gap-y-6 sm:grid-cols-2 sm:gap-y-12 lg:grid-cols-3">
            {otherPrograms.map((p, i) => (
              <Reveal as="li" key={p.slug} delay={(i % 3) * 90}>
                <Link href={`/programs/${p.slug}`} className="group flex items-center gap-5 sm:block">
                  <div className="relative aspect-square w-24 shrink-0 overflow-hidden bg-sand sm:aspect-[4/3] sm:w-auto">
                    <Image src={p.image} alt={p.imageAlt} fill sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 90vw" className="object-cover transition-transform duration-[1.6s] ease-[var(--ease-soft)] group-hover:scale-[1.04]" />
                  </div>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-4 sm:mt-5">
                    <div>
                      <p className="eyebrow flex items-center gap-2 text-[0.6rem] text-ink-soft">
                        {p.motif ? <Mark name={p.motif} className="h-3.5 w-auto text-blue" /> : null}
                        {p.short}
                      </p>
                      <h3 className="display mt-1.5 text-[1.3rem] transition-colors group-hover:text-blue sm:mt-2 sm:text-[1.55rem]">{p.name}</h3>
                      <p className="mt-1 text-[0.85rem] text-ink-soft sm:text-[0.9rem]">{p.tagline}</p>
                    </div>
                    <Arrow className="mt-8 hidden h-3 w-5 shrink-0 sm:block text-ink-soft transition-transform duration-500 group-hover:translate-x-1 group-hover:text-blue" />
                  </div>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── Spaces ───────── */}
      <section className="py-24 lg:py-36">
        <div className="shell grid items-center gap-14 lg:grid-cols-12">
          <Reveal className="relative lg:col-span-6">
            <div className="relative aspect-[4/5] w-[78%] overflow-hidden rounded-t-[999px] bg-sand">
              <Image src="/photos/painting-wall-child.jpg" alt="A child painting at the outdoor painting wall" fill sizes="(min-width:1024px) 36vw, 78vw" className="object-cover" />
            </div>
            <div className="absolute right-0 bottom-[-6%] aspect-square w-[44%] overflow-hidden rounded-full bg-sand ring-8 ring-chalk">
              <Image src="/photos/cowork-atrium.webp" alt="The Yalla coworking atrium from above" fill sizes="20vw" className="object-cover" />
            </div>
          </Reveal>
          <div className="lg:col-span-5 lg:col-start-8">
            <Index n="03">Our spaces</Index>
            <h2 className="display mt-6 text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
              A space to work. <em>A place to grow.</em>
            </h2>
            <p className="mt-6 text-[1.05rem] text-ink-soft">
              Places to play, places to focus, and plenty of space to come together. Yalla brings thoughtfully designed children’s spaces,
              comfortable coworking, and welcoming common areas under one roof in San Diego’s historic Bankers Hill.
            </p>
            <Button href="/spaces" variant="outline" className="mt-10">
              Explore our spaces
            </Button>
          </div>
        </div>
      </section>

      {/* ───────── Book ───────── */}
      <section className="roofline-edge mt-10 bg-ink text-ink">
        <div className="text-chalk">
          <div className="shell grid gap-14 py-24 lg:grid-cols-12 lg:py-32">
            <div className="lg:col-span-5">
              <p className="eyebrow text-chalk/60">Book care</p>
              <h2 className="display mt-6 text-[clamp(2.2rem,1.6rem+2vw,3.4rem)]">
                The next two weeks, <em className="text-mist!">at a glance.</em>
              </h2>
              <p className="mt-6 max-w-md text-chalk/70">
                Flex days, Weekends, After Hours, Camp Yalla and Happenings live in one calendar. Choose a date, add your children and reserve in a
                few taps.
              </p>
              <Button href="/book" variant="light" className="mt-10">
                Open the calendar
              </Button>
            </div>
            <div className="lg:col-span-6 lg:col-start-7">
              <AvailabilityGlance />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Visit ───────── */}
      <section className="relative overflow-hidden">
        <WindowField seed={3} width={2400} height={760} className="absolute inset-0 h-full w-full" />
        <div className="shell relative py-28 lg:py-40">
          <Reveal className="mx-auto max-w-xl bg-chalk px-8 py-14 text-center sm:px-14">
            <Mark name="arch" className="mx-auto h-12 w-auto text-blue" />
            <h2 className="display mt-8 text-[clamp(2.2rem,1.6rem+2vw,3.2rem)]">
              Come on in.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-ink-soft">
              Whether Yalla becomes part of your everyday rhythm or somewhere you turn to for a particular occasion, you’ll find attentive care,
              meaningful play, and a community that welcomes your whole family.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button href="/visit">Plan a visit</Button>
              <Button href="/experience" variant="outline">
                The Yalla experience
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
