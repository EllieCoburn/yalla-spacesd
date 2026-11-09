"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { familyRateTotal } from "@/lib/booking/family-rate";
import type { PublicSession } from "@/lib/ops/public-booking";

/** An age group (matched by its minimum age in months) or a cohort (matched by name). */
export type DateGroup = { key: string; label: string; sub?: string; minAge?: number; cohort?: string; priceCents: number };

const fmt = (date: string, o: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
};
const todayLA = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};
const NO_DAYS: string[] = [];
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
const open = (s: PublicSession | undefined): s is PublicSession => !!s && (s.state.state === "available" || s.state.state === "limited");

/**
 * Choose how many children are coming and as many dates as you like, then book them in one go.
 * Live availability is fetched in the browser; the chosen sessions go straight into the booking
 * basket, where checkout matches each child to the right session.
 */
export function ProgramDates({
  kind,
  groups,
  unit,
  days = NO_DAYS,
  horizonDays,
  familyRate = false,
  groupNoun = "age group",
}: {
  kind: string;
  groups: DateGroup[];
  unit: "day" | "evening";
  /** Dates to show even before availability loads (e.g. confirmed camp days). */
  days?: string[];
  /** How far ahead to look for dates. */
  horizonDays: number;
  /** After Hours: siblings on the same evening get the family rate. */
  familyRate?: boolean;
  groupNoun?: string;
}) {
  const router = useRouter();
  const [today] = useState(todayLA);
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = [addDays(today, horizonDays), ...days].reduce((m, d) => (d > m ? d : m));
      const found: PublicSession[] = [];
      try {
        // The availability endpoint returns up to 120 days at a time.
        for (let from = today; from <= last; from = addDays(from, 120)) {
          const to = addDays(from, 119) < last ? addDays(from, 119) : last;
          const res = await fetch(`/api/availability?from=${from}&to=${to}&kind=${kind}`, { cache: "no-store" });
          const json = (await res.json()) as { sessions?: PublicSession[] };
          found.push(...(json.sessions ?? []));
        }
        if (!cancelled) setSessions(found);
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, today, horizonDays, kind]);

  const matches = (s: PublicSession, g: DateGroup) => (g.cohort ? s.cohort === g.cohort : s.ages.min === g.minAge);
  const sessionFor = (day: string, g: DateGroup) => sessions?.find((s) => s.localDate === day && matches(s, g));

  const all = useMemo(() => [...new Set([...days, ...(sessions ?? []).map((s) => s.localDate)])].filter((d) => d >= today).sort(), [days, sessions, today]);
  const months = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of all) m.set(d.slice(0, 7), [...(m.get(d.slice(0, 7)) ?? []), d]);
    return [...m.entries()];
  }, [all]);

  // Sparse schedules (one or two dates a month, like After Hours) read better as one grid than as
  // a row per month.
  const flow = months.length > 2 && months.every(([, list]) => list.length <= 2);

  const coming = groups.filter((g) => (counts[g.key] ?? 0) > 0);
  const children = coming.reduce((n, g) => n + counts[g.key], 0);
  const wanted = coming.length ? coming : groups;
  const known = !!sessions?.length;
  /** A date can be picked when at least one of the chosen groups has room (or availability is unknown). */
  const pickable = (day: string) => !known || wanted.some((g) => open(sessionFor(day, g)));
  const fewLeft = (day: string) => known && wanted.some((g) => sessionFor(day, g)?.state.state === "limited");

  const toggle = (day: string) => setPicked((p) => (p.includes(day) ? p.filter((d) => d !== day) : [...p, day].sort()));
  const toggleMonth = (list: string[]) => {
    const can = list.filter(pickable);
    const allIn = can.every((d) => picked.includes(d));
    setPicked((p) => (allIn ? p.filter((d) => !can.includes(d)) : [...new Set([...p, ...can])].sort()));
  };
  const bump = (key: string, by: number) => {
    setHint(false);
    setCounts((c) => ({ ...c, [key]: Math.max(0, Math.min(6, (c[key] ?? 0) + by)) }));
  };

  // What will go in the basket, the total, and any chosen group that's full on a chosen date.
  const lines: PublicSession[] = [];
  const fullFor: string[] = [];
  let total = 0;
  for (const d of picked) {
    const prices: number[] = [];
    for (const g of coming) {
      const s = sessionFor(d, g);
      if (open(s)) {
        lines.push(s);
        for (let i = 0; i < counts[g.key]; i++) prices.push(s.priceCents ?? g.priceCents);
      } else if (known) fullFor.push(`${g.label} on ${fmt(d, { month: "short", day: "numeric" })}`);
      else for (let i = 0; i < counts[g.key]; i++) prices.push(g.priceCents);
    }
    total += familyRate ? familyRateTotal(prices) : prices.reduce((a, b) => a + b, 0);
  }

  const book = () => {
    if (!picked.length) return;
    if (!children) {
      setHint(true);
      document.getElementById(`${kind}-who`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (lines.length) router.push(`/book?offering=${kind}&select=${lines.map((s) => s.id).join(",")}&until=${picked[picked.length - 1]}`);
    else router.push(`/book?offering=${kind}&date=${picked[0]}`);
  };

  const units = (n: number) => `${n} ${unit}${n === 1 ? "" : "s"}`;

  if (sessions && !months.length) return <p className="border border-line bg-chalk p-7 text-ink-soft">New dates are coming soon. Check back shortly.</p>;

  return (
    <div className="border border-line bg-chalk">
      {/* Who's coming */}
      <div id={`${kind}-who`} className="border-b border-line p-5 sm:p-7">
        <p className="eyebrow text-[0.62rem] text-ink-soft">1 · Who’s coming?</p>
        <ul className={`mt-3 grid gap-2 sm:grid-cols-2 ${groups.length === 3 ? "lg:grid-cols-3" : ""}`}>
          {groups.map((g) => {
            const n = counts[g.key] ?? 0;
            return (
              <li key={g.key} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${n ? "border-ink bg-paper" : "border-ink/15"}`}>
                <span>
                  <span className="block text-[0.95rem]">{g.label}</span>
                  {g.sub ? <span className="text-[0.78rem] text-ink-soft">{g.sub}</span> : null}
                </span>
                <span className="flex items-center gap-2" role="group" aria-label={`Children in ${g.label}`}>
                  <button
                    type="button"
                    onClick={() => bump(g.key, -1)}
                    disabled={!n}
                    aria-label={`One fewer in ${g.label}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/20 text-[1rem] hover:border-ink disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-4 text-center tabular-nums" aria-live="polite">
                    {n}
                  </span>
                  <button
                    type="button"
                    onClick={() => bump(g.key, 1)}
                    aria-label={`One more in ${g.label}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/20 text-[1rem] hover:border-ink"
                  >
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        <p className={`mt-2 text-[0.8rem] ${hint ? "text-oxblood" : "text-ink-soft"}`}>
          {hint ? `Add at least one child to continue.` : `Bringing more than one? Add each child to their ${groupNoun}.`}
          {familyRate ? " Siblings on the same evening get the family rate." : ""}
        </p>
      </div>

      {/* Dates */}
      <div className="p-5 sm:p-7">
        <p className="eyebrow text-[0.62rem] text-ink-soft">2 · Choose your {unit}s</p>
        {!sessions && !days.length ? (
          <div className="mt-4 space-y-3" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-[4.25rem] animate-pulse rounded-xl bg-sand/50" />
            ))}
          </div>
        ) : flow ? (
          <div className="mt-4">
            {all.filter(pickable).length > 1 ? (
              <button type="button" onClick={() => toggleMonth(all)} className="mb-3 text-[0.78rem] text-blue underline-offset-4 hover:underline">
                {all.filter(pickable).every((d) => picked.includes(d)) ? "Clear" : "Select all"}
              </button>
            ) : null}
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {all.map((d) => {
                const on = picked.includes(d);
                const ok = pickable(d);
                return (
                  <li key={d}>
                    <button
                      type="button"
                      disabled={!ok}
                      aria-pressed={on}
                      onClick={() => toggle(d)}
                      aria-label={`${fmt(d, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${ok ? (fewLeft(d) ? ", a few spots left" : "") : ", full"}`}
                      className={`relative flex h-[5.25rem] w-full flex-col items-center justify-center rounded-xl border transition-all duration-200 focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none ${
                        on ? "border-ink bg-ink text-chalk" : ok ? "border-ink/15 bg-paper hover:border-ink" : "cursor-not-allowed border-dashed border-ink/15 text-ink/30"
                      }`}
                    >
                      <span className="text-[0.62rem] tracking-[0.12em] uppercase opacity-70">
                        {fmt(d, { month: "short" })}
                        {d.slice(0, 4) !== today.slice(0, 4) ? ` ’${d.slice(2, 4)}` : ""}
                      </span>
                      <span className={`font-serif text-[1.6rem] leading-none ${ok ? "" : "line-through"}`}>{fmt(d, { day: "numeric" })}</span>
                      <span className="mt-0.5 text-[0.62rem] opacity-60">{fmt(d, { weekday: "short" })}</span>
                      {fewLeft(d) && !on ? <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-oxblood" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {months.map(([month, list]) => {
              const can = list.filter(pickable);
              const allIn = can.length > 0 && can.every((d) => picked.includes(d));
              return (
                <div key={month} className="grid gap-3 py-4 sm:grid-cols-[8.5rem_1fr] sm:items-center">
                  <div className="flex items-baseline justify-between gap-3 sm:block">
                    <p className="font-serif text-[1.3rem] leading-tight">
                      {fmt(`${month}-01`, { month: "long" })} <span className="text-[0.85rem] text-ink-soft italic">{month.slice(0, 4)}</span>
                    </p>
                    {can.length > 1 ? (
                      <button type="button" onClick={() => toggleMonth(list)} className="text-[0.78rem] text-blue underline-offset-4 hover:underline">
                        {allIn ? "Clear" : "Select all"}
                      </button>
                    ) : null}
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {list.map((d) => {
                      const on = picked.includes(d);
                      const ok = pickable(d);
                      return (
                        <li key={d}>
                          <button
                            type="button"
                            disabled={!ok}
                            aria-pressed={on}
                            onClick={() => toggle(d)}
                            aria-label={`${fmt(d, { weekday: "long", month: "long", day: "numeric" })}${ok ? (fewLeft(d) ? ", a few spots left" : "") : ", full"}`}
                            className={`relative flex h-[4.25rem] w-[4.25rem] flex-col items-center justify-center rounded-xl border transition-all duration-200 focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none ${
                              on ? "border-ink bg-ink text-chalk" : ok ? "border-ink/15 bg-paper hover:border-ink" : "cursor-not-allowed border-dashed border-ink/15 text-ink/30"
                            }`}
                          >
                            <span className="text-[0.62rem] tracking-[0.12em] uppercase opacity-70">{fmt(d, { weekday: "short" })}</span>
                            <span className={`font-serif text-[1.45rem] leading-none ${ok ? "" : "line-through"}`}>{fmt(d, { day: "numeric" })}</span>
                            {fewLeft(d) && !on ? <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-oxblood" aria-hidden /> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {known ? (
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-oxblood" aria-hidden /> A few spots left
            </span>
            <span>
              <span className="line-through">12</span> Full
            </span>
          </p>
        ) : null}
      </div>

      {/* Summary */}
      <div className="sticky bottom-0 z-20 border-t border-line bg-chalk/95 p-4 backdrop-blur sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[0.92rem]" aria-live="polite">
            {picked.length ? (
              <p>
                <span className="font-medium">{units(picked.length)}</span>
                {children ? (
                  <span className="text-ink-soft">
                    {" "}
                    · {children} {children === 1 ? "child" : "children"} · {usd(total)}
                  </span>
                ) : (
                  <span className="text-ink-soft"> · add who’s coming</span>
                )}
              </p>
            ) : (
              <p className="text-ink-soft">Tap the {unit}s you’d like. Book as many as you want.</p>
            )}
            {fullFor.length ? <p className="mt-0.5 text-[0.75rem] text-oxblood">Full: {fullFor.slice(0, 3).join(", ")}{fullFor.length > 3 ? ` and ${fullFor.length - 3} more` : ""}</p> : null}
          </div>
          <button
            type="button"
            onClick={book}
            disabled={!picked.length}
            className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[0.9rem] text-chalk transition-colors hover:bg-blue disabled:cursor-not-allowed disabled:opacity-35"
          >
            {picked.length ? `Book ${units(picked.length)}` : `Book ${unit}s`}
          </button>
        </div>
      </div>
    </div>
  );
}
