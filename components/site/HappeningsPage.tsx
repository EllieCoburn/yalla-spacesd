import Image from "next/image";
import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import { HappeningsCalendar } from "@/components/site/HappeningsCalendar";
import { Arrow, Chevron, Eyebrow } from "@/components/ui/primitives";
import { HAPPENING_TYPES, IMMERSIVE_FAQ } from "@/content/happenings";
import type { ProgramContent } from "@/content/programs";

/**
 * Yalla Happenings: one color-coded calendar for every kind of Happening, booked the same way,
 * followed by what each kind is.
 */
export function HappeningsPage({ p }: { p: ProgramContent }) {
  return (
    <>
      {/* Header */}
      <section className="pt-32 pb-12 lg:pt-40 lg:pb-14">
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
                Happenings are how we gather: immersive play, weekend play, evenings out, workshops and community events, all in one calendar.
              </p>
              {/* The key: what each color means, with a link to more about it. */}
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                {HAPPENING_TYPES.map((t) => (
                  <li key={t.key}>
                    <a href={`#about-${t.key}`} className="inline-flex items-center gap-2 text-[0.9rem] hover:text-blue">
                      <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} aria-hidden />
                      {t.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hidden lg:col-span-4 lg:col-start-9 lg:block">
              <div className="relative aspect-[5/4] overflow-hidden rounded-t-[999px] bg-sand">
                <Image src={p.image} alt={p.imageAlt} fill priority sizes="30vw" className="object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The calendar: every Happening, booked the same way */}
      <section id="calendar" className="scroll-mt-24 bg-paper py-14 lg:py-20">
        <div className="shell">
          <h2 className="display text-[clamp(2rem,1.5rem+1.6vw,3rem)]">
            What’s <em>on.</em>
          </h2>
          <p className="mt-3 max-w-xl text-ink-soft">Tap a Happening to see the details and add it to your booking. Mix and match as many as you like.</p>
          <p className="mt-2 text-[0.88rem] text-ink-soft">
            Coming often?{" "}
            <Link href="/play-passes" className="text-blue underline-offset-4 hover:underline">
              A monthly Play Pass
            </Link>{" "}
            gives you more to spend on the same experiences.
          </p>
          <div className="mt-8">
            <HappeningsCalendar />
          </div>
        </div>
      </section>

      {/* What each kind is */}
      <section className="py-16 lg:py-24">
        <div className="shell">
          <h2 className="display text-[clamp(2rem,1.5rem+1.6vw,3rem)]">
            The <em>Happenings.</em>
          </h2>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {HAPPENING_TYPES.map((t) => (
              <article key={t.key} id={`about-${t.key}`} className="grid scroll-mt-24 gap-6 py-10 lg:grid-cols-12 lg:gap-10">
                <div className="lg:col-span-4">
                  <p className="flex items-start gap-3">
                    <span className={`mt-[0.65rem] h-3 w-3 shrink-0 rounded-full ${t.dot}`} aria-hidden />
                    <span className="display text-[clamp(1.6rem,1.3rem+1vw,2.2rem)] leading-tight">{t.name}</span>
                  </p>
                  <a href={`#dates-${t.key}`} className="mt-4 ml-6 inline-flex items-center gap-2 text-[0.88rem] text-blue underline-offset-4 hover:underline">
                    See dates <Arrow className="h-2.5 w-4" />
                  </a>
                </div>
                <div className="lg:col-span-8">
                  <p className="max-w-2xl text-[1.02rem] leading-relaxed">{t.body}</p>
                  {t.facts.length ? (
                    <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
                      {t.facts.map((f) => (
                        <div key={f.label}>
                          <dt className="eyebrow text-[0.6rem] text-ink-soft">{f.label}</dt>
                          <dd className="mt-1 font-serif text-[1.2rem]">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <ul className="mt-5 space-y-1.5 text-[0.9rem] text-ink-soft">
                    {t.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  {t.key === "immersive" ? (
                    <div className="mt-8 border-t border-line">
                      {IMMERSIVE_FAQ.map((it) => (
                        <details key={it.q} className="group border-b border-line">
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-4 [&::-webkit-details-marker]:hidden">
                            <span className="text-[1.05rem]">{it.q}</span>
                            <Chevron className="mt-2 h-2.5 w-4 shrink-0 text-ink" />
                          </summary>
                          <div className="max-w-2xl space-y-4 pb-6 text-[0.98rem] text-ink-soft">
                            {it.a.map((para) => (
                              <p key={para.slice(0, 40)}>{para}</p>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-10 text-ink-soft">
            Questions?{" "}
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
      </section>
    </>
  );
}
