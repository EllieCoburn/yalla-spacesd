import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ContextualFaq } from "@/components/faq/ContextualFaq";
import { Mark } from "@/components/brand/Mark";
import { FlexRates } from "@/components/site/FlexRates";
import { ProgramDates, type DateGroup } from "@/components/site/ProgramDates";
import { Arrow, Button, Eyebrow } from "@/components/ui/primitives";
import { CAMP_DAYS, type ProgramContent } from "@/content/programs";
import { FLEX_GROUPS } from "@/lib/booking/flex";
import { cohorts } from "@/content/tuition";

type Page = {
  title: ReactNode;
  lede: string;
  facts: { label: string; value: string }[];
  /** Everything else about price, shown right under the facts so all pricing is in one place. */
  priceNote?: ReactNode;
  datesTitle: ReactNode;
  unit: "day" | "evening";
  groups: DateGroup[];
  groupNoun?: string;
  days?: string[];
  horizonDays: number;
  familyRate?: boolean;
  goodToKnow: { label: string; lines: ReactNode[] }[];
  after?: ReactNode;
  /** A calmer header: a short lede, an even grid of key facts, one button and a rates link. */
  hero?: {
    lede: string;
    facts: { label: string; value: string; note?: string }[];
    cta: string;
    ratesLink?: { label: string; href: string };
  };
};

const AGE_GROUPS = (priceCents: number): DateGroup[] => [
  { key: "a", label: "18 mo – 3 yrs", minAge: 18, maxAge: 47, priceCents },
  { key: "b", label: "4 – 6 yrs", minAge: 48, maxAge: 83, priceCents },
  { key: "c", label: "7 – 10 yrs", minAge: 84, maxAge: 131, priceCents },
];


const questions = {
  label: "Questions?",
  lines: [
    <>
      <Link
        href="/faq"
        className="underline underline-offset-4 hover:text-blue"
      >
        Read the FAQ
      </Link>{" "}
      or{" "}
      <Link
        href="/book-a-tour"
        className="underline underline-offset-4 hover:text-blue"
      >
        book a tour
      </Link>
      .
    </>,
  ],
};

/** The programs families book date by date share one layout: the essentials, then pick and book. */
export const BOOKING_PAGES: Record<string, Page> = {
  camp: {
    title: (
      <>
        Camp days, <em>2026–27.</em>
      </>
    ),
    lede: "Hands-on, unhurried days of making, building and discovering. Pick your dates to book.",
    facts: [
      { label: "Hours", value: "9:00am – 3:00pm" },
      { label: "Ages", value: "18 months – 10 years" },
      { label: "Price", value: "$160 a day" },
    ],
    priceNote:
      "Optional extras per child: Early Bird, 8:00 – 9:00am, +$20 · Late stay, 3:00 – 4:30pm, +$30",
    datesTitle: (
      <>
        Choose your <em>camp days.</em>
      </>
    ),
    unit: "day",
    groups: AGE_GROUPS(16000),
    days: CAMP_DAYS,
    horizonDays: 0,
    goodToKnow: [
      {
        label: "Age groups",
        lines: ["18 months – 3 years", "4 – 6 years", "7 – 10 years"],
      },
      questions,
    ],
  },
  drop_in: {
    title: (
      <>
        Flex days, <em>when you need them.</em>
      </>
    ),
    lede: "Thoughtful childcare for your little one, a welcoming coworking space for you. Book a full or half day, Monday–Friday.",
    hero: {
      lede: "Thoughtful childcare for your little one, a welcoming coworking space for you. Book a full or half day, Monday–Friday, and explore availability for your child’s age group below.",
      facts: [
        { label: "Full day", value: "8:30am–4:30pm" },
        { label: "Half day", value: "8:30am–12:00pm" },
        { label: "Ages", value: "4 months–4 years" },
        { label: "Full-day rates", value: `Starting at $${Math.min(...cohorts.map((c) => c.daily.full))}`, note: "Childcare + coworking included" },
      ],
      cta: "Explore availability",
      ratesLink: { label: "View all rates", href: "#rates" },
    },
    facts: [
      { label: "Hours", value: "8:30am – 4:30pm, or a half day to 12:00pm" },
      { label: "Ages", value: "4 months – 4 years" },
      {
        label: "Price",
        value: `From $${Math.min(...cohorts.map((c) => c.daily.full))} a day`,
      },
    ],
    priceNote: (
      <>
        Full day: {cohorts.map((c) => `${c.name} $${c.daily.full}`).join(" · ")}
        .{" "}
        <a
          href="#rates"
          className="underline underline-offset-4 hover:text-blue"
        >
          All rates
        </a>
      </>
    ),
    datesTitle: (
      <>
        Choose your <em>Flex days.</em>
      </>
    ),
    unit: "day",
    // Each Flex day has a session per age group; a group is open only when staff release a spot.
    groups: FLEX_GROUPS.map((g) => ({
      key: g.key,
      label: g.cohort,
      sub: `${g.label} · $${g.fullCents / 100}`,
      minAge: g.minAge,
      maxAge: g.maxAge,
      priceCents: g.fullCents,
    })),
    groupNoun: "age group",
    horizonDays: 56,
    goodToKnow: [
      {
        label: "Every Flex day",
        lines: ["Childcare for your child", "Coworking for you, steps away"],
      },
      questions,
    ],
    after: <FlexRates />,
  },
};

