import Image from "next/image";
import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import { CampDates } from "@/components/site/CampDates";
import { Arrow, Button, Eyebrow } from "@/components/ui/primitives";
import { CAMP_DAYS, type ProgramContent } from "@/content/programs";

const facts = [
  { label: "Hours", value: "9:00am – 3:00pm" },
  { label: "Ages", value: "18 months – 10 years" },
  { label: "Price", value: "$160 a day" },
];

/** Camp Yalla: dates first. Pick a day, book it. */
export function CampPage({ p }: { p: ProgramContent }) {
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
                Camp days, <em>2026–27.</em>
              </h1>
              <p className="mt-6 max-w-lg text-[1.1rem] text-ink-soft">Hands-on, unhurried days of making, building and discovering. Pick a date to book.</p>
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt className="eyebrow text-[0.6rem] text-ink-soft">{f.label}</dt>
                    <dd className="mt-1 font-serif text-[1.35rem]">{f.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Button href="#dates" size="lg">
                  Choose your days
                </Button>
              </div>
            </div>
            <div className="hidden lg:col-span-4 lg:col-start-9 lg:block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-t-[999px] bg-sand">
                <Image src={p.image} alt={p.imageAlt} fill priority sizes="30vw" className="object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dates */}
      <section id="dates" className="scroll-mt-24 bg-paper py-16 lg:py-24">
        <div className="shell">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-[clamp(2rem,1.5rem+1.6vw,3rem)]">
              Pick <em>a day.</em>
            </h2>
            <p className="text-[0.9rem] text-ink-soft">Book one day or as many as you like.</p>
          </div>
          <div className="mt-10">
            <CampDates days={CAMP_DAYS} />
          </div>
        </div>
      </section>

      {/* Good to know */}
      <section className="py-16 lg:py-20">
        <div className="shell grid gap-10 sm:grid-cols-3">
          <div>
            <p className="eyebrow text-[0.62rem] text-ink-soft">Age groups</p>
            <p className="mt-3">18 months – 4 years</p>
            <p>4 – 6 years</p>
            <p>7 – 10 years</p>
          </div>
          <div>
            <p className="eyebrow text-[0.62rem] text-ink-soft">Add to your day</p>
            <p className="mt-3">Early Bird, 8:00 – 9:00am · $20</p>
            <p>Late stay, 3:00 – 4:30pm · $30</p>
          </div>
          <div>
            <p className="eyebrow text-[0.62rem] text-ink-soft">Questions?</p>
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
