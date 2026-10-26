import { Mark } from "@/components/brand/Mark";
import { Draft } from "@/components/ui/Draft";
import { Index } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

const steps = [
  {
    mark: "arch" as const,
    title: "You arrive together",
    body: "Mornings begin side by side. Your child is welcomed into their cohort space by educarers and guides who know them well.",
  },
  {
    mark: "window" as const,
    title: "You settle in to work",
    body: "Head to the coworking space and have a proper workday, with desks, quiet and a community of parents who understand.",
  },
  {
    mark: "sun" as const,
    title: "They spend the day playing",
    body: "Children play, explore, create and build friendships at their own pace, guided by educators who plan with intention.",
  },
  {
    mark: "palm" as const,
    title: "You're close the whole time",
    body: "You're never far away. At the end of the day you leave together, often with a story or two.",
  },
];

const rhythm = [
  ["8:30", "Arrival & welcome", "Families arrive together; children ease in with open play. Early Bird care starts at 8:00."],
  ["Morning", "Gathering & invitations", "A small-group gathering, then invitations to create, build and explore."],
  ["Midday", "Lunch & rest", "Shared meals and rest, shaped to each child’s age and needs."],
  ["Afternoon", "Outdoors", "Time in the yard and the neighborhood: digging, climbing, noticing."],
  ["4:30", "Together again", "Departure, a few stories from the day, and home together."],
];

/** How a Club Yalla weekday works: parents onsite, children in their cohort. Shown on the Club Yalla program page only. */
export function ClubYallaDay({ start = 1 }: { start?: number }) {
  return (
    <>
      <section className="py-20 lg:py-28">
        <div className="shell grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Index n={String(start).padStart(2, "0")}>A Club Yalla day</Index>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
              Down the hall, <em>not across town.</em>
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

      <section className="roofline-edge bg-blue text-blue">
        <div className="py-20 text-chalk lg:py-32">
          <div className="shell grid gap-14 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="eyebrow text-chalk/60">{String(start + 1).padStart(2, "0")} · Daily rhythm</p>
              <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
                Predictable, <em className="text-mist!">never rigid.</em>
              </h2>
              <p className="mt-6 text-chalk/75">
                Young children flourish with a gentle, familiar shape to the day, with plenty of space inside it for wonder.
              </p>
            </div>
            <div className="lg:col-span-7 lg:col-start-6">
              <Draft note="Yalla to confirm the day’s rhythm">
                <ol className="divide-y divide-chalk/20 border-y border-chalk/20">
                  {rhythm.map(([t, h, b]) => (
                    <li key={h} className="grid grid-cols-[5.5rem_1fr] gap-4 py-6 sm:grid-cols-[7rem_1fr]">
                      <span className="font-serif text-[1.05rem] text-mist italic">{t}</span>
                      <div>
                        <p className="display text-[1.4rem]">{h}</p>
                        <p className="mt-1 text-[0.95rem] text-chalk/70">{b}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Draft>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
