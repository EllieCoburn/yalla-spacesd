import type { Metadata } from "next";
import Image from "next/image";
import { Mark } from "@/components/brand/Mark";
import { CtaBand, Facts, PageHero, Section } from "@/components/site/PageParts";
import { ToConfirm } from "@/components/ui/Draft";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Our Spaces",
  description: "Cohort spaces, a play garden and a calm coworking room for parents, in Bankers Hill, San Diego.",
};

function Gallery({ images }: { images: { src: string; alt: string; className: string }[] }) {
  return (
    <div className="grid grid-cols-6 gap-3 sm:gap-5">
      {images.map((img, i) => (
        <Reveal key={img.src + i} delay={i * 90} className={`relative overflow-hidden bg-sand ${img.className}`}>
          <Image src={img.src} alt={img.alt} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover transition-transform duration-[1.6s] ease-[var(--ease-soft)] hover:scale-[1.04]" />
        </Reveal>
      ))}
    </div>
  );
}

export default function SpacesPage() {
  return (
    <>
      <PageHero
        eyebrow="Our Spaces"
        mark="window"
        title={
          <>
            A historic corner of Bankers Hill, <em>made for little lives.</em>
          </>
        }
        lede="Cohort spaces made for play, a shaded yard for exploring and a calm coworking room, home to weekday care, camps, weekend sessions, evenings out, gatherings and celebrations."
      />

      <section className="pb-6">
        <div className="shell">
          <Gallery
            images={[
              { src: "/photos/garden.jpg", alt: "The outdoor yard framed by trees", className: "col-span-6 aspect-[16/10] sm:col-span-4 sm:aspect-auto sm:row-span-2" },
              { src: "/photos/dinosaurs.jpg", alt: "A child playing outdoors with toy dinosaurs", className: "col-span-3 aspect-[3/4] rounded-t-[999px] sm:col-span-2" },
              { src: "/photos/lemon-play.jpg", alt: "Sensory play at the water table", className: "col-span-3 aspect-[3/4] sm:col-span-2 sm:aspect-square sm:rounded-full" },
            ]}
          />
          <p className="mt-6 text-[0.8rem] text-ink-soft">
            Placeholder photography from our current site. <ToConfirm>New photography</ToConfirm>
          </p>
        </div>
      </section>

      {/* Cohort spaces */}
      <Section>
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Index n="01">Cohort spaces</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Rooms that <em>invite.</em>
            </h2>
            <p className="mt-6 text-[1.05rem] text-ink-soft">
              Every corner is arranged with care and intention, with materials to build with, pour, paint and wonder over, and room for
              each child to follow their curiosity.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:col-span-6 lg:col-start-7">
            <div className="relative aspect-[3/4] overflow-hidden rounded-t-[999px] bg-sand">
              <Image src="/photos/painting.jpg" alt="Children painting" fill sizes="25vw" className="object-cover" />
            </div>
            <div className="relative mt-16 aspect-[3/4] overflow-hidden bg-sand">
              <Image src="/photos/sunflowers.jpg" alt="Sunflowers on a table in a cohort space" fill sizes="25vw" className="object-cover" />
            </div>
          </div>
        </div>
      </Section>

      {/* Outdoors */}
      <Section tone="paper">
        <div className="shell grid items-center gap-14 lg:grid-cols-12">
          <div className="relative order-2 lg:order-1 lg:col-span-6">
            <div className="relative aspect-[5/4] overflow-hidden bg-sand">
              <Image src="/photos/garden.jpg" alt="Trees and picnic tables in Yalla’s yard" fill sizes="(min-width:1024px) 45vw, 90vw" className="object-cover" />
            </div>
            <Mark name="palm" className="absolute -right-4 -bottom-10 h-44 w-auto text-blue" />
          </div>
          <div className="order-1 lg:order-2 lg:col-span-5 lg:col-start-8">
            <Index n="02">Outdoors</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Under the trees, <em>by the park.</em>
            </h2>
            <p className="mt-6 text-[1.05rem] text-ink-soft">
              San Diego weather is an invitation, and we take it. Our yard sits beneath the trees, and Balboa Park’s west entrance is just
              down the road.
            </p>
          </div>
        </div>
      </Section>

      {/* Coworking */}
      <section className="roofline-edge bg-ink text-ink">
        <div className="py-20 text-chalk lg:py-32">
          <div className="shell grid gap-14 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="eyebrow text-chalk/60">03 · The coworking space</p>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Your desk, <em className="text-mist!">a few steps away.</em>
              </h2>
              <p className="mt-6 text-chalk/75">
                A calm, beautifully designed room for focused work, built for parents who want to do great work and stay close to their
                children.
              </p>
              <div className="relative mt-12 aspect-[4/5] w-[85%] overflow-hidden rounded-t-[999px] bg-chalk/10">
                <Image src="/photos/cowork-entry.webp" alt="Blue-grey French doors opening onto the coworking space" fill sizes="(min-width:1024px) 35vw, 85vw" className="object-cover" />
              </div>
            </div>
            <div className="lg:col-span-6 lg:col-start-7 lg:pt-24">
              <p className="eyebrow mb-6 text-chalk/60">Working onsite · Club Yalla members</p>
              <div className="[&_dd]:text-chalk [&_dl]:border-chalk/20 [&_dl>div]:border-chalk/20 [&_dt]:text-chalk/60">
                  <Facts
                    items={[
                      { label: "Hours", value: "Weekdays 8:30am – 4:30pm, alongside childcare" },
                      { label: "Workspace", value: "Communal coworking for members, with private desks and offices available to rent" },
                      { label: "Calls", value: "Private phone booths available to rent" },
                      { label: "Internet", value: "High-speed internet" },
                      { label: "Refreshments", value: "Complimentary coffee, tea and light snacks, plus a shared kitchen" },
                      { label: "Printing", value: "Unlimited color printing" },
                      { label: "Parking", value: <>Details <ToConfirm /></> },
                    ]}
                  />
              </div>
            </div>
          </div>
          <div className="shell mt-16 grid grid-cols-6 gap-3 sm:gap-5 lg:mt-24">
            {[
              { src: "/photos/cowork-atrium.webp", alt: "The coworking atrium seen from the balcony, with long shared desks and hanging textile art", className: "col-span-6 aspect-[4/3] lg:col-span-4" },
              { src: "/photos/cowork-desk.webp", alt: "A quiet desk for two by the balcony", className: "col-span-3 aspect-[3/4] rounded-t-[999px] lg:col-span-2 lg:aspect-auto" },
              { src: "/photos/cowork-kitchen.webp", alt: "The bright coworking kitchen with a long counter by the windows", className: "col-span-3 aspect-[3/4] lg:col-span-6 lg:aspect-[21/9]" },
            ].map((img, k) => (
              <Reveal key={img.src} delay={k * 90} className={`relative overflow-hidden bg-chalk/10 ${img.className}`}>
                <Image src={img.src} alt={img.alt} fill sizes="(min-width:1024px) 66vw, 100vw" className="object-cover" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title={
          <>
            Photos are lovely. <em>Visiting is better.</em>
          </>
        }
        primary={{ href: "/visit", label: "Book a tour" }}
        secondary={{ href: "/programs", label: "Explore programs" }}
      />
    </>
  );
}
