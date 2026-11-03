import type { Metadata } from "next";
import Image from "next/image";
import { CtaBand, PageHero, Section } from "@/components/site/PageParts";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Our Approach",
  description: "Yalla’s philosophy of care, and the Reggio Emilia and RIE traditions it grows from: play-based, relationship-led and unhurried.",
};

const beliefs = [
  { title: "Children are capable", body: "We see every child as curious, competent and full of ideas from the very beginning, and we care for them that way." },
  { title: "Relationships come first", body: "Children thrive with adults they trust. Our educarers and guides take the time to know each child, and each family, by name." },
  { title: "Play is the work", body: "Children learn by doing: building, pouring, painting, digging, pretending. Days at Yalla are built around open-ended play." },
  { title: "The environment teaches quietly", body: "Every material, invitation and transition is chosen on purpose, so the space itself invites exploration." },
  { title: "Time is unhurried", body: "Curiosity sets the pace. Children are given time, beautiful materials and full attention." },
  { title: "We raise children in community", body: "Raising children is both personal and communal. Yalla is a place for children and their grown-ups to share in it together." },
];

const reggio = [
  { title: "The capable child", body: "Children are seen as strong, curious and rich in potential, with their own theories about how the world works." },
  { title: "The hundred languages", body: "Children express what they think and feel in many ways: drawing, building, movement, music, clay, pretend play and words." },
  { title: "Learning that emerges", body: "Projects grow from children’s own questions and interests, explored over days or weeks rather than set in advance." },
  { title: "The environment as an educator", body: "Thoughtful, beautiful spaces with natural light, real materials and room to gather are considered a partner in learning." },
  { title: "Making learning visible", body: "Adults observe closely and document children’s work and words, so families can see how ideas develop over time." },
  { title: "Families as partners", body: "Parents and caregivers are part of the learning community, not visitors to it." },
];

const rie = [
  { title: "Respect from the start", body: "Infants are treated as whole people. Adults talk to them, tell them what is about to happen and wait for their response." },
  { title: "Caregiving as connection", body: "Everyday moments like feeding, diapering and dressing are slowed down and shared, a time for full attention rather than something to rush through." },
  { title: "Uninterrupted play", body: "Babies are given safe space and simple, open-ended objects, and trusted to play and explore at their own pace." },
  { title: "Freedom of movement", body: "Children move into positions such as rolling, sitting and standing in their own time, rather than being placed there by adults." },
  { title: "Observe more, do less", body: "Adults watch closely before stepping in, which helps children build confidence, concentration and problem-solving." },
];

