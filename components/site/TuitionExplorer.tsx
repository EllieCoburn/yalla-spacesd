"use client";

import { useState } from "react";
import type { Cohort } from "@/content/tuition";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Full tuition table by cohort; data arrives as props from the server. */
export function TuitionExplorer({ cohorts, hours }: { cohorts: Cohort[]; hours: { full: string; half: string } }) {
  const [cohortId, setCohortId] = useState(cohorts[0].id);
  const [day, setDay] = useState<"full" | "half">("full");
  const c = cohorts.find((x) => x.id === cohortId)!;

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Cohort" className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] flex gap-2 overflow-x-auto px-[clamp(1.25rem,4vw,3.5rem)] sm:mx-0 sm:px-0">
          {cohorts.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={x.id === cohortId}
              onClick={() => setCohortId(x.id)}
              className={`h-10 shrink-0 rounded-full border px-5 text-[0.88rem] transition-all duration-300 ${
                x.id === cohortId ? "border-ink bg-ink text-chalk" : "border-ink/15 hover:border-ink/50"
              }`}
            >
              {x.name}
            </button>
          ))}
        </div>
        <div className="inline-flex self-start rounded-full border border-ink/15 p-1">
          {(["full", "half"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              aria-pressed={day === d}
              className={`h-8 rounded-full px-4 text-[0.8rem] transition-all duration-300 ${day === d ? "bg-blue text-chalk" : "text-ink-soft hover:text-ink"}`}
            >
              {d === "full" ? "Full day" : "Half day"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_15rem]">
        <div>
          <div className="flex items-baseline justify-between">
            <p className="display text-[2.2rem]">{c.name}</p>
            <p className="font-serif text-ink-soft italic">{day === "full" ? hours.full : hours.half}</p>
          </div>
          {c.note ? <p className="mt-2 text-[0.85rem] text-oxblood">{c.note}</p> : null}
          <table className="mt-6 w-full border-y border-line text-left">
            <caption className="sr-only">
              {c.name} monthly tuition, {day} day
            </caption>
            <thead>
              <tr className="eyebrow text-[0.58rem] text-ink-soft">
                <th className="py-3 font-medium">Schedule</th>
                <th className="py-3 text-right font-medium">Monthly tuition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line">
              {c.weekly.map(([n, full, half]) => (
                <tr key={n}>
                  <td className="py-4 text-[1rem]">
                    {n} day{n > 1 ? "s" : ""} a week
                  </td>
                  <td className="py-4 text-right font-serif text-[1.35rem]">{usd(day === "full" ? full : half)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid grid-cols-2 gap-px self-start overflow-hidden bg-line lg:grid-cols-1">
          <div className="bg-paper p-6">
            <dt className="eyebrow text-[0.58rem] text-ink-soft">Caregiver-to-child ratio</dt>
            <dd className="display mt-2 text-[2.4rem] text-blue">{c.ratio}</dd>
            <dd className="text-[0.78rem] text-ink-soft">maximum</dd>
          </div>
          <div className="bg-paper p-6">
            <dt className="eyebrow text-[0.58rem] text-ink-soft">Cohort size</dt>
            <dd className="display mt-2 text-[2.4rem] text-blue">{c.maxSize}</dd>
            <dd className="text-[0.78rem] text-ink-soft">children, maximum</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
