import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { leavePortal } from "@/app/prospective/actions";
import { Mark } from "@/components/brand/Mark";
import { TuitionExplorer } from "@/components/site/TuitionExplorer";
import { Button, Eyebrow, Index } from "@/components/ui/primitives";
import { membershipIncludes } from "@/content/pricing-public";
import { cohorts, fees, hours, tuitionYear, workspace } from "@/content/tuition";
import { hasProspectiveAccess } from "@/lib/prospective";

export const metadata: Metadata = { title: "Prospective Family Portal", robots: { index: false, follow: false } };

export default async function ProspectiveHome() {
  if (!(await hasProspectiveAccess())) redirect("/prospective");

  return (
    <>
      <section className="pt-32 pb-12 lg:pt-40">
        <div className="shell flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <Eyebrow>Prospective Family Portal</Eyebrow>
            <h1 className="display mt-6 text-[clamp(2.6rem,1.6rem+3.6vw,4.8rem)]">
              Welcome. <em>Here’s everything.</em>
            </h1>
            <p className="mt-5 max-w-xl text-[1.05rem] text-ink-soft">
              Current {tuitionYear} rates for Yalla Everyday and Yalla Flex, plus fees and workspace options. Questions are always welcome.
            </p>
          </div>
          <form action={leavePortal}>
            <button className="text-[0.85rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">Leave portal</button>
          </form>
        </div>
      </section>

      <section className="bg-paper py-20 lg:py-28">
        <div className="shell">
          <Index n="01">Yalla Everyday & Yalla Flex</Index>
          <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.3rem)]">
            Tuition <em>by cohort.</em>
          </h2>
          <p className="mt-5 max-w-2xl text-ink-soft">
            Monthly tuition for one to five days a week, full or half days. Each table ends with the Yalla Flex drop-in rate for that cohort.
          </p>
          <div className="mt-12">
            <TuitionExplorer cohorts={cohorts} hours={hours} />
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="shell grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Index n="02">Every membership includes</Index>
            <ul className="mt-8 space-y-4">
              {membershipIncludes.map((x) => (
                <li key={x} className="flex items-start gap-4 text-[1.02rem]">
                  <Mark name="sun" className="mt-1.5 h-3 w-3 shrink-0 text-blue" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <Index n="03">Fees</Index>
            <dl className="mt-6 divide-y divide-line border-y border-line">
              {fees.map((f) => (
                <div key={f.label} className="flex items-baseline justify-between gap-6 py-5">
                  <dt>
                    <span className="block text-[1rem]">{f.label}</span>
                    <span className="text-[0.82rem] text-ink-soft">{f.note}</span>
                  </dt>
                  <dd className="font-serif text-[1.35rem] whitespace-nowrap">{f.amount}</dd>
                </div>
              ))}
            </dl>

            <Index n="04" className="mt-16">
              Workspace upgrades
            </Index>
            <p className="mt-3 text-[0.95rem] text-ink-soft">Communal coworking is included. For more privacy, add a desk or office of your own.</p>
            <div className="mt-6 grid gap-px overflow-hidden bg-line sm:grid-cols-2">
              {workspace.map((w) => (
                <div key={w.name} className="bg-paper p-6">
                  <p className="display text-[1.5rem]">{w.name}</p>
                  <dl className="mt-4 space-y-2">
                    {w.rates.map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[0.95rem]">
                        <dt className="text-ink-soft">{k}</dt>
                        <dd className="font-serif">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-24 lg:pb-32">
        <div className="shell">
          <div className="bg-mist px-8 py-14 text-center sm:px-16">
            <Mark name="roofline" className="mx-auto h-5 w-auto text-blue" />
            <p className="display mx-auto mt-8 max-w-2xl text-[clamp(2rem,1.5rem+1.8vw,3rem)]">
              Ready for the next step? <em>Come visit.</em>
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button href="/visit" size="lg">
                Schedule a tour
              </Button>
              <Button href="/book" variant="outline" size="lg">
                Book a Flex day
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
