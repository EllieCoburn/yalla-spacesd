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

type Chapter = { mark: MarkName; title: string; paragraphs: ReactNode[]; closing?: string; photo?: { src: string; alt: string } };

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
    photo: { src: "/photos/garden-doorway.jpg", alt: "Toddlers at an open door looking out to the sunny play garden" },
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
    photo: { src: "/photos/disco-ball.jpg", alt: "A toddler reaching for a mirrored ball that scatters light across the wall" },
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
    photo: { src: "/photos/basket.jpg", alt: "A woven basket of wooden rings and spools on a low shelf" },
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

      <section className="bg-paper py-20 lg:py-28">
        <div className="shell grid gap-10 lg:grid-cols-12">
          <div className="space-y-6 text-[1.1rem] leading-[1.8] text-ink-soft lg:col-span-6">
            <p>
              We believe that every person brings a unique identity, family story, cultural background, set of abilities, and way of
              experiencing the world. These differences aren’t obstacles to overcome. They are an essential part of what makes a community
              rich, meaningful, and human.
            </p>
          </div>
          <Reveal className="lg:col-span-5 lg:col-start-8 lg:pt-1">
            <p className="display text-[clamp(1.5rem,1.2rem+1vw,2rem)] leading-[1.3]! text-ink">
              Our commitment is to cultivate a shared environment where children and their grown-ups are not simply welcomed, but genuinely{" "}
              <em>seen, respected, and valued.</em>
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pt-20 lg:pt-28">
        <div className="shell grid grid-cols-6 gap-3 sm:gap-5">
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
      </section>

      <section className="py-20 lg:py-32">
        <div className="shell space-y-20 lg:space-y-28">
          {chapters.map((c, i) => (
            <Reveal key={c.title} className="grid gap-8 border-t border-line pt-12 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-4">
                <div className="flex items-center gap-5">
                  <span className="font-serif text-[1.05rem] text-blue italic">{String(i + 1).padStart(2, "0")}</span>
                  <Mark name={c.mark} className="h-11 w-auto text-blue" />
                </div>
                <h2 className="display mt-6 text-[clamp(2rem,1.5rem+1.6vw,2.9rem)]">{c.title}</h2>
                {c.photo ? (
                  <div className="relative mt-10 aspect-[4/5] w-[78%] max-w-sm overflow-hidden rounded-t-[999px] bg-sand">
                    <Image src={c.photo.src} alt={c.photo.alt} fill sizes="(min-width:1024px) 26vw, 78vw" className="object-cover" />
                  </div>
                ) : null}
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
              <p className="font-serif text-[1.05rem] text-mist italic">06</p>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
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
