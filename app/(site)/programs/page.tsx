import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CtaBand, PageHero } from "@/components/site/PageParts";
import { Mark } from "@/components/brand/Mark";
import { Arrow } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { otherPrograms } from "@/content/programs";

export const metadata: Metadata = {
  title: "Programs",
  description: "Weekly childcare, drop-in days, camps, weekend care, pop-up events, parents’ nights out and private events at Yalla in Bankers Hill, San Diego.",
};

export default function ProgramsPage() {
  return (
    <>
      <PageHero
        eyebrow="Programs"
        mark="dotsun"
        title={
          <>
            A little Yalla <em>for every kind of day.</em>
          </>
        }
        lede="Drop-in days, camps, weekend care, evenings out, pop-ups and private celebrations. Each has its own shape, and every one shares the same warmth, intention and attention to detail."
      />

      <section className="pb-10">
        <div className="shell">
          <ul className="hairline border-t">
            {otherPrograms.map((p, i) => (
              <Reveal as="li" key={p.slug} className="hairline border-b">
                <Link
                  href={`/programs/${p.slug}`}
                  className="group grid items-center gap-6 py-10 md:grid-cols-12 md:gap-8 lg:py-14"
                >
                  <span className="font-serif text-ink-soft italic md:col-span-1">0{i + 1}</span>
                  <div className="relative aspect-[4/3] overflow-hidden bg-sand md:col-span-3 md:aspect-[3/4] md:rounded-t-[999px]">
                    <Image src={p.image} alt={p.imageAlt} fill sizes="(min-width:768px) 22vw, 90vw" className="object-cover transition-transform duration-[1.6s] ease-[var(--ease-soft)] group-hover:scale-[1.05]" />
                  </div>
                  <div className="md:col-span-5 md:col-start-6">
                    <p className="eyebrow flex items-center gap-2.5 text-[0.62rem] text-ink-soft">
                      {p.motif ? <Mark name={p.motif} className="h-4 w-auto text-blue" /> : null}
                      {p.short}
                    </p>
                    <h2 className="display mt-3 text-[clamp(2rem,1.5rem+1.8vw,3rem)] transition-colors group-hover:text-blue">{p.name}</h2>
                    <p className="mt-4 max-w-xl text-ink-soft">{p.summary}</p>
                  </div>
                  <span className="flex items-center gap-3 text-[0.85rem] whitespace-nowrap md:col-span-2 md:justify-end">
                    {p.bookingMode === "enroll" ? "Apply" : p.bookingMode === "inquire" ? "Enquire" : "Book online"}
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/20 transition-all duration-500 group-hover:border-ink group-hover:bg-ink group-hover:text-chalk">
                      <Arrow className="h-3 w-4" />
                    </span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand
        title={
          <>
            Not sure where to start? <em>Come see us.</em>
          </>
        }
        body="A tour is the easiest way to find the right fit for your family."
        primary={{ href: "/visit", label: "Book a tour" }}
        secondary={{ href: "/book", label: "Browse availability" }}
      />
    </>
  );
}
