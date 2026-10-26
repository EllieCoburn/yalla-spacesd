import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHero } from "@/components/site/PageParts";
import { TeamCard } from "@/components/site/TeamCard";
import { Arrow, Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { team } from "@/content/team";

export const metadata: Metadata = {
  title: "Our Team",
  description: "Meet Team Yalla: the leadership, educarers and guides behind Yalla Childcare & Coworking in Bankers Hill, San Diego.",
};

export default function TeamPage() {
  const leadership = team[0];
  const cohorts = team.slice(1);
  return (
    <>
      <PageHero
        eyebrow="About · Our team"
        mark="balcony"
        title={
          <>
            Team <em>Yalla.</em>
          </>
        }
        lede="The people who make Yalla feel like home, from the founders who imagined it to the educarers and guides your children spend their days with."
      />

      <section className="pb-20 lg:pb-28">
        <div className="shell">
          <Index n="01">{leadership.title}</Index>
          <div className="mt-12 grid grid-cols-2 gap-x-5 gap-y-14 sm:gap-x-6 lg:grid-cols-5">
            {leadership.members.map((m, i) => (
              <Reveal key={m.name} delay={i * 70}>
                <TeamCard member={m} index={i} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-paper py-20 lg:py-28">
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Index n="02">In the classrooms</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Familiar faces, <em>every day.</em>
              </h2>
            </div>
            <p className="text-[1.05rem] text-ink-soft lg:col-span-6 lg:col-start-7 lg:pt-14">
              Each cohort has its own small team, so children build lasting relationships with the adults who care for them. In the RIE tradition, our
              infant and toddler teachers are called educarers: caring and educating are one and the same.
            </p>
          </div>

          <div className="mt-16 space-y-16 lg:space-y-20">
            {cohorts.map((g) => (
              <div key={g.key} className="grid gap-8 border-t border-line pt-10 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <h3 className="display text-[1.9rem]">{g.title}</h3>
                  <Link href="/club-yalla" className="mt-3 inline-flex items-center gap-2 text-[0.85rem] text-ink-soft hover:text-blue">
                    <span className="link-underline">About our cohorts</span>
                    <Arrow className="h-3 w-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-12 sm:gap-x-6 lg:col-span-8 lg:col-start-5 lg:grid-cols-3">
                  {g.members.map((m, i) => (
                    <Reveal key={m.name} delay={i * 80}>
                      <TeamCard member={m} cohort={g.cohort} index={i} />
                    </Reveal>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title={
          <>
            Come meet <em>the team.</em>
          </>
        }
        primary={{ href: "/visit", label: "Schedule a tour" }}
        secondary={{ href: "/about", label: "About Yalla" }}
      />
    </>
  );
}
