import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { CtaBand, PageHero, Section } from "@/components/site/PageParts";
import { Arrow, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { Mark } from "@/components/brand/Mark";
import { getDb, isDbConfigured } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { rateFor } from "@/lib/spaces/engine";
import { CATEGORY_PLURAL, type Category, type PaidBookingType } from "@/lib/spaces/config";
import { todayLA } from "@/lib/time";

export const metadata: Metadata = {
  title: "Coworking",
  description: "Coworking at Yalla in San Diego: our common areas are included with every Yalla Flex and Club Yalla session, with private offices and desks to reserve.",
};
export const dynamic = "force-dynamic";

/** Additional grown-ups beyond the one included per family (common areas only). */
const EXTRA_ADULT = "$25";

const included = [
  { program: "Yalla Flex", how: "Included with every Flex session. A parent stays onsite and works from our coworking space while their child is in care.", href: "/programs/yalla-flex" },
  { program: "Club Yalla", how: "Included with membership. Parents work onsite in our coworking space on their Club Yalla days.", href: "/club-yalla" },
  { program: "Yalla Happenings", how: "Optional. Some Happenings offer coworking as an add-on for the grown-up who stays.", href: "/programs/yalla-happenings" },
];

const amenities = [
  "Onsite childcare rooted in the Reggio Emilia and RIE approaches, provided by a highly qualified team of caregivers",
  "Communal coworking access",
  "High-speed internet",
  "Complimentary coffee and tea",
  "Light snacks",
  "Access to our coworking kitchen",
  "Unlimited color printing",
  "Lactation space",
  "Private lockers for personal belongings",
  "Private office rental",
  "Complimentary private phone booth",
];

const PER: Record<PaidBookingType, string> = { half_day: "half day", full_day: "full day", week: "week", hourly: "hour" };
const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

const SPACES: { category: Category; blurb: string; mark: "window" | "arch" | "balcony" }[] = [
  { category: "private_office", blurb: "A fully private office with a door that closes, for focused work and calls.", mark: "window" },
  { category: "private_desk", blurb: "A dedicated desk that’s yours for the day or the week.", mark: "balcony" },
  { category: "phone_booth", blurb: "A private booth for calls, virtual meetings and quiet conversations.", mark: "arch" },
];

/** Today's prices for each kind of private space (the lowest across its workspaces), from Admin → Spaces. */
async function prices() {
  const out = new Map<Category, { type: PaidBookingType; cents: number }[]>();
  if (!isDbConfigured()) return out;
  const db = getDb();
  const today = todayLA();
  const list = await db.select().from(workspaces).where(eq(workspaces.active, true)).orderBy(asc(workspaces.displayOrder));
  for (const ws of list) {
    const types = (ws.bookingTypes as string[]).filter((t): t is PaidBookingType => t in PER);
    for (const t of types) {
      const r = await rateFor(db, ws, t, today);
      if (!r) continue;
      const cur = out.get(ws.category as Category) ?? [];
      const same = cur.find((x) => x.type === t);
      if (!same) cur.push({ type: t, cents: r.priceCents });
      else if (r.priceCents < same.cents) same.cents = r.priceCents;
      out.set(ws.category as Category, cur);
    }
  }
  const order: PaidBookingType[] = ["hourly", "half_day", "full_day", "week"];
  for (const [k, v] of out) out.set(k, v.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)));
  return out;
}

