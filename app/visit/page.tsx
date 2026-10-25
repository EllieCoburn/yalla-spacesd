import type { Metadata } from "next";
import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";
import { Facts, PageHero, Section } from "@/components/site/PageParts";
import { TourForm } from "@/components/site/TourForm";
import { Draft, ToConfirm } from "@/components/ui/Draft";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Visit Yalla",
  description: "Schedule a tour of Yalla in Bankers Hill, San Diego. Location, parking and what to expect.",
};

export default function VisitPage() {
  return (
    <>
      <PageHero
        eyebrow="Visit Yalla"
        mark="arch"
        title={
          <>
            Come on in. <em>Stay a while.</em>
          </>
        }
        lede="Walk the classrooms, sit in the coworking space and see how a Yalla day unfolds. Tell us a little about your family and we’ll find a time."
      />

      <section className="pb-20 lg:pb-32">
        <div className="shell grid gap-16 lg:grid-cols-12">
          <Reveal className="bg-paper p-7 sm:p-12 lg:col-span-7">
            <p className="eyebrow text-ink-soft">Request a tour</p>
            <div className="mt-8">
              <TourForm />
            </div>
          </Reveal>

          <div className="lg:col-span-4 lg:col-start-9">
            <Index n="01">Find us</Index>
            <p className="display mt-6 text-[1.9rem]">
              {site.neighborhood}, <em>{site.city}</em>
            </p>
            <p className="mt-3 text-ink-soft">{site.locationLine}</p>
            <p className="mt-2 text-ink-soft">
              Street address <ToConfirm />
            </p>
            <div className="relative mt-10 aspect-square overflow-hidden">
              <WindowField seed={21} width={600} height={600} horizon={false} className="absolute inset-0 h-full w-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-chalk shadow-[0_10px_40px_-10px_rgba(41,44,69,.35)]">
                  <Mark name="mark" className="h-16 w-auto text-blue" />
                </div>
              </div>
              <span className="eyebrow absolute bottom-3 left-3 bg-chalk px-2 py-1 text-[0.55rem] text-ink-soft">Map to come</span>
            </div>
          </div>
        </div>
      </section>

      <Section tone="paper">
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Index n="02">Practical details</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Getting <em>here.</em>
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Facts
              items={[
                { label: "Neighborhood", value: "Bankers Hill, near Balboa Park’s west entrance" },
                { label: "Hours", value: `${site.hours} · Early Bird care from 8:00am` },
                { label: "Parking", value: <ToConfirm /> },
                { label: "Arriving", value: <>Entrance & check-in <ToConfirm /></> },
                { label: "Tour length", value: <ToConfirm /> },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section>
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Index n="03">Your visit</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              What to <em>expect.</em>
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Draft note="Yalla to confirm the tour format">
              <ol className="space-y-10">
                {[
                  ["A warm welcome", "We’ll meet you at the door and show you around."],
                  ["The classrooms & yard", "See where children play, explore and rest, and how the day flows."],
                  ["The coworking space", "Get a feel for where you’d work, and how close you’d be."],
                  ["Your questions", "Schedules, programs, starting dates: we’ll talk through whatever is on your mind."],
                ].map(([t, b], i) => (
                  <li key={t} className="hairline grid gap-3 border-t pt-7 sm:grid-cols-[3rem_1fr]">
                    <span className="font-serif text-blue italic">0{i + 1}</span>
                    <div>
                      <p className="display text-[1.6rem]">{t}</p>
                      <p className="mt-2 text-ink-soft">{b}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Draft>
          </div>
        </div>
      </Section>
    </>
  );
}
