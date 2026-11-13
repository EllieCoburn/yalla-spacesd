import type { Metadata } from "next";
import Link from "next/link";
import { Facts, PageHero, Section } from "@/components/site/PageParts";
import { TourForm } from "@/components/site/TourForm";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Book a tour",
  description: "Book a tour of Yalla in Bankers Hill, San Diego. Location, parking and what to expect.",
};

const mapsQuery = encodeURIComponent(site.address.value ?? `${site.neighborhood}, ${site.city}`);
const mapsEmbed = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;
const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

export default function BookATourPage() {
  return (
    <>
      <PageHero
        eyebrow="Book a tour"
        mark="arch"
        title={
          <>
            Come tour <em>our community.</em>
          </>
        }
        lede="Explore our indoor play spaces, wander through the play garden, and take a look around our coworking spaces. We’d love to hear about your family, answer your questions, and help you picture your days at Yalla."
        image={{ src: "/photos/garden-doorway.jpg", alt: "Toddlers at an open door looking out to the sunny play garden" }}
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
            <div className="relative mt-10 aspect-square overflow-hidden bg-mist">
              <iframe
                title={`Map showing Yalla at ${site.address.value}`}
                src={mapsEmbed}
                className="absolute inset-0 h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <p className="mt-5 text-ink-soft">{site.address.value}</p>
            <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[0.85rem] text-ink-soft hover:text-blue">
              <span className="link-underline">Open in Google Maps</span>
            </a>
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
                { label: "Hours", value: `Weekday cohorts: ${site.hours}, Early Bird from 8:00am. Weekend, evening and camp times vary.` },
                {
                  label: "Parking",
                  value: (
                    <Link href="/parking" className="underline decoration-blue/40 underline-offset-4 hover:text-blue">
                      See our parking guide
                    </Link>
                  ),
                },
                { label: "Arriving", value: "Your tour guide will meet you in the front lobby at the time of your tour." },
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
            <div>
              <ol className="space-y-10">
                {[
                  ["A warm welcome", "A Yalla team member will greet you and introduce you to our community."],
                  ["Explore our spaces", "Take a guided walk through our coworking areas, childcare cohorts, play spaces, and shared outdoor environments."],
                  ["Get to know Yalla", "Learn more about our philosophy, daily rhythms, and the programs and experiences we offer."],
                  ["Let’s talk!", "We’ll answer your questions about membership, programming, scheduling, and anything else you’d like to know."],
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
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
