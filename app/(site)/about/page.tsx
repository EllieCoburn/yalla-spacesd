import type { Metadata } from "next";
import Image from "next/image";
import { Mark } from "@/components/brand/Mark";
import { AboutOverview } from "@/components/site/AboutOverview";
import { CtaBand, PageHero, Section } from "@/components/site/PageParts";
import { Draft, ToConfirm } from "@/components/ui/Draft";
import Link from "next/link";
import { TeamCard } from "@/components/site/TeamCard";
import { Arrow, Button, Index } from "@/components/ui/primitives";
import { leadership, TEAM_PUBLIC } from "@/content/team";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "About Yalla",
  description: "The story, values and people behind Yalla Childcare & Coworking in Bankers Hill, San Diego.",
};

const values = [
  { mark: "arch" as const, title: "Closeness", body: "Parents deserve to thrive personally and professionally without sacrificing closeness with their children." },
  { mark: "sun" as const, title: "Wonder", body: "Childhood is magic. We protect the time and space for children to play, explore and create." },
  { mark: "window" as const, title: "Intention", body: "Educators guide with care and purpose, and every detail of the environment is chosen thoughtfully." },
  { mark: "palm" as const, title: "Community", body: "Raising children is both personal and communal. We make room for both." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About Yalla"
        mark="sun"
        title={
          <>
            For childhood. For parenthood. <em>For connection.</em>
          </>
        }
        lede="Yalla is a community for children and their grown-ups, offering thoughtfully designed childcare, coworking, and ways to play, learn, and connect in San Diego."
      />

      <AboutOverview />

      <Section>
        <div className="shell">
          <Index n="02">What we believe</Index>
          <div className="mt-12 grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={i * 90} className="bg-chalk p-8 lg:p-10">
                <Mark name={v.mark} className="h-12 w-auto text-blue" />
                <h3 className="display mt-10 text-[1.8rem]">{v.title}</h3>
                <p className="mt-3 text-ink-soft">{v.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* Our space */}
      <section id="our-space" className="scroll-mt-24 bg-paper py-20 lg:py-28">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-6">
              <Index n="03">Our space</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                A historic corner of Bankers Hill, <em>made for little lives.</em>
              </h2>
            </div>
            <p className="text-[1.05rem] text-ink-soft lg:col-span-5 lg:col-start-8">
              Cohort spaces made for play, a shaded yard for exploring and a calm coworking room for grown-ups, all under one roof, with
              Balboa Park’s west entrance just down the road.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-6 gap-3 sm:gap-5">
            {[
              { src: "/photos/painting-table.jpg", alt: "A toddler painting with brushes and bright colors outdoors", className: "col-span-6 aspect-[16/10] sm:col-span-4 sm:row-span-2 sm:aspect-auto" },
              { src: "/photos/disco-ball.jpg", alt: "A toddler reaching for a mirrored ball that scatters light across the wall", className: "col-span-3 aspect-[3/4] rounded-t-[999px] sm:col-span-2" },
              { src: "/photos/tulle.jpg", alt: "A child exploring embroidered tulle in the sunlight", className: "col-span-3 aspect-[3/4] sm:col-span-2 sm:aspect-square sm:rounded-full" },
            ].map((img, i) => (
              <Reveal key={img.src} delay={i * 90} className={`relative overflow-hidden bg-sand ${img.className}`}>
                <Image src={img.src} alt={img.alt} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
              </Reveal>
            ))}
          </div>

          <div className="mt-20 grid gap-12 md:grid-cols-3 lg:mt-28">
            {[
              {
                title: "Spaces that invite",
                body: "Every corner is arranged with care and intention, with materials to build with, pour, paint and wonder over, and room for each child to follow their curiosity.",
                img: { src: "/photos/instruments.jpg", alt: "An infant exploring a drum, bells and a tambourine on a woven rug" },
                shape: "rounded-t-[999px]",
              },
              {
                title: "Under the trees",
                body: "San Diego weather is an invitation, and we take it. Our yard sits beneath the trees, made for digging, painting and exploring in the open air.",
                img: { src: "/photos/garden-doorway.jpg", alt: "Toddlers at an open door looking out to the sunny play garden" },
                shape: "",
              },
              {
                title: "Your desk, a few steps away",
                body: "A calm, beautifully designed coworking room for focused work, with high-speed internet, coffee and tea, and a shared kitchen, close to your child.",
                img: { src: "/photos/cowork-atrium.webp", alt: "The coworking atrium with long shared desks and hanging textile art" },
                shape: "rounded-full",
              },
            ].map((c, i) => (
              <Reveal key={c.title} delay={i * 90}>
                <div className={`relative aspect-square overflow-hidden bg-sand ${c.shape}`}>
                  <Image src={c.img.src} alt={c.img.alt} fill sizes="(min-width:768px) 30vw, 90vw" className="object-cover" />
                </div>
                <h3 className="display mt-8 text-[1.7rem]">{c.title}</h3>
                <p className="mt-3 text-ink-soft">{c.body}</p>
              </Reveal>
            ))}
          </div>

          <div className="mt-14 grid grid-cols-6 gap-3 sm:gap-5">
            {[
              { src: "/photos/cowork-desk.webp", alt: "A quiet desk for two by the balcony", className: "col-span-3 aspect-[3/4] sm:col-span-2" },
              { src: "/photos/cowork-kitchen.webp", alt: "The bright coworking kitchen with a long counter by the windows", className: "col-span-3 aspect-[3/4] sm:col-span-4 sm:aspect-auto" },
            ].map((img, i) => (
              <Reveal key={img.src} delay={i * 90} className={`relative overflow-hidden bg-sand ${img.className}`}>
                <Image src={img.src} alt={img.alt} fill sizes="(min-width:1024px) 60vw, 50vw" className="object-cover" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Hidden until the team section is ready (TEAM_PUBLIC in content/team.ts). */}
      {TEAM_PUBLIC ? (
        <Section tone="paper">
          <div className="shell">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <Index n="04">The people</Index>
                <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                  The hearts <em>behind the place.</em>
                </h2>
              </div>
              <Link href="/about/team" className="inline-flex items-center gap-3 text-[0.9rem] hover:text-blue">
                <span className="link-underline">Meet the whole team</span>
                <Arrow className="h-3 w-5" />
              </Link>
            </div>
            <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-12 sm:gap-x-6 lg:grid-cols-5">
              {leadership.map((m, i) => (
                <Reveal key={m.name} delay={i * 70}>
                  <TeamCard member={m} index={i} />
                </Reveal>
              ))}
            </div>
            <div className="mt-14">
              <Button href="/about/team" variant="outline">
                Our educarers & guides
              </Button>
            </div>
          </div>
        </Section>
      ) : null}

      <CtaBand
        title={
          <>
            We’d love to <em>meet you.</em>
          </>
        }
        primary={{ href: "/visit", label: "Book a tour" }}
        secondary={{ href: "/experience", label: "The Yalla experience" }}
      />
    </>
  );
}