export default async function CoworkingPage() {
  const rates = await prices().catch(() => new Map<Category, { type: PaidBookingType; cents: number }[]>());
  return (
    <>
      <PageHero
        eyebrow="Coworking at Yalla"
        mark="window"
        title={
          <>
            Work, just <em>down the hall.</em>
          </>
        }
        lede="Our coworking common areas are included in the cost of your child’s session, so you can settle in and get things done while your child plays nearby."
        image={{ src: "/photos/cowork-atrium.webp", alt: "The coworking atrium at Yalla, with long shared desks" }}
      />

      {/* What's included */}
      <Section tone="paper">
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Index n="01">What’s included</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)] text-balance">
              Part of every <em>session.</em>
            </h2>
            <p className="mt-6 text-[1.05rem] text-ink-soft">
              Coworking is for families with a child in Yalla care that day. One grown-up per family works in our coworking common areas at
              no extra cost. If a second grown-up would like to be onsite too, add them when you book: {EXTRA_ADULT} a day for
              common-area access.
            </p>
            <dl className="mt-8 grid gap-4 border-t border-line pt-6 text-[0.95rem]">
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-ink-soft">Weekdays</dt>
                <dd className="text-ink">Monday – Friday, 8:30am – 4:30pm</dd>
              </div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-ink-soft">Weekends</dt>
                <dd className="text-ink">Saturday and Sunday, during weekend sessions</dd>
              </div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <dt className="text-ink-soft">Second grown-up</dt>
                <dd className="text-ink">{EXTRA_ADULT} a day, added when you book</dd>
              </div>
            </dl>
          </div>
          <div className="divide-y divide-line self-start lg:col-span-6 lg:col-start-7">
            {included.map((x, i) => (
              <Reveal key={x.program} delay={i * 80} className="py-7 first:pt-0">
                <Link href={x.href} className="group block">
                  <h3 className="display flex items-center justify-between gap-4 text-[1.6rem] group-hover:text-blue">
                    {x.program}
                    <Arrow className="h-3 w-5 shrink-0 text-ink-soft transition-transform group-hover:translate-x-1 group-hover:text-blue" />
                  </h3>
                  <p className="mt-2 text-ink-soft">{x.how}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* Amenities */}
      <Section>
        <div className="shell grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Index n="02">Amenities</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)] text-balance">
              Everything you need <em>for the day.</em>
            </h2>
            <div className="relative mt-10 hidden aspect-[4/3] overflow-hidden rounded-t-[999px] bg-sand lg:block">
              <Image src="/photos/cowork-kitchen.webp" alt="The coworking kitchen at Yalla" fill sizes="36vw" className="object-cover" />
            </div>
          </div>
          <ul className="grid content-start gap-x-10 gap-y-5 sm:grid-cols-2 lg:col-span-6 lg:col-start-7">
            {amenities.map((a, i) => (
              <Reveal key={a} delay={i * 40} className={`flex gap-3 border-t border-line pt-5 text-[1rem] ${i === 0 ? "sm:col-span-2" : ""}`}>
                <svg viewBox="0 0 16 16" aria-hidden className="mt-1 h-4 w-4 shrink-0 text-blue" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
                <span>{a}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </Section>

      {/* Private spaces */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-6">
              <Index n="03">Private spaces</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)] text-balance">
                A little more <em>room to focus.</em>
              </h2>
            </div>
            <p className="text-[1.05rem] text-ink-soft lg:col-span-5 lg:col-start-8">
              Coworking in any of Yalla’s common areas, along with access to our coworking amenities, is included in the cost of Yalla Flex
              and Club Yalla. For a dedicated private office or desk, or time in the phone booth, reserve in your Family Portal, subject to
              availability.
            </p>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden bg-line md:grid-cols-3">
            {SPACES.map((sp, i) => {
              const list = rates.get(sp.category) ?? [];
              return (
                <Reveal key={sp.category} delay={i * 90} className="bg-paper p-8 lg:p-10">
                  <Mark name={sp.mark} className="h-12 w-auto text-blue" />
                  <h3 className="display mt-8 text-[1.6rem]">{CATEGORY_PLURAL[sp.category]}</h3>
                  <p className="mt-2 text-ink-soft">{sp.blurb}</p>
                  <dl className="mt-4 divide-y divide-line border-y border-line text-[0.92rem]">
                    {list.length ? (
                      list.map((r) => (
                        <div key={r.type} className="flex justify-between gap-4 py-2">
                          <dt className="text-ink-soft capitalize">{PER[r.type]}</dt>
                          <dd className="text-ink">{usd(r.cents)}</dd>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between gap-4 py-2">
                        <dt className="text-ink-soft">Complimentary</dt>
                        <dd className="text-ink">Subject to availability</dd>
                      </div>
                    )}
                  </dl>
                </Reveal>
              );
            })}
          </div>
          <div className="mt-12">
            <Link href="/portal/spaces" className="inline-flex h-12 items-center gap-3 rounded-full bg-ink px-7 text-[0.9rem] text-chalk transition-colors hover:bg-blue">
              Reserve a space
              <Arrow className="h-3 w-5" />
            </Link>
          </div>
        </div>
      </Section>

      <CtaBand
        title={
          <>
            Come see <em>where you’ll work.</em>
          </>
        }
        primary={{ href: "/book-a-tour", label: "Book a tour" }}
        secondary={{ href: "/book", label: "Book care" }}
      />
    </>
  );
}