export default function ApproachPage() {
  return (
    <>
      <PageHero
        eyebrow="Our Approach"
        mark="sprig"
        title={
          <>
            Care that begins with <em>respect.</em>
          </>
        }
        lede="Yalla’s approach to care is rooted in the Reggio Emilia and RIE traditions: play-based, relationship-led and unhurried. Here is what we believe, and where those beliefs come from."
        image={{ src: "/photos/collage-wall.jpg", alt: "A wall of children’s collage work" }}
      />

      {/* Our philosophy */}
      <Section tone="paper">
        <div className="shell grid items-start gap-14 lg:grid-cols-12">
          <div className="lg:sticky lg:top-32 lg:col-span-5">
            <Index n="01">Our philosophy</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Childhood, given <em>room to unfold.</em>
            </h2>
            <p className="mt-6 text-[1.05rem] text-ink-soft">
              Children come to us already full of curiosity. Our role is to protect the time, space and relationships they need to follow it, and to
              support the grown-ups who love them along the way.
            </p>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <div className="space-y-12">
              {beliefs.map((b, i) => (
                <Reveal key={b.title} delay={i * 70} className="hairline grid gap-4 border-t pt-8 sm:grid-cols-[3rem_1fr]">
                  <span className="font-serif text-blue italic">0{i + 1}</span>
                  <div>
                    <h3 className="display text-[1.7rem]">{b.title}</h3>
                    <p className="mt-3 text-ink-soft">{b.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Reggio Emilia */}
      <Section>
        <div className="shell">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-6">
              <Index n="02">Reggio Emilia</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                The child has <em>a hundred languages.</em>
              </h2>
              <div className="mt-8 space-y-5 text-[1.05rem] text-ink-soft">
                <p>
                  The Reggio Emilia approach began in the town of Reggio Emilia, in northern Italy, after the Second World War, when families came together to
                  build new places for their young children. Educator Loris Malaguzzi helped shape their ideas into an approach that is now admired around
                  the world.
                </p>
                <p>
                  At its heart is a simple, powerful image: the child as capable, curious and full of ideas, and learning as something children build
                  together with the adults and peers around them.
                </p>
              </div>
            </div>
            <div className="lg:col-span-5 lg:col-start-8">
              <div className="relative aspect-[4/5] overflow-hidden rounded-t-[999px] bg-sand">
                <Image src="/photos/paint-closeup.jpg" alt="Small hands working with paint" fill sizes="(min-width:1024px) 34vw, 90vw" className="object-cover" />
              </div>
            </div>
          </div>
          <ul className="mt-16 grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-3">
            {reggio.map((r, i) => (
              <Reveal as="li" key={r.title} delay={i * 70} className="bg-chalk p-8 lg:p-10">
                <p className="font-serif text-ink-soft italic">0{i + 1}</p>
                <h3 className="display mt-2 text-[1.55rem]">{r.title}</h3>
                <p className="mt-3 text-[0.98rem] text-ink-soft">{r.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </Section>

      {/* RIE */}
      <Section tone="paper">
        <div className="shell">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
            <div className="order-2 lg:order-1 lg:col-span-5">
              <div className="relative aspect-[4/5] overflow-hidden rounded-t-[999px] bg-sand">
                <Image src="/photos/basket.jpg" alt="A basket of simple objects for exploring" fill sizes="(min-width:1024px) 34vw, 90vw" className="object-cover" />
              </div>
            </div>
            <div className="order-1 lg:order-2 lg:col-span-6 lg:col-start-7">
              <Index n="03">RIE</Index>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Babies are <em>whole people.</em>
              </h2>
              <div className="mt-8 space-y-5 text-[1.05rem] text-ink-soft">
                <p>
                  RIE (Resources for Infant Educarers) was founded in Los Angeles in 1978 by Magda Gerber, who drew on the work of Hungarian pediatrician Emmi
                  Pikler. It is an approach to caring for infants and toddlers built on respect.
                </p>
                <p>
                  The word <em>educarer</em> comes from RIE. It describes someone who both cares for and learns alongside a young child, and it is the word we
                  use for the adults who care for our youngest children.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-16 space-y-0">
            {rie.map((r, i) => (
              <Reveal key={r.title} delay={i * 70} className="hairline grid gap-4 border-t py-8 sm:grid-cols-[3rem_1fr] lg:grid-cols-[3rem_20rem_1fr]">
                <span className="font-serif text-blue italic">0{i + 1}</span>
                <h3 className="display text-[1.55rem]">{r.title}</h3>
                <p className="text-ink-soft">{r.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* Together */}
      <Section>
        <div className="shell grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Index n="04">At Yalla</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Two traditions, <em>one way of caring.</em>
            </h2>
          </div>
          <div className="space-y-5 text-[1.05rem] text-ink-soft lg:col-span-6 lg:col-start-7 lg:pt-14">
            <p>
              Both traditions begin in the same place: deep respect for children, and trust in their ability to learn through relationships and play.
            </p>
            <p>
              RIE guides how our educarers care for infants and young toddlers: slowly, attentively and with full presence. As children grow, the Reggio
              Emilia approach inspires how our guides shape learning environments, follow children’s interests and make their thinking visible.
            </p>
            <p>And throughout, families are part of it: welcome, connected and part of a community raising children together.</p>
          </div>
        </div>
      </Section>

      <CtaBand
        title={
          <>
            Come see it <em>for yourself.</em>
          </>
        }
        body="The best way to understand our approach is to see it in person. Visit Yalla and meet the people behind it."
        primary={{ href: "/visit", label: "Book a tour" }}
        secondary={{ href: "/experience", label: "The Yalla Experience" }}
      />
    </>
  );
}
