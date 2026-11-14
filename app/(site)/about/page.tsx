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

/** One photo shape across the page: soft rounded corners, consistent proportions. */
const PHOTO = "relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand";
const PHOTO_WIDE = "relative aspect-[4/3] overflow-hidden rounded-2xl bg-sand";

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
                A little world of wonder, <em>tucked into Bankers Hill.</em>
              </h2>
            </div>
            <p className="text-[1.05rem] text-ink-soft lg:col-span-5 lg:col-start-8">
              Thoughtfully prepared spaces for play, discovery, creativity, and connection. From our sunlit childcare cohorts and open-ended play
              environments to our shaded outdoor spaces and welcoming coworking areas, every corner of Yalla has been designed with intention. Just a
              short stroll from Balboa Park, our space offers room for children to explore and families to feel at home.
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-3 sm:gap-5">
            {[
              { src: "/photos/painting-table.jpg", alt: "A toddler painting with brushes and bright colors outdoors" },
              { src: "/photos/disco-ball.jpg", alt: "A toddler reaching for a mirrored ball that scatters light across the wall" },
              { src: "/photos/tulle.jpg", alt: "A child exploring embroidered tulle in the sunlight" },
            ].map((img, i) => (
              <Reveal key={img.src} delay={i * 90} className={PHOTO}>
                <Image src={img.src} alt={img.alt} fill sizes="(min-width:640px) 33vw, 100vw" className="object-cover" />
              </Reveal>
            ))}
          </div>

          <div className="mt-20 grid gap-12 md:grid-cols-3 lg:mt-28">
            {[
              {
                title: "Thoughtfully designed for childhood",
                body: "Our environments reflect the belief that children are capable, curious, and active participants in their own learning. Inspired by the Reggio Emilia approach, we use natural materials, open-ended resources, and thoughtfully arranged spaces to encourage creativity, experimentation, and independent discovery. Our environments adapt to the children, experiences, and programs they serve.",
                img: { src: "/photos/instruments.jpg", alt: "An infant exploring a drum, bells and a tambourine on a woven rug" },
              },
              {
                title: "Room to explore, indoors and out",
                body: "From art and sensory experiences to movement, imaginative play, and outdoor exploration, Yalla offers children opportunities to engage with the world in meaningful ways. Our indoor and outdoor spaces support a wide range of experiences, with activities and environments thoughtfully adapted to the ages, interests, and needs of each group.",
                img: { src: "/photos/garden-doorway.jpg", alt: "Toddlers at an open door looking out to the sunny play garden" },
              },
              {
                title: "Spaces that bring people together",
                body: "Yalla was designed with children and families in mind. Alongside our play and learning environments, our Bankers Hill location includes comfortable coworking areas, private offices, and shared gathering spaces. How families use these spaces varies by program, but each is part of our broader commitment to making Yalla a welcoming and versatile community resource.",
                img: { src: "/photos/cowork-atrium.webp", alt: "The coworking atrium with long shared desks and hanging textile art" },
              },
            ].map((c, i) => (
              <Reveal key={c.title} delay={i * 90}>
                <div className={PHOTO}>
                  <Image src={c.img.src} alt={c.img.alt} fill sizes="(min-width:768px) 30vw, 90vw" className="object-cover" />
                </div>
                <h3 className="display mt-8 text-[1.7rem]">{c.title}</h3>
                <p className="mt-3 text-ink-soft">{c.body}</p>
              </Reveal>
            ))}
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 sm:gap-5">
            {[
              { src: "/photos/cowork-desk.webp", alt: "A quiet desk for two by the balcony" },
              { src: "/photos/cowork-kitchen.webp", alt: "The bright coworking kitchen with a long counter by the windows" },
            ].map((img, i) => (
              <Reveal key={img.src} delay={i * 90} className={PHOTO_WIDE}>
                <Image src={img.src} alt={img.alt} fill sizes="(min-width:640px) 50vw, 100vw" className="object-cover" />
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
        primary={{ href: "/book-a-tour", label: "Book a tour" }}
        secondary={{ href: "/experience", label: "The Yalla experience" }}
      />
    </>
  );
}
