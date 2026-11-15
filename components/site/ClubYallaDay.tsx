import { Mark } from "@/components/brand/Mark";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

const steps = [
  {
    mark: "arch" as const,
    title: "Start the day together",
    body: "Arrive with your child and settle them into a welcoming play space, where caring staff help ease the transition into the day.",
  },
  {
    mark: "window" as const,
    title: "Make space for your work",
    body: "Settle into our dedicated coworking space to work, study, or move a project forward, alongside other parents making time for their priorities.",
  },
  {
    mark: "sun" as const,
    title: "Let play lead the way",
    body: "Your child follows their curiosity through hands-on exploration, creative materials, and time with other children, supported by attentive staff.",
  },
  {
    mark: "palm" as const,
    title: "Stay connected, all under one roof",
    body: "You remain onsite throughout the day, with space for your own pursuits and the comfort of being in the same place. When the day wraps up, head home together.",
  },
];

/** How a Club Yalla weekday works: parents onsite, children in their cohort. Shown on the Club Yalla page. */
export function ClubYallaDay({ start = 1 }: { start?: number }) {
  return (
    <section className="py-20 lg:py-28">
      <div className="shell grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Index n={String(start).padStart(2, "0")}>A Club Yalla day</Index>
          <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
            A world of their own. <em>Right next to yours.</em>
          </h2>
        </div>
        <ol className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
          {steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 100} className="hairline border-t pt-8">
              <div className="flex items-start justify-between">
                <span className="font-serif text-ink-soft italic">0{i + 1}</span>
                <Mark name={s.mark} className="h-10 w-auto text-blue" />
              </div>
              <h3 className="display mt-6 text-[1.65rem]">{s.title}</h3>
              <p className="mt-3 text-ink-soft">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
