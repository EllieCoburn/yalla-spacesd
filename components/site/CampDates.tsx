"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PublicSession } from "@/lib/ops/public-booking";

type DayStatus = { text: string; tone: "ok" | "low" | "full" | "none" };

const fmt = (date: string, o: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
};
const todayLA = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};

/** One line per camp day, summarising its three age groups. */
function statusOf(groups: PublicSession[]): DayStatus {
  if (!groups.length) return { text: "Book this day", tone: "none" };
  const open = groups.filter((g) => g.state.state === "available" || g.state.state === "limited");
  if (!open.length) return { text: "Full · join the waitlist", tone: "full" };
  if (open.length < groups.length) return { text: "Some ages full", tone: "low" };
  if (open.some((g) => g.state.state === "limited")) return { text: "A few spots left", tone: "low" };
  return { text: "Spaces available", tone: "ok" };
}

/**
 * Camp days as big, tappable dates. The list of days is part of the page; live availability is
 * fetched in the browser so it is always current. Each date opens the booking calendar on that day.
 */
export function CampDates({ days }: { days: string[] }) {
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [today] = useState(todayLA);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = days.reduce((m, d) => (d > m ? d : m), today);
      const found: PublicSession[] = [];
      try {
        // The availability endpoint returns up to 120 days at a time.
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

  const months = useMemo(() => {
    const all = [...new Set([...days, ...(sessions ?? []).map((s) => s.localDate)])].filter((d) => d >= today).sort();
    const byMonth = new Map<string, string[]>();
    for (const d of all) byMonth.set(d.slice(0, 7), [...(byMonth.get(d.slice(0, 7)) ?? []), d]);
    return [...byMonth.entries()];
  }, [days, sessions, today]);

  if (!months.length) return <p className="text-ink-soft">New camp days are coming soon.</p>;

  return (
    <div className="space-y-14">
      {months.map(([month, list]) => (
        <section key={month} aria-labelledby={`m-${month}`}>
          <h3 id={`m-${month}`} className="flex items-baseline gap-3 border-b border-line pb-3">
            <span className="display text-[1.9rem]">{fmt(`${month}-01`, { month: "long" })}</span>
            <span className="font-serif text-ink-soft italic">{month.slice(0, 4)}</span>
          </h3>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {list.map((d) => {
              const st = sessions ? statusOf(sessions.filter((s) => s.localDate === d)) : null;
              return (
                <li key={d}>
                  <Link
                    href={`/book?offering=camp&date=${d}`}
                    className={`group flex h-full flex-col rounded-t-[999px] border px-4 pt-9 pb-5 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-ink focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none ${
                      st?.tone === "full" ? "border-line bg-transparent" : "border-line bg-paper hover:bg-mist/60"
                    }`}
                    aria-label={`Book Camp Yalla on ${fmt(d, { weekday: "long", month: "long", day: "numeric" })}${st ? `. ${st.text}` : ""}`}
                  >
                    <span className="eyebrow text-[0.62rem] text-ink-soft">{fmt(d, { weekday: "long" })}</span>
                    <span className="display mt-2 text-[3.2rem] leading-none">{fmt(d, { day: "numeric" })}</span>
                    <span className="mt-1 font-serif text-ink-soft italic">{fmt(d, { month: "short" })}</span>
                    <span
                      className={`mt-4 min-h-[1.2rem] text-[0.78rem] ${st?.tone === "low" ? "text-oxblood" : st?.tone === "full" ? "text-ink-soft" : "text-blue"}`}
                    >
                      {st ? st.text : <span className="inline-block h-2 w-20 animate-pulse rounded-full bg-ink/10 align-middle" />}
                    </span>
                    <span className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-[0.85rem] text-chalk transition-colors group-hover:bg-blue">
                      {st?.tone === "full" ? "Waitlist" : "Book"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
