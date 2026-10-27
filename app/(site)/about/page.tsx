import type { Metadata } from "next";
import Image from "next/image";
import { Mark } from "@/components/brand/Mark";
import { OurStory } from "@/components/site/OurStory";
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

      <OurStory />

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

      {/* Hidden until the team section is ready (TEAM_PUBLIC in content/team.ts). */}
      {TEAM_PUBLIC ? (
        <Section tone="paper">
          <div className="shell">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <Index n="03">The people</Index>
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
