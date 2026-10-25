import type { Metadata } from "next";
import Image from "next/image";
import { Mark } from "@/components/brand/Mark";
import { CtaBand, PageHero, Section } from "@/components/site/PageParts";
import { Draft, ToConfirm } from "@/components/ui/Draft";
import { Index } from "@/components/ui/primitives";
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
            Built for the way <em>families live now.</em>
          </>
        }
        lede="Yalla is a living community of parents, children and educators who share the daily rhythms of work, play and care in the heart of Bankers Hill."
      />

      <Section tone="paper">
        <div className="shell grid items-center gap-14 lg:grid-cols-12">
          <div className="relative lg:col-span-5">
            <div className="relative aspect-[4/5] overflow-hidden rounded-t-[999px] bg-sand">
              <Image src="/photos/garden.jpg" alt="The Yalla building and yard" fill sizes="(min-width:1024px) 38vw, 90vw" className="object-cover" />
            </div>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <Index n="01">Our story</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Why <em>Yalla.</em>
            </h2>
            <div className="mt-8">
              <Draft note="Yalla to share the founding story">
                <div className="space-y-5 text-[1.05rem] text-ink-soft">
                  <p>How Yalla began, who started it and why. The moment the idea took shape, and what you hoped to build for families in San Diego.</p>
                  <p>What the name means to you, and how this building in Bankers Hill became home.</p>
                </div>
              </Draft>
            </div>
          </div>
        </div>
      </Section>

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

      <Section tone="paper">
        <div className="shell">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <Index n="03">The people</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                The hearts <em>behind the place.</em>
              </h2>
            </div>
            <ToConfirm>Team names, roles, photos & bios</ToConfirm>
          </div>
          <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div className="flex aspect-[3/4] items-end justify-center overflow-hidden rounded-t-[999px] bg-mist">
                  <Mark name={(["arch", "palm", "window", "balcony"] as const)[i]} className="mb-10 h-24 w-auto text-blue/30" />
                </div>
                <p className="display mt-5 text-[1.35rem]">Team member</p>
                <p className="eyebrow mt-1 text-[0.6rem] text-ink-soft">Role</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <CtaBand
        title={
          <>
            We’d love to <em>meet you.</em>
          </>
        }
        primary={{ href: "/visit", label: "Schedule a tour" }}
        secondary={{ href: "/experience", label: "The Yalla experience" }}
      />
    </>
  );
}
