import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { PrintList } from "@/components/portal/PrintList";
import { Button } from "@/components/ui/primitives";
import { WEEK_BLOCK_NOTE, halfDaySkipsRest, whatToBring } from "@/content/flex-what-to-bring";
import { getDb, isDbConfigured } from "@/lib/db";
import { familyCampLists, familyFlexLists } from "@/lib/ops/what-to-bring";
import { CAMP_FOOD_NOTE, campWhatToBring } from "@/content/camp-what-to-bring";
import type { BringList } from "@/content/flex-what-to-bring";
import { fmtDate } from "@/lib/time";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "What to bring", robots: { index: false } };
export const dynamic = "force-dynamic";

/** What-to-bring lists for the family's children: Yalla Flex by cohort, Camp Yalla by age group. Signed-in families only. */
export default async function WhatToBring() {
  const g = isDbConfigured() ? await getGuardian() : null;
  if (!g) redirect("/portal?signin=1&next=/portal/what-to-bring");
  const kids = await familyFlexLists(getDb(), g.familyId);
  const campers = await familyCampLists(getDb(), g.familyId);

  return (
    <div className="pt-28 pb-24 lg:pt-36 print:pt-0">
      <div className="shell max-w-4xl">
        <Link href="/portal/home" className="eyebrow text-ink-soft hover:text-ink print:hidden">
          ← Family Portal
        </Link>
        <h1 className="display mt-6 text-[clamp(2.4rem,1.8rem+2.4vw,4rem)]">
          What to <em>bring.</em>
        </h1>
        <p className="mt-5 max-w-xl text-ink-soft">
          Everything your child needs for their Yalla Flex and Camp Yalla days. Items travel home with your child at the end of each day. Please label every item with your child’s name.
        </p>

        {!kids.length && !campers.length ? (
          <div className="mt-12 border border-line bg-paper p-8">
            <p className="display text-[1.5rem]">Your list appears here once you book a Flex or camp day.</p>
            <p className="mt-2 text-ink-soft">Each child’s list matches the group they’re booked into.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href="/programs/yalla-flex">Book a Flex day</Button>
              <Button href="/book?offering=camp" variant="outline">Book camp days</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-3 print:hidden">
              {kids.length + campers.length > 1
                ? [
                    ...kids.map((k) => (
                      <a key={k.childId} href={`#${k.childId}`} className="rounded-full border border-ink/20 px-4 py-2 text-[0.88rem] hover:border-ink">
                        {k.name} · {k.cohort}
                      </a>
                    )),
                    ...campers.map((k) => (
                      <a key={`camp-${k.childId}`} href={`#camp-${k.childId}`} className="rounded-full border border-ink/20 px-4 py-2 text-[0.88rem] hover:border-ink">
                        {k.name} · Camp
                      </a>
                    )),
                  ]
                : null}
              <span className="ml-auto">
                <PrintList />
              </span>
            </div>

            {kids.map((k) => {
              const list = whatToBring(k.cohortKey, k.half && !k.mixed);
              if (!list) return null;
              const skips = halfDaySkipsRest(k.cohortKey);
              return (
                <section key={k.childId} id={k.childId} className="mt-14 scroll-mt-28 break-inside-avoid-page">
                  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
                    <div>
                      <p className="eyebrow flex items-center gap-2 text-[0.62rem] text-blue">
                        <Mark name="sprig" className="h-4 w-auto" /> {list.cohort} cohort
                      </p>
                      <h2 className="display mt-2 text-[2.2rem]">For {k.name}</h2>
                    </div>
                    {k.nextDate ? (
                      <p className="text-[0.9rem] text-ink-soft">
                        Next Flex day: {fmtDate(k.nextDate, "EEEE, MMMM d")} · {k.mixed ? "full and half days booked" : k.half ? "half day" : "full day"}
                      </p>
                    ) : null}
                  </div>

                  {skips && (k.half || k.mixed) ? (
                    <p className="mt-5 border-l-2 border-blue/40 pl-3 text-[0.9rem] text-ink">
                      {k.mixed ? "On half days, leave the rest time items at home." : "Half days don’t need rest time items, so they’re not on this list."}
                    </p>
                  ) : null}

                  {k.weekBlock ? <p className="mt-5 bg-mist/60 p-4 text-[0.9rem] leading-relaxed text-ink">{WEEK_BLOCK_NOTE}</p> : null}

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {list.sections.map((sec) => (
                      <div key={sec.key} className="border border-line bg-paper p-6 break-inside-avoid">
                        <p className="display text-[1.35rem]">
                          {sec.title}
                          {k.mixed && sec.restTime ? <span className="ml-2 align-middle font-sans text-[0.72rem] tracking-[0.12em] text-ink-soft uppercase">Full days</span> : null}
                        </p>
                        {sec.note ? <p className="mt-1 text-[0.82rem] text-ink-soft">{sec.note}</p> : null}
                        <ul className="mt-4 space-y-3">
                          {sec.items.map((i) => (
                            <li key={i.text} className="flex gap-3">
                              <span aria-hidden className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />
                              <span>
                                <span className="block text-[0.98rem]">{i.text}</span>
                                {i.detail ? <span className="mt-0.5 block text-[0.82rem] leading-relaxed text-ink-soft">{i.detail}</span> : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="border border-oxblood/25 p-6 break-inside-avoid">
                      <p className="display text-[1.35rem]">Please don’t bring</p>
                      <ul className="mt-4 space-y-2.5">
                        {list.doNotBring.map((d) => (
                          <li key={d} className="flex gap-3 text-[0.95rem]">
                            <span aria-hidden className="text-oxblood">×</span>
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex items-center bg-mist/60 p-6">
                      <p className="text-[0.95rem]">
                        <span className="eyebrow block text-[0.6rem] text-ink-soft">Labeling reminder</span>
                        <span className="mt-2 block">{list.labeling}</span>
                      </p>
                    </div>
                  </div>
                </section>
              );
            })}

            {campers.length ? (
              <div id="camp" className="scroll-mt-28">
                {kids.length ? <p className="eyebrow mt-20 text-ink-soft">Camp Yalla</p> : null}
                {campers.map((k) => {
                  const list = campWhatToBring(k.groupKey);
                  if (!list) return null;
                  return (
                    <section key={k.childId} id={`camp-${k.childId}`} className="mt-14 scroll-mt-28 break-inside-avoid-page">
                      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
                        <div>
                          <p className="eyebrow flex items-center gap-2 text-[0.62rem] text-blue">
                            <Mark name="sprig" className="h-4 w-auto" /> Camp Yalla · {list.cohort}
                          </p>
                          <h2 className="display mt-2 text-[2.2rem]">For {k.name}</h2>
                        </div>
                        <p className="text-[0.9rem] text-ink-soft">Next camp day: {fmtDate(k.nextDate, "EEEE, MMMM d")}</p>
                      </div>
                      <p className="mt-5 border-l-2 border-blue/40 pl-3 text-[0.9rem] text-ink">{CAMP_FOOD_NOTE}</p>
                      <ListCards list={list} />
                    </section>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** A list's sections, "please don't bring" and the labeling reminder (used for camp lists). */
function ListCards({ list }: { list: BringList }) {
  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {list.sections.map((sec) => (
          <div key={sec.key} className="border border-line bg-paper p-6 break-inside-avoid">
            <p className="display text-[1.35rem]">{sec.title}</p>
            {sec.note ? <p className="mt-1 text-[0.82rem] text-ink-soft">{sec.note}</p> : null}
            <ul className="mt-4 space-y-3">
              {sec.items.map((i) => (
                <li key={i.text} className="flex gap-3">
                  <span aria-hidden className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />
                  <span>
                    <span className="block text-[0.98rem]">{i.text}</span>
                    {i.detail && i.detail !== CAMP_FOOD_NOTE ? <span className="mt-0.5 block text-[0.82rem] leading-relaxed text-ink-soft">{i.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="border border-oxblood/25 p-6 break-inside-avoid">
          <p className="display text-[1.35rem]">Please don’t bring</p>
          <ul className="mt-4 space-y-2.5">
            {list.doNotBring.map((d) => (
              <li key={d} className="flex gap-3 text-[0.95rem]">
                <span aria-hidden className="text-oxblood">×</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center bg-mist/60 p-6">
          <p className="text-[0.95rem]">
            <span className="eyebrow block text-[0.6rem] text-ink-soft">Labeling reminder</span>
            <span className="mt-2 block">{list.labeling}</span>
          </p>
        </div>
      </div>
    </>
  );
}
