import Image from "next/image";
import { Mark } from "@/components/brand/Mark";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

/** What Yalla is, in general terms (no founders or history). */
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
              Working from home changed where parents could do their jobs. It did far less to change what it takes to raise a young child while doing one.
            </p>
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
              Yalla is a place in San Diego’s Bankers Hill where the needs of children and parents shape the same space. Children have room to move,
              experiment, revisit a discovery, and build relationships with familiar caregivers. Parents have somewhere comfortable to work, and other adults
              with whom to share the ordinary texture of a day. There is room for a career, for a childhood, and for moments of connection between the two.
            </p>
            <p>
              Young children learn through relationships, sensory experiences, movement and play. A thoughtfully prepared environment makes room for those
              experiences. So does a caregiver who has time to notice what holds a child’s attention, respond to an uncertain moment, or let an investigation
              continue a little longer. The beauty of a space matters most when it serves the people inside it.
            </p>
            <p>
              Families join in the way that suits them: weekly childcare and coworking with Club Yalla, Flex days when they need them, Camp Yalla, and
              Happenings like immersive play, weekend play and evenings out.
            </p>
          </div>
          <div className="lg:col-span-3 lg:col-start-10 lg:pt-2">
            <p className="display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-[1.25]! text-ink">
              A more workable relationship between earning a living and raising a child.
            </p>
            <Mark name="roofline" className="mt-6 h-4 w-auto text-blue" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
