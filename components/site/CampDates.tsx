"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PublicSession } from "@/lib/ops/public-booking";

const GROUPS = [
  { min: 18, label: "18 mo – 4 yrs" },
  { min: 48, label: "4 – 6 yrs" },
  { min: 84, label: "7 – 10 yrs" },
];
const DAY_PRICE = 16000;

const fmt = (date: string, o: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
};
const todayLA = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
const open = (s: PublicSession | undefined) => !!s && (s.state.state === "available" || s.state.state === "limited");

/**
 * Pick who's coming and as many camp days as you like, then book them in one go. Live availability
 * is fetched in the browser; the chosen sessions go straight into the booking basket.
 */
export function CampDates({ days }: { days: string[] }) {
  const router = useRouter();
  const [today] = useState(todayLA);
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [groups, setGroups] = useState<number[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = days.reduce((m, d) => (d > m ? d : m), today);
      const found: PublicSession[] = [];
      try {
        for (let from = today; from <= last; from = addDays(from, 120)) {
          const res = await fetch(`/api/availability?from=${from}&to=${addDays(from, 119)}&kind=camp`, { cache: "no-store" });
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
  }, [days, today]);

  const all = useMemo(() => [...new Set([...days, ...(sessions ?? []).map((s) => s.localDate)])].filter((d) => d >= today).sort(), [days, sessions, today]);
  const months = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of all) m.set(d.slice(0, 7), [...(m.get(d.slice(0, 7)) ?? []), d]);
    return [...m.entries()];
  }, [all]);

  const sessionFor = (day: string, min: number) => sessions?.find((s) => s.localDate === day && s.ages.min === min);
  const wanted = groups.length ? groups : GROUPS.map((g) => g.min);
  /** A day can be picked if at least one of the chosen age groups has room (or availability is unknown). */
  const pickable = (day: string) => !sessions?.length || wanted.some((g) => open(sessionFor(day, g)));
  const fewLeft = (day: string) => !!sessions?.length && wanted.some((g) => sessionFor(day, g)?.state.state === "limited");

  const toggle = (day: string) => setPicked((p) => (p.includes(day) ? p.filter((d) => d !== day) : [...p, day].sort()));
  const toggleMonth = (list: string[]) => {
    const can = list.filter(pickable);
    const allIn = can.every((d) => picked.includes(d));
    setPicked((p) => (allIn ? p.filter((d) => !can.includes(d)) : [...new Set([...p, ...can])].sort()));
  };

  const lines = groups.flatMap((g) => picked.map((d) => sessionFor(d, g)).filter(open)) as PublicSession[];
  const total = sessions?.length ? lines.reduce((sum, s) => sum + (s.priceCents ?? DAY_PRICE), 0) : picked.length * groups.length * DAY_PRICE;

  const book = () => {
    if (!picked.length) return;
    if (!groups.length) {
      setHint(true);
      document.getElementById("camp-who")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (lines.length) router.push(`/book?offering=camp&select=${lines.map((s) => s.id).join(",")}&until=${picked[picked.length - 1]}`);
    else router.push(`/book?offering=camp&date=${picked[0]}`);
  };

  if (!months.length) return <p className="text-ink-soft">New camp days are coming soon.</p>;

  return (
    <div className="border border-line bg-chalk">
      {/* Who's coming */}
      <div id="camp-who" className="border-b border-line p-5 sm:p-7">
        <p className="eyebrow text-[0.62rem] text-ink-soft">1 · Who’s coming?</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Age groups">
          {GROUPS.map((g) => {
            const on = groups.includes(g.min);
            return (
              <button
                key={g.min}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setHint(false);
                  setGroups((cur) => (on ? cur.filter((x) => x !== g.min) : [...cur, g.min]));
                }}
                className={`h-11 rounded-full border px-5 text-[0.9rem] transition-colors focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none ${
                  on ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        <p className={`mt-2 text-[0.8rem] ${hint ? "text-oxblood" : "text-ink-soft"}`}>{hint ? "Choose an age group to continue." : "Siblings in different groups? Choose each one."}</p>
      </div>

      {/* Days */}
      <div className="p-5 sm:p-7">
        <p className="eyebrow text-[0.62rem] text-ink-soft">2 · Choose your days</p>
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
        {sessions?.length ? (
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
          <p className="text-[0.92rem]" aria-live="polite">
            {picked.length ? (
              <>
                <span className="font-medium">
                  {picked.length} day{picked.length === 1 ? "" : "s"}
                </span>
                {groups.length ? <span className="text-ink-soft"> · {usd(total)}{groups.length === 1 ? " per child" : ""}</span> : <span className="text-ink-soft"> · choose an age group</span>}
              </>
            ) : (
              <span className="text-ink-soft">Tap the days you’d like. Book as many as you want.</span>
            )}
          </p>
          <button
            type="button"
            onClick={book}
            disabled={!picked.length}
            className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[0.9rem] text-chalk transition-colors hover:bg-blue disabled:cursor-not-allowed disabled:opacity-35"
          >
            {picked.length ? `Book ${picked.length} day${picked.length === 1 ? "" : "s"}` : "Book days"}
          </button>
        </div>
      </div>
    </div>
  );
}
