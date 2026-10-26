import { cohortMarks } from "@/components/brand/CohortMarks";
import { Eyebrow } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { cohorts, flexAges, hours, tuitionYear, usd } from "@/content/tuition";

/** Yalla Flex day rates by cohort, from the rate sheet. Shown on the Yalla Flex program page. */
export function FlexRates() {
  return (
    <section id="rates" className="scroll-mt-24 py-20 lg:py-28">
      <div className="shell grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Eyebrow>{tuitionYear} rates</Eyebrow>
          <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
            Day rates, <em>by cohort.</em>
          </h2>
          <p className="mt-6 text-ink-soft">
            Full days run {hours.full} and half days {hours.half}. No registration fee for drop-in care.
          </p>
        </div>
        <div className="lg:col-span-7 lg:col-start-6">
          <table className="w-full border-y border-line text-left">
            <caption className="sr-only">Yalla Flex day rates by cohort</caption>
            <thead>
              <tr className="eyebrow text-[0.58rem] text-ink-soft">
                <th className="py-4 font-medium">Cohort</th>
                <th className="py-4 text-right font-medium">Full day</th>
                <th className="py-4 text-right font-medium">Half day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line">
              {cohorts.map((c, i) => {
                const Illustration = cohortMarks[c.name as keyof typeof cohortMarks];
                return (
                  <Reveal as="tr" key={c.id} delay={i * 70}>
                    <td className="py-5">
                      <span className="flex items-center gap-4">
                        <span className="flex h-12 w-10 items-end justify-center overflow-hidden rounded-t-full bg-mist">
                          <Illustration className="mb-0.5 w-[90%] text-blue" />
                        </span>
                        <span>
                          <span className="display block text-[1.35rem]">{c.name}</span>
                          <span className="text-[0.8rem] text-ink-soft">
                            {flexAges[c.id]} · Ratio {c.ratio}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-5 text-right font-serif text-[1.35rem]">{usd(c.daily.full)}</td>
                    <td className="py-5 text-right font-serif text-[1.35rem]">{usd(c.daily.half)}</td>
                  </Reveal>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
