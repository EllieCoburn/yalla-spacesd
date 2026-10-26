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
    "Every child. Every family. A place to belong. How inclusion shapes the way Yalla understands children, builds relationships and creates community.",
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
    title: "Every Child Deserves to Participate",
    paragraphs: [
      "Children develop, communicate, learn, and experience their environments in different ways. We recognize that development is neither linear nor uniform, and that every child brings their own strengths, needs, and emerging skills into a shared learning environment.",
      "At Yalla, we are committed to thoughtfully supporting children with disabilities, developmental differences, neurodivergence, sensory needs, diverse learning profiles, and developing social-emotional and self-regulation skills.",
      "We do not believe that a child’s belonging should be contingent upon their ability to consistently meet adult expectations, navigate group dynamics independently, or move through childhood without difficulty. Behaviors that challenge us are opportunities to better understand what a child is communicating, what skills are still developing, and what additional support may be needed.",
      "Rather than expecting every child to fit a single model of participation, we look for ways to adapt our environments, expectations, and approaches to honor the individual child. Our responsibility is to respond with curiosity, compassion, and developmentally informed guidance, while maintaining a safe and supportive environment for the entire community.",
      "Yalla voluntarily draws upon professional standards and guidance established by the National Association for the Education of Young Children (NAEYC) and the Division for Early Childhood (DEC), particularly their principles of developmentally appropriate practice, equitable access, meaningful participation, and individualized support.",
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
    photo: { src: "/photos/disco-ball.jpg", alt: "A toddler reaching for a mirrored ball that scatters light across the wall" },
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
