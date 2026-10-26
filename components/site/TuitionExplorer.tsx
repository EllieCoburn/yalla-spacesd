"use client";

import { useState } from "react";
import type { Cohort } from "@/content/tuition";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Day times in minutes after midnight. Arrival is 8:30; half days end at 12:00 and full days at 4:30. */
const ARRIVAL = 8 * 60 + 30;
const HALF_END = 12 * 60;
const FULL_END = 16 * 60 + 30;
const STEP = 30;

const clock = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

/** Custom tuition is prorated by hours between the half-day and full-day rates, rounded to the nearest $5. */
const prorate = (half: number, full: number, end: number) =>
  Math.round((half + ((full - half) * (end - HALF_END)) / (FULL_END - HALF_END)) / 5) * 5;

/** Full tuition table by cohort; data arrives as props from the server. */
export function TuitionExplorer({ cohorts, hours }: { cohorts: Cohort[]; hours: { full: string; half: string } }) {
  const [cohortId, setCohortId] = useState(cohorts[0].id);
  const [day, setDay] = useState<"full" | "half" | "custom">("full");
  const [end, setEnd] = useState(14 * 60);
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
          {(["full", "half", "custom"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              aria-pressed={day === d}
              className={`h-8 rounded-full px-4 text-[0.8rem] transition-all duration-300 ${day === d ? "bg-blue text-chalk" : "text-ink-soft hover:text-ink"}`}
            >
              {d === "full" ? "Full day" : d === "half" ? "Half day" : "Custom"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_15rem]">
        <div>
          <div className="flex items-baseline justify-between">
            <p className="display text-[2.2rem]">{c.name}</p>
            <p className="font-serif text-ink-soft italic">
              {day === "full" ? hours.full : day === "half" ? hours.half : `${clock(ARRIVAL)} – ${clock(end)}`}
            </p>
          </div>
          {day === "custom" ? (
            <div className="mt-6 bg-mist/60 p-5 sm:p-6">
              <div className="flex items-baseline justify-between gap-4">
                <label htmlFor="custom-end" className="eyebrow text-[0.6rem] text-ink-soft">
                  Departure time
                </label>
                <span className="font-serif text-[1.25rem]">{clock(end)}</span>
              </div>
              <input
                id="custom-end"
                type="range"
                min={HALF_END}
                max={FULL_END}
                step={STEP}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                aria-valuetext={`Departure at ${clock(end)}`}
                className="mt-4 w-full accent-[var(--color-blue)]"
              />
              <div className="mt-1 flex justify-between text-[0.75rem] text-ink-soft">
                <span>{clock(HALF_END)}</span>
                <span>{clock(FULL_END)}</span>
              </div>
              <p className="mt-4 text-[0.85rem] text-ink-soft">
                Arrival is at {clock(ARRIVAL)}. Custom rates are prorated between our half-day and full-day tuition. Custom schedules are
                arranged with us and subject to availability.
              </p>
            </div>
          ) : null}
          {c.note ? <p className="mt-2 text-[0.85rem] text-oxblood">{c.note}</p> : null}
          <table className="mt-6 w-full border-y border-line text-left">
            <caption className="sr-only">
              {c.name} monthly tuition, {day === "custom" ? `custom day until ${clock(end)}` : `${day} day`}
            </caption>
            <thead>
              <tr className="eyebrow text-[0.58rem] text-ink-soft">
                <th className="py-3 font-medium">Days per week</th>
                <th className="py-3 text-right font-medium">Monthly tuition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line">
              {c.weekly.map(([n, full, half]) => (
                <tr key={n}>
                  <td className="py-4 text-[1rem]">
                    {n} day{n > 1 ? "s" : ""} a week
                  </td>
                  <td className="py-4 text-right font-serif text-[1.35rem]">
                    {usd(day === "full" ? full : day === "half" ? half : prorate(half, full, end))}
                  </td>
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
