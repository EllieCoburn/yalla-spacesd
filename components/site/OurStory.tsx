import Image from "next/image";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

/** One chapter of the story: an optional date in the margin, text in a comfortable reading column. */
function Chapter({ marker, children }: { marker?: string; children: ReactNode }) {
  return (
    <Reveal className="grid gap-4 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-2 lg:col-start-2 lg:pt-1.5">
        {marker ? (
          <p className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-2">
            <span className="font-serif text-[1.05rem] text-blue italic">{marker}</span>
            <span className="h-px w-8 bg-blue/40 lg:w-10" />
          </p>
        ) : null}
      </div>
      <div className="space-y-6 text-[1.08rem] leading-[1.8] text-ink-soft lg:col-span-7">{children}</div>
    </Reveal>
  );
}

const Emphasis = ({ children }: { children: ReactNode }) => <p className="display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-[1.25]! text-ink">{children}</p>;

export function OurStory() {
  return (
    <section className="bg-paper py-20 lg:py-32">
      <div className="shell">
        <div className="grid items-end gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Index n="01">Our story</Index>
            <h2 className="display mt-6 text-[clamp(2.6rem,1.8rem+3vw,4.6rem)]">
              Our <em>story.</em>
            </h2>
            <p className="lede mt-10 text-ink">
              Working from home changed where parents could do their jobs. It did far less to change what it took to raise a young child while doing one.
            </p>
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <div className="relative ml-auto aspect-[4/5] w-[78%] overflow-hidden rounded-t-[999px] bg-sand lg:w-full">
              <Image src="/photos/garden.jpg" alt="Yalla’s yard in Bankers Hill" fill sizes="(min-width:1024px) 38vw, 78vw" className="object-cover" />
            </div>
          </div>
        </div>

        <div className="mt-20 space-y-16 lg:mt-28 lg:space-y-20">
          <Chapter>
            <p>
              For families with young children, that gap could feel enormous. The office was now the kitchen table, but the need for care, concentration,
              connection, and community remained. Being home did not mean being available. And wanting time to work did not mean wanting to spend the entire
              day apart.
            </p>
          </Chapter>

          <Chapter marker="Fall 2023">
            <p>
              In the fall of 2023, sisters Natalie Martin and Allyson Kirchberg set out to build something around that reality. They imagined an alternative
              to traditional childcare, designed specifically for San Diego families who worked remotely: a place where parents could settle into their work
              while their children received thoughtful care nearby. A shared destination, with space for each to have a meaningful day.
            </p>
            <Emphasis>From that vision, Yalla was born.</Emphasis>
          </Chapter>

          <Chapter marker="Spring 2025">
            <p>
              In the spring of 2025, Natalie and Allyson turned their attention toward their growing marketing agency. As they considered Yalla’s next
              chapter, they found Ellie Coburn, an early childhood educator, postpartum doula, and mother whose background in biocultural anthropology brought
              another dimension to the project. Ellie partnered with the sisters through the transition and became Yalla’s owner and executive director.
            </p>
            <p>Her approach begins with a question that is both practical and deeply human:</p>
            <blockquote className="relative border-l-2 border-blue/40 py-2 pl-6 sm:pl-8">
              <Mark name="sun" className="absolute -top-1 -left-[0.7rem] h-5 w-5 bg-paper text-blue" />
              <p className="display text-[clamp(1.7rem,1.2rem+1.6vw,2.5rem)] leading-[1.22]! text-ink italic">
                What would everyday life look like if we built more of it around how families actually live?
              </p>
            </blockquote>
          </Chapter>

          <Chapter>
            <p>
              For much of human history, raising children has involved networks of care extending beyond any one parent. The arrangements have varied across
              cultures and generations, but the work of caring has so often been shared. Modern parents can find themselves trying to recreate that support
              privately, fitting together caregivers, work schedules, friendships, and family time with very little room left over.
            </p>
            <Emphasis>Yalla is a local, tangible response to that challenge.</Emphasis>
          </Chapter>

          <Chapter>
            <p>
              Here, the needs of children and parents shape the same space. Children have room to move, experiment, revisit a discovery, and build
              relationships with familiar caregivers. Parents have somewhere comfortable to work and other adults with whom to share the ordinary texture of a
              day. There is room for a career, for a childhood, and for moments of connection between the two.
            </p>
            <p>
              This vision also reflects an understanding of early development: young children learn through relationships, sensory experiences, movement, and
              play. A thoughtfully prepared environment makes room for those experiences. So does a caregiver who has time to notice what holds a child’s
              attention, respond to an uncertain moment, or let an investigation continue a little longer. The beauty of a space matters most when it serves
              the people inside it.
            </p>
          </Chapter>

          <Chapter marker="Today">
            <p>
              Today, Yalla continues to expand its programming and create more ways for families to participate. Its spaces are carefully considered, but its
              purpose is grounded in everyday life: a parent finishing a piece of work, a child growing comfortable with a new friend, a familiar face at the
              start of the morning.
            </p>
            <p className="lede text-ink">
              Built by and for families, Yalla offers a place to practice a more workable relationship between earning a living and raising a child. One in
              which support is close, childhood has room to unfold, and being a working parent feels a little less like being pulled in two directions.
            </p>
            <Mark name="roofline" className="h-4 w-auto text-blue" />
          </Chapter>
        </div>
      </div>
    </section>
  );
}
