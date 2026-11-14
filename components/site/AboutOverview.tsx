import Image from "next/image";
import { Mark } from "@/components/brand/Mark";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

/** What Yalla is, in general terms (no founders or history). Wording from Yalla. */
export function AboutOverview() {
  return (
    <section className="bg-paper py-20 lg:py-32">
      <div className="shell">
        <div className="grid items-end gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Index n="01">Who we are</Index>
            <h2 className="display mt-6 text-[clamp(2.6rem,1.8rem+3vw,4.6rem)]">
              What Yalla <em>is.</em>
            </h2>
            <p className="lede mt-10 text-ink">
              Childhood deserves spaces designed around its possibilities. Families deserve communities that recognize the many ways they live, work, grow, and care for one another.
            </p>
            <div className="mt-6 space-y-5 text-[1.08rem] leading-[1.75] text-ink-soft">
              <p>Yalla brings those ideas together through thoughtful childcare, play-based experiences, flexible programming, and spaces that welcome both children and the adults who love them.</p>
              <p>
                Whether it’s a familiar place to spend the week, an afternoon of discovery, an evening to reconnect, or a little more room to navigate everyday life, Yalla exists to make the
                experience of raising young children richer, more connected, and a little more joyful.
              </p>
            </div>
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <div className="relative ml-auto aspect-[4/5] w-[78%] overflow-hidden rounded-t-[999px] bg-sand lg:w-full">
              <Image src="/photos/garden.jpg" alt="Yalla’s yard in Bankers Hill" fill sizes="(min-width:1024px) 38vw, 78vw" className="object-cover" />
            </div>
          </div>
        </div>

        <Reveal className="mt-20 grid gap-10 lg:mt-28 lg:grid-cols-12">
          <div className="space-y-6 text-[1.08rem] leading-[1.8] text-ink-soft lg:col-span-7 lg:col-start-2">
            <p>
              Yalla is a community in San Diego’s Bankers Hill built around a simple idea: the early years of childhood should be full of possibility, and the people raising young children
              deserve meaningful support along the way.
            </p>
            <p>
              Our spaces and experiences are shaped by a deep respect for childhood. We believe children are capable, curious, and naturally driven to explore the world around them. Through
              relationships, movement, sensory experiences, and open-ended play, they develop an understanding of themselves, others, and their environment. Our role is to create the
              conditions for that learning to unfold naturally, with attentive caregivers, thoughtfully prepared environments, and time to follow an idea wherever it leads.
            </p>
            <p>
              We also recognize that no two families need exactly the same thing. Some find their rhythm through consistent weekday childcare. Others need the flexibility of occasional care,
              a place to work, an enriching weekend experience, or a trusted community to turn to when life gets busy. Yalla brings these possibilities together through Club Yalla, Yalla Flex,
              Camp Yalla, Yalla Happenings, and a growing collection of experiences and services for families.
            </p>
            <p>
              What connects everything we do is a belief that children thrive when the adults and communities around them thrive, too. We hope Yalla becomes more than a place families visit.
              We hope it becomes a familiar part of their lives, a place to build relationships, discover new possibilities, and feel a genuine sense of belonging.
            </p>
          </div>
          <div className="lg:col-span-3 lg:col-start-10 lg:pt-2">
            <p className="display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-[1.25]! text-ink">
              For the wonder of childhood <em>and the realities of raising children.</em>
            </p>
            <Mark name="roofline" className="mt-6 h-4 w-auto text-blue" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
