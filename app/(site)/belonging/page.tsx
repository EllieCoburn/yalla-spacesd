import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import type { MarkName } from "@/components/brand/marks";
import { CtaBand, PageHero } from "@/components/site/PageParts";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Belonging at Yalla",
  description:
    "Different by nature. Together by choice. How belonging shapes the way Yalla understands one another, builds relationships and creates community.",
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
    title: "Participation Looks Different for Everyone",
    paragraphs: [
      "We recognize that people of all ages communicate, learn, socialize, work, and experience their environments in different ways.",
      "Our commitment to inclusion extends to children and adults with disabilities, developmental differences, neurodivergence, sensory needs, and diverse ways of engaging with the world.",
      "We do not believe that belonging should depend on a person’s ability to conform to a single model of participation, communication, or behavior.",
      "For children, this means approaching developing skills and challenging moments with curiosity, compassion, and individualized support. For adults, it means respecting different needs, perspectives, communication styles, and ways of participating in community life.",
      "Yalla voluntarily draws upon professional guidance from the National Association for the Education of Young Children (NAEYC) and the Division for Early Childhood (DEC), including principles of equitable access, developmentally appropriate practice, and meaningful participation.",
      "We value collaboration, thoughtful accommodations, open communication, and a shared responsibility to maintain a safe, supportive environment for everyone.",
    ],
    closing: "We recognize that true inclusion requires more than an invitation. It requires intention, flexibility, and a willingness to continually learn.",
  },
  {
    mark: "waves",
    title: "Beyond Labels and Expectations",
    paragraphs: [
      "We believe people deserve the freedom to be themselves without being confined by the assumptions, labels, or expectations of others.",
      "At Yalla, we challenge the idea that a person’s interests, abilities, personality, or potential can be determined by their age, gender, cultural background, family structure, profession, or perceived strengths and limitations.",
      "For children, this means resisting labels that reduce them to a particular behavior, temperament, or developmental stage. We create opportunities for exploration, discovery, and growth without unnecessary limitations imposed by adults.",
      "For grown-ups, it means recognizing that parenthood, caregiving, and professional identity are not one-dimensional. People bring whole lives, individual ambitions, different experiences, and evolving identities into our community.",
      "We believe our differences deserve room to exist without explanation, justification, or judgment.",
    ],
  },
  {
    mark: "moon",
    title: "A Community That Reflects the World",
    paragraphs: [
      "We believe that meaningful community is built through exposure to different experiences, perspectives, traditions, and ways of life.",
      "Our books, materials, conversations, programming, and shared spaces intentionally reflect a variety of cultures, languages, abilities, identities, and family structures.",
      "We recognize that children develop their understanding of identity, fairness, and difference through their everyday relationships and interactions. Just as importantly, we believe adults benefit from opportunities to build relationships across different backgrounds and experiences.",
      "Rather than expecting everyone to share the same beliefs, customs, or perspectives, we encourage curiosity, thoughtful dialogue, and mutual respect.",
      "Our goal is not to create a community in which everyone is the same, but one in which people can meaningfully participate while remaining themselves.",
    ],
  },
  {
    mark: "arch",
    title: "Respect Is a Daily Practice",
    paragraphs: [
      "Belonging is shaped by everyday interactions, not simply by what we say we value.",
      "We approach children as capable, worthy individuals who deserve dignity, even in difficult moments. We extend that same respect to parents, caregivers, educators, colleagues, and every adult who contributes to life at Yalla.",
      "We strive to replace assumptions with curiosity, judgment with understanding, and exclusion with thoughtful support.",
      "We recognize that sharing a community means balancing individual needs with collective well-being. Inclusion requires consideration for others, honest communication, healthy boundaries, and a willingness to navigate differences constructively.",
      "We understand that creating an equitable community is an ongoing responsibility, not a destination or a statement of perfection.",
      "This means listening when concerns arise, reflecting on our practices, and remaining open to change.",
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
            Different by nature. <em>Together by choice.</em>
          </>
        }
        lede="At Yalla, belonging isn’t a separate initiative. It’s foundational to how we understand one another, build relationships, and create community."
      />

      {/* The core: an experiment in community */}
      <section className="bg-paper py-20 lg:py-32">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Mark name="sprig" className="h-12 w-auto text-blue" />
              <h2 className="display mt-6 text-[clamp(2.3rem,1.6rem+2.4vw,3.8rem)]">
                An experiment <em>in community.</em>
              </h2>
            </div>
            <div className="space-y-6 text-[1.1rem] leading-[1.8] text-ink-soft lg:col-span-7 lg:col-start-6 lg:pt-3">
              <p className="lede text-ink">
                In many ways, Yalla is a grand experiment in what becomes possible when we create space for children and adults to genuinely
                share in community life.
              </p>
              <p>
                We are exploring a simple but ambitious idea: that the places where we work, care for our children, build relationships, and
                experience everyday life need not exist entirely apart from one another. That a more connected way of living is possible when
                we intentionally create the conditions for it.
              </p>
              <p>
                But meaningful community doesn’t happen simply because people occupy the same space. It asks something of all of us. It
                requires us to navigate differences, reconsider assumptions, extend grace, and recognize that our individual experiences are
                part of something larger.
              </p>
              <p>
                Through the process of building Yalla, we’ve come to understand that there are certain foundational principles that cannot be
                incidental to this experiment. They must be woven into the way we design our spaces, approach relationships, make decisions,
                and care for one another.
              </p>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-6 gap-3 sm:gap-5 lg:mt-24">
            {[
              { src: "/photos/rainbow-light.jpg", alt: "A toddler standing in rainbow light on a wooden floor", className: "col-span-3 aspect-[3/4] rounded-t-[999px] sm:col-span-2" },
              { src: "/photos/collage-wall.jpg", alt: "A collaborative cardboard collage on the play garden fence", className: "col-span-3 aspect-[3/4] sm:col-span-2 sm:mt-16" },
              { src: "/photos/painting-wall-child.jpg", alt: "A child painting at the outdoor painting wall", className: "col-span-6 aspect-[4/3] sm:col-span-2 sm:aspect-[3/4] sm:rounded-t-[999px]" },
            ].map((img, i) => (
              <Reveal key={img.src} delay={i * 90} className={`relative overflow-hidden bg-sand ${img.className}`}>
                <Image src={img.src} alt={img.alt} fill sizes="(min-width:640px) 33vw, 50vw" className="object-cover" />
              </Reveal>
            ))}
          </div>

          <Reveal className="mx-auto mt-20 max-w-4xl text-center lg:mt-28">
            <Mark name="dotsun" className="mx-auto h-10 w-10 text-blue" />
            <p className="display mt-8 text-[clamp(1.7rem,1.2rem+1.8vw,2.7rem)] leading-[1.25]!">
              Inclusion, dignity, mutual respect, curiosity, and a shared commitment to belonging are not simply values we aspire to.{" "}
              <em>They are the conditions that make a community like Yalla possible.</em>
            </p>
          </Reveal>
        </div>
      </section>

      {/* Our commitments */}
      <section className="py-20 lg:py-32">
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="eyebrow text-ink-soft">Our commitments</p>
              <h2 className="display mt-5 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                What belonging <em>asks of us.</em>
              </h2>
            </div>
            <div className="space-y-5 text-[1.05rem] leading-[1.8] text-ink-soft lg:col-span-7 lg:col-start-6 lg:pt-3">
              <p>
                The commitments that follow reflect our understanding of what it takes to build a place where people of different ages,
                abilities, backgrounds, identities, and experiences can genuinely belong. They are both the foundation we stand on and
                principles we will continue to examine, strengthen, and put into practice as our community grows.
              </p>
              <p>
                We believe that every person brings a unique identity, family story, cultural background, set of abilities, and way of
                experiencing the world. These differences aren’t obstacles to overcome. They are an essential part of what makes a community
                rich, meaningful, and human.
              </p>
              <p className="font-serif text-[1.2rem] leading-[1.55] text-ink italic">
                Our commitment is to cultivate a shared environment where children and their grown-ups are not simply welcomed, but genuinely
                seen, respected, and valued.
              </p>
            </div>
          </div>

          <div className="mt-14 border-t border-line lg:mt-20">
            {chapters.map((c, i) => (
              <details key={c.title} className="group border-b border-line">
                <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-start gap-x-5 gap-y-2 py-8 sm:gap-x-8 lg:grid-cols-12 lg:gap-x-10 lg:py-10 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-4 pt-1 lg:col-span-2">
                    <span className="font-serif text-[1.05rem] text-blue italic">{String(i + 1).padStart(2, "0")}</span>
                    <Mark name={c.mark} className="hidden h-9 w-auto text-blue sm:block" />
                  </span>
                  <span className="lg:col-span-9">
                    <span className="display block text-[clamp(1.6rem,1.3rem+1vw,2.2rem)] transition-colors group-hover:text-blue">{c.title}</span>
                    <span className="mt-2 block max-w-2xl text-[1rem] text-ink-soft">{c.paragraphs[0]}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink/20 transition-colors duration-500 group-open:border-ink group-open:bg-ink group-open:text-chalk lg:col-span-1 lg:justify-self-end"
                  >
                    <span className="relative block h-3.5 w-3.5">
                      <span className="absolute top-1/2 left-0 h-px w-3.5 bg-current" />
                      <span className="absolute top-0 left-1/2 h-3.5 w-px bg-current transition-transform duration-500 group-open:rotate-90 group-open:opacity-0" />
                    </span>
                  </span>
                </summary>
                <div className="grid pb-12 lg:grid-cols-12 lg:gap-x-10">
                  <div className="space-y-5 text-[1.05rem] leading-[1.8] text-ink-soft lg:col-span-8 lg:col-start-3">
                    {c.paragraphs.slice(1).map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                    {c.closing ? (
                      <p className="border-l-2 border-blue/40 pl-6 font-serif text-[1.2rem] leading-[1.55] text-ink italic">{c.closing}</p>
                    ) : null}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="roofline-edge bg-blue text-blue">
        <div className="py-20 text-chalk lg:py-32">
          <div className="shell grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="display text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Belonging Is Something <em className="text-mist!">We Build Together</em>
              </h2>
            </div>
            <div className="space-y-5 text-[1.05rem] leading-[1.8] text-chalk/80 lg:col-span-6 lg:col-start-7 lg:pt-3">
              <p>
                Yalla is more than a place where children spend their days or grown-ups come to work. It is a shared community shaped by the
                relationships, experiences, and contributions of the people who gather here.
              </p>
              <p>We believe children and adults alike deserve spaces where they can learn, grow, connect, and participate as their fullest selves.</p>
              <p>Every family brings something different to Yalla, and those differences make our community stronger.</p>
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