export function ProgramBookingPage({ p }: { p: ProgramContent }) {
  const page = BOOKING_PAGES[p.kind];
  return (
    <>
      {/* Header */}
      {page.hero ? (
        <section className="pt-32 pb-16 lg:pt-40 lg:pb-24">
          <div className="shell">
            <Link href="/programs" className="eyebrow inline-flex items-center gap-3 text-ink-soft hover:text-ink">
              <Arrow className="h-3 w-4 rotate-180" /> All programs
            </Link>
            <div className="mt-10 grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
              <div className="lg:col-span-7">
                <Eyebrow className="flex items-center gap-3">
                  {p.motif ? <Mark name={p.motif} className="h-5 w-auto text-blue" /> : null}
                  {p.name}
                </Eyebrow>
                <h1 className="display mt-6 text-[clamp(2.4rem,1.7rem+2.6vw,4rem)]">{page.title}</h1>
                <p className="mt-6 max-w-xl text-[1.12rem] leading-relaxed text-ink-soft">{page.hero.lede}</p>
                <dl className="mt-10 grid max-w-xl grid-cols-2 gap-x-8 gap-y-7 border-t border-line pt-8">
                  {page.hero.facts.map((f) => (
                    <div key={f.label}>
                      <dt className="eyebrow text-[0.6rem] text-ink-soft">{f.label}</dt>
                      <dd className="mt-2 text-[1.08rem] text-ink">{f.value}</dd>
                      {f.note ? <dd className="mt-1 text-[0.84rem] text-ink-soft">{f.note}</dd> : null}
                    </div>
                  ))}
                </dl>
                <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                  <Button href="#dates" size="lg">
                    {page.hero.cta}
                  </Button>
                  {page.hero.ratesLink ? (
                    <a href={page.hero.ratesLink.href} className="link-underline pb-0.5 text-[0.95rem] text-ink">
                      {page.hero.ratesLink.label}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="hidden lg:col-span-4 lg:col-start-9 lg:block">
                <div className="relative mx-auto aspect-[4/5] max-h-[34rem] overflow-hidden rounded-t-[999px] bg-sand">
                  <Image src={p.image} alt={p.imageAlt} fill priority sizes="30vw" className="object-cover" />
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
      <section className="pt-32 pb-14 lg:pt-40 lg:pb-16">
        <div className="shell">
          <Link
            href="/programs"
            className="eyebrow inline-flex items-center gap-3 text-ink-soft hover:text-ink"
          >
            <Arrow className="h-3 w-4 rotate-180" /> All programs
          </Link>
          <div className="mt-10 grid items-end gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Eyebrow className="flex items-center gap-3">
                {p.motif ? (
                  <Mark name={p.motif} className="h-5 w-auto text-blue" />
                ) : null}
                {p.name}
              </Eyebrow>
              <h1 className="display mt-6 text-[clamp(2.8rem,1.6rem+4.4vw,5.6rem)]">
                {page.title}
              </h1>
              <p className="mt-6 max-w-lg text-[1.1rem] text-ink-soft">
                {page.lede}
              </p>
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {page.facts.map((f) => (
                  <div key={f.label}>
                    <dt className="eyebrow text-[0.6rem] text-ink-soft">
                      {f.label}
                    </dt>
                    <dd className="mt-1 font-serif text-[1.35rem]">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {page.priceNote ? (
                <p className="mt-4 max-w-xl border-l-2 border-blue/40 pl-3 text-[0.92rem] leading-relaxed text-ink">
                  {page.priceNote}
                </p>
              ) : null}
              <div className="mt-10">
                <Button href="#dates" size="lg">
                  Choose your {page.unit}s
                </Button>
              </div>
            </div>
            <div className="hidden lg:col-span-4 lg:col-start-9 lg:block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-t-[999px] bg-sand">
                <Image
                  src={p.image}
                  alt={p.imageAlt}
                  fill
                  priority
                  sizes="30vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Dates */}
      <section id="dates" className="scroll-mt-24 bg-paper py-16 lg:py-24">
        <div className="shell">
          <h2 className="display text-center text-[clamp(2rem,1.5rem+1.6vw,3rem)]">
            {page.datesTitle}
          </h2>
          <div className="mx-auto mt-8 max-w-4xl">
            <ProgramDates
              kind={p.kind}
              groups={page.groups}
              unit={page.unit}
              days={page.days}
              horizonDays={page.horizonDays}
              familyRate={page.familyRate}
              groupNoun={page.groupNoun}
            />
          </div>
        </div>
      </section>

      {/* Good to know */}
      <section className="py-16 lg:py-20">
        <div className="shell grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {page.goodToKnow.map((g) => (
            <div key={g.label}>
              <p className="eyebrow text-[0.62rem] text-ink-soft">{g.label}</p>
              <div className="mt-3 space-y-0.5">
                {g.lines.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {p.kind === "drop_in" ? <ContextualFaq page="flex" limit={5} className="border-t border-line py-20 lg:py-28" /> : p.kind === "camp" ? <ContextualFaq page="camp" limit={5} className="border-t border-line py-20 lg:py-28" /> : null}

      {page.after}
    </>
  );
}
