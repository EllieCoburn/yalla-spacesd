import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import type { MarkName } from "@/components/brand/marks";
import { CtaBand, PageHero } from "@/components/site/PageParts";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Belonging at Yalla",
  description:
    "Every child. Every family. A place to belong. How inclusion shapes the way Yalla understands children, builds relationships and creates community.",
};

type Chapter = { mark: MarkName; title: string; paragraphs: ReactNode[]; closing?: string };

const chapters: Chapter[] = [
  {
    mark: "dotsun",
    title: "Families Come in Every Form",
    paragraphs: [
      "There is no single way to be a family.",
      "Our community welcomes families of all structures, backgrounds, races, ethnicities, national origins, religions, beliefs, sexual orientations, and gender identities.",
      "We recognize and celebrate families formed through birth, adoption, foster care, kinship care, and other caregiving relationships. We honor the many people who show up as parents, guardians, grandparents, and trusted grown-ups in children’s lives.",
      "Our language, materials, and daily practices are designed to reflect the diversity of real families, rather than assuming that every family looks or functions the same way.",
    ],
    closing: "However your family came to be, you deserve to feel at home here.",
  },
  {
    mark: "sprig",
    title: "Every Child Deserves to Participate",
    paragraphs: [
      "Children develop, communicate, learn, and experience their environments in different ways.",
      "We are committed to thoughtfully supporting children with disabilities, developmental differences, neurodivergence, sensory needs, and diverse learning profiles.",
      "Rather than expecting every child to fit a single model of participation, we look for ways to adapt our environments, expectations, and approaches to honor the individual child.",
      "We value collaboration with families, thoughtful accommodations, and ongoing communication about what meaningful participation can look like for each child.",
    ],
    closing: "We recognize that true inclusion requires more than an invitation. It requires intention, flexibility, and a willingness to continually learn.",
  },
  {
    mark: "waves",
    title: "Childhood Without Stereotypes",
    paragraphs: [
      "We believe children deserve the freedom to discover who they are without unnecessary limitations imposed by adults.",
      "At Yalla, toys, materials, activities, and opportunities are not assigned according to gender. Children are encouraged to explore their interests, express themselves, and engage in play that feels meaningful to them.",
      "Our approach is grounded in respect for each child’s developing identity, autonomy, and sense of self.",
    ],
  },
  {
    mark: "moon",
    title: "A Community That Reflects the World",
    paragraphs: [
      "Children begin developing an awareness of identity, difference, and fairness long before adulthood.",
      "We believe early childhood environments have an important responsibility to help children develop empathy, recognize unfairness, and appreciate the experiences of people whose lives may differ from their own.",
      "Our books, materials, conversations, and learning experiences intentionally reflect a variety of cultures, languages, abilities, identities, and family structures.",
    ],
    closing:
      "We do not believe that avoiding conversations about difference creates inclusion. We believe children deserve thoughtful, developmentally appropriate guidance in understanding the world and the people who share it.",
  },
  {
    mark: "arch",
    title: "Respect Is a Daily Practice",
    paragraphs: [
      "Our commitment to inclusion extends to the way we communicate, resolve conflict, support behavior, and build relationships.",
      "We approach children as capable, worthy individuals who deserve to be treated with dignity, even in difficult moments.",
      "We strive to replace shame with understanding, exclusion with support, and assumptions with curiosity.",
      "We recognize that creating an equitable community is an ongoing responsibility, not a destination or a statement of perfection.",
      "This means listening when families share concerns, reflecting on our own practices, and remaining open to change.",
    ],
  },
];

export default function BelongingPage() {
  return (
    <>
      <PageHero
        eyebrow="Belonging at Yalla"
        mark="dotsun"
        title={
          <>
            Every child. Every family. <em>A place to belong.</em>
          </>
        }
        lede="At Yalla, inclusion isn’t a separate initiative. It’s foundational to how we understand children, build relationships, and create community."
      />

      <section className="bg-paper py-20 lg:py-28">
        <div className="shell grid gap-10 lg:grid-cols-12">
          <div className="space-y-6 text-[1.1rem] leading-[1.8] text-ink-soft lg:col-span-6">
            <p>
              We believe that every child arrives with a unique identity, family story, cultural background, set of abilities, and way of
              experiencing the world. These differences aren’t obstacles to overcome. They are an essential part of what makes a community
              rich, meaningful, and human.
            </p>
          </div>
          <Reveal className="lg:col-span-5 lg:col-start-8 lg:pt-1">
            <p className="display text-[clamp(1.5rem,1.2rem+1vw,2rem)] leading-[1.3]! text-ink">
              Our commitment is to cultivate an environment where children and their grown-ups are not simply welcomed, but genuinely{" "}
              <em>seen, respected, and valued.</em>
            </p>
          </Reveal>
        </div>
      </section>

      <section className="py-20 lg:py-32">
        <div className="shell space-y-20 lg:space-y-28">
          {chapters.map((c, i) => (
            <Reveal key={c.title} className="grid gap-8 border-t border-line pt-12 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-4">
                <Index n={String(i + 1).padStart(2, "0")}>Belonging</Index>
                <Mark name={c.mark} className="mt-8 h-12 w-auto text-blue" />
                <h2 className="display mt-6 text-[clamp(2rem,1.5rem+1.6vw,2.9rem)]">{c.title}</h2>
              </div>
              <div className="space-y-5 text-[1.05rem] leading-[1.8] text-ink-soft lg:col-span-7 lg:col-start-6 lg:pt-2">
                {c.paragraphs.map((p, j) => (
                  <p key={j} className={j === 0 ? "text-[1.15rem] text-ink" : undefined}>
                    {p}
                  </p>
                ))}
                {c.closing ? (
                  <p className="border-l-2 border-blue/40 pl-6 font-serif text-[1.25rem] leading-[1.55] text-ink italic">{c.closing}</p>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="roofline-edge bg-blue text-blue">
        <div className="py-20 text-chalk lg:py-32">
          <div className="shell grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="eyebrow text-chalk/60">06 · Together</p>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Belonging Is Something <em className="text-mist!">We Build Together</em>
              </h2>
            </div>
            <div className="space-y-5 text-[1.05rem] leading-[1.8] text-chalk/80 lg:col-span-6 lg:col-start-7 lg:pt-3">
              <p>
                Yalla is more than a place where children spend their days. It is a community shaped by the families, educators, and children
                who share it.
              </p>
              <p>We invite every member of our community to contribute to an environment rooted in kindness, mutual respect, curiosity, and care.</p>
            </div>
          </div>
          <div className="shell mt-16 lg:mt-24">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Mark name="dotsun" className="mx-auto h-10 w-10 text-chalk" />
              <p className="display mt-8 text-[clamp(1.9rem,1.3rem+2.2vw,3.2rem)] leading-[1.2]!">
                You don’t have to be the same to belong. <em className="text-mist!">You simply have to be you.</em>
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <CtaBand
        title={
          <>
            We’d love to <em>meet your family.</em>
          </>
        }
        primary={{ href: "/visit", label: "Book a tour" }}
        secondary={{ href: "/about", label: "About Yalla" }}
      />
    </>
  );
}
