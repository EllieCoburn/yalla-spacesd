"use client";

import { useState } from "react";
import type { Cohort } from "@/content/tuition";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * Day times in minutes after midnight. Early Bird runs 8:00–8:30, care proper starts at 8:30,
 * half days end at 12:00 and full days at 4:30.
 */
const EARLY_BIRD = 8 * 60;
const CARE_START = 8 * 60 + 30;
const FULL_END = 16 * 60 + 30;
const HALF_HOURS = 3.5;
const FULL_HOURS = 8;
const STEP = 30;
const MIN_WINDOW = 120;
const WEEKS_PER_MONTH = 52 / 12;

const clock = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

const round5 = (n: number) => Math.round(n / 5) * 5;

/**
 * Custom tuition, prorated by hours of care (from 8:30). Up to a half day it is the half-day rate
 * per hour; beyond that it scales between the half-day and full-day rates.
 */
const customTuition = (half: number, full: number, start: number, end: number) => {
  const hrs = Math.max(0, end - Math.max(start, CARE_START)) / 60;
  return hrs <= HALF_HOURS ? (half * hrs) / HALF_HOURS : half + ((full - half) * (hrs - HALF_HOURS)) / (FULL_HOURS - HALF_HOURS);
};

/** Full tuition table by cohort; data arrives as props from the server. */
export function TuitionExplorer({
  cohorts,
  hours,
  earlyBirdDaily,
}: {
  cohorts: Cohort[];
  hours: { full: string; half: string };
  earlyBirdDaily: number;
}) {
  const [cohortId, setCohortId] = useState(cohorts[0].id);
  const [day, setDay] = useState<"full" | "half" | "custom">("full");
  const [earlyBird, setEarlyBird] = useState(false);
  const [start, setStart] = useState(CARE_START);
  const [end, setEnd] = useState(14 * 60);
  const c = cohorts.find((x) => x.id === cohortId)!;

  const withEarlyBird = day === "custom" ? start < CARE_START : earlyBird;
  const monthly = (days: number, full: number, half: number) => {
    const base = day === "full" ? full : day === "half" ? half : customTuition(half, full, start, end);
    const extra = withEarlyBird ? earlyBirdDaily * days * WEEKS_PER_MONTH : 0;
    return day === "custom" || withEarlyBird ? round5(base + extra) : base;
  };

  const moveStart = (v: number) => {
    setStart(v);
    if (end < v + MIN_WINDOW) setEnd(v + MIN_WINDOW);
  };
  const moveEnd = (v: number) => {
    setEnd(v);
    if (start > v - MIN_WINDOW) setStart(v - MIN_WINDOW);
  };

  const timeLabel =
    day === "custom"
      ? `${clock(start)} – ${clock(end)}`
      : `${withEarlyBird ? clock(EARLY_BIRD) : clock(CARE_START)} – ${(day === "full" ? hours.full : hours.half).split("–")[1].trim()}`;

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
            <p className="font-serif text-ink-soft italic">{timeLabel}</p>
          </div>

          {day === "custom" ? (
            <div className="mt-6 space-y-6 bg-mist/60 p-5 sm:p-6">
              {[
                { id: "custom-start", label: "Arrival", value: start, min: EARLY_BIRD, max: FULL_END - MIN_WINDOW, onChange: moveStart },
                { id: "custom-end", label: "Departure", value: end, min: EARLY_BIRD + MIN_WINDOW, max: FULL_END, onChange: moveEnd },
              ].map((r) => (
                <div key={r.id}>
                  <div className="flex items-baseline justify-between gap-4">
                    <label htmlFor={r.id} className="eyebrow text-[0.6rem] text-ink-soft">
                      {r.label}
                    </label>
                    <span className="font-serif text-[1.25rem]">{clock(r.value)}</span>
                  </div>
                  <input
                    id={r.id}
                    type="range"
                    min={r.min}
                    max={r.max}
                    step={STEP}
                    value={r.value}
                    onChange={(e) => r.onChange(Number(e.target.value))}
                    aria-valuetext={`${r.label} at ${clock(r.value)}`}
                    className="mt-3 w-full accent-[var(--color-blue)]"
                  />
                  <div className="mt-1 flex justify-between text-[0.75rem] text-ink-soft">
                    <span>{clock(r.min)}</span>
                    <span>{clock(r.max)}</span>
                  </div>
                </div>
              ))}
              <p className="text-[0.85rem] text-ink-soft">
                Custom rates are prorated by hours of care, based on our half-day and full-day tuition. Arriving at {clock(EARLY_BIRD)} includes Early Bird care. Custom schedules are arranged with us and subject to
                availability.
              </p>
            </div>
          ) : (
            <label className="mt-6 flex cursor-pointer items-start gap-3 text-[0.92rem]">
              <input type="checkbox" checked={earlyBird} onChange={(e) => setEarlyBird(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-blue)]" />
              <span>
                Add Early Bird care from {clock(EARLY_BIRD)}
                <span className="block text-[0.82rem] text-ink-soft">{usd(earlyBirdDaily)} a day, included in the monthly totals below</span>
              </span>
            </label>
          )}

          {c.note ? <p className="mt-4 text-[0.85rem] text-oxblood">{c.note}</p> : null}
          <table className="mt-6 w-full border-y border-line text-left">
            <caption className="sr-only">
              {c.name} monthly tuition, {timeLabel}
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
                  <td className="py-4 text-right font-serif text-[1.35rem]">{usd(monthly(n, full, half))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {withEarlyBird ? (
            <p className="mt-3 text-[0.8rem] text-ink-soft">
              Includes Early Bird at {usd(earlyBirdDaily)} a day, averaged over about 4.3 weeks a month.
            </p>
          ) : null}
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
