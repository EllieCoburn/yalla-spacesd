import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import { FlexRates } from "@/components/site/FlexRates";
import { ProgramDates, type DateGroup } from "@/components/site/ProgramDates";
import { Arrow, Button, Eyebrow } from "@/components/ui/primitives";
import { CAMP_DAYS, type ProgramContent } from "@/content/programs";
import { cohorts, flexAges } from "@/content/tuition";

type Page = {
  title: ReactNode;
  lede: string;
  facts: { label: string; value: string }[];
  datesTitle: ReactNode;
  unit: "day" | "evening";
  groups: DateGroup[];
  groupNoun?: string;
  days?: string[];
  horizonDays: number;
  familyRate?: boolean;
  goodToKnow: { label: string; lines: ReactNode[] }[];
  after?: ReactNode;
};

const AGE_GROUPS = (priceCents: number): DateGroup[] => [
  { key: "a", label: "18 mo – 4 yrs", minAge: 18, priceCents },
  { key: "b", label: "4 – 6 yrs", minAge: 48, priceCents },
  { key: "c", label: "7 – 10 yrs", minAge: 84, priceCents },
];

const questions = {
  label: "Questions?",
  lines: [
    <>
      <Link href="/faq" className="underline underline-offset-4 hover:text-blue">
        Read the FAQ
      </Link>{" "}
      or{" "}
      <Link href="/visit" className="underline underline-offset-4 hover:text-blue">
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
      { label: "Age groups", lines: ["18 months – 4 years", "4 – 6 years", "7 – 10 years"] },
      { label: "Add to your day", lines: ["Early Bird, 8:00 – 9:00am · $20", "Late stay, 3:00 – 4:30pm · $30"] },
      questions,
    ],
  },
  parents_night: {
    title: (
      <>
        Evenings out, <em>on select dates.</em>
      </>
    ),
    lede: "An evening of play for them, a night out for you, on select evenings every month.",
    facts: [
      { label: "Hours", value: "5:00 – 9:00pm" },
      { label: "Ages", value: "18 months – 10 years" },
      { label: "Price", value: "$65 per child" },
    ],
    datesTitle: (
      <>
        Choose your <em>evenings.</em>
      </>
    ),
    unit: "evening",
    groups: AGE_GROUPS(6500),
    horizonDays: 365,
    familyRate: true,
    goodToKnow: [
      { label: "Age groups", lines: ["18 months – 4 years", "4 – 6 years", "7 – 10 years"] },
      { label: "Family rate", lines: ["$85 for up to three children", "$25 for each additional child", "Applied automatically for siblings"] },
      questions,
    ],
  },
  drop_in: {
    title: (
      <>
        Flex days, <em>when you need them.</em>
      </>
    ),
    lede: "A day of childcare for your child and coworking for you, Monday to Friday, when there’s space.",
    facts: [
      { label: "Hours", value: "8:30am – 4:30pm" },
      { label: "Ages", value: "3 months – 5 years" },
      { label: "Price", value: `From $${Math.min(...cohorts.map((c) => c.daily.full))} a day` },
    ],
    datesTitle: (
      <>
        Choose your <em>Flex days.</em>
      </>
    ),
    unit: "day",
    groups: cohorts.map((c) => ({ key: c.id, label: c.name, sub: `${flexAges[c.id]} · $${c.daily.full}`, cohort: c.name, priceCents: c.daily.full * 100 })),
    groupNoun: "age group",
    horizonDays: 56,
    goodToKnow: [
      { label: "Every Flex day", lines: ["Childcare for your child", "Coworking for you, steps away"] },
      { label: "Day rates", lines: [<Link key="r" href="#rates" className="underline underline-offset-4 hover:text-blue">See rates by age</Link>] },
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
              <h1 className="display mt-6 text-[clamp(2.8rem,1.6rem+4.4vw,5.6rem)]">{page.title}</h1>
              <p className="mt-6 max-w-lg text-[1.1rem] text-ink-soft">{page.lede}</p>
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {page.facts.map((f) => (
                  <div key={f.label}>
                    <dt className="eyebrow text-[0.6rem] text-ink-soft">{f.label}</dt>
                    <dd className="mt-1 font-serif text-[1.35rem]">{f.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-10">
                <Button href="#dates" size="lg">
                  Choose your {page.unit}s
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
          <h2 className="display text-[clamp(2rem,1.5rem+1.6vw,3rem)]">{page.datesTitle}</h2>
          <div className="mt-8 max-w-4xl">
            <ProgramDates kind={p.kind} groups={page.groups} unit={page.unit} days={page.days} horizonDays={page.horizonDays} familyRate={page.familyRate} groupNoun={page.groupNoun} />
          </div>
        </div>
      </section>

      {/* Good to know */}
      <section className="py-16 lg:py-20">
        <div className="shell grid gap-10 sm:grid-cols-3">
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

      {page.after}
    </>
  );
}
