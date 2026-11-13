"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicSession } from "@/lib/ops/public-booking";

type Cat = "immersive" | "weekend" | "evening" | "more";
type Status = "available" | "few" | "waitlist" | "full" | "closed";
type Entry = { key: string; date: string; startsAt: string; cat: Cat; name: string; time: string; detail: string; price: string; status: Status; href: string };

const CATS: { key: Cat | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "immersive", label: "Immersive Play" },
  { key: "weekend", label: "Weekend Play" },
  { key: "evening", label: "After Hours" },
  { key: "more", label: "Pop-ups & more" },
];
const DOT: Record<Cat, string> = { immersive: "bg-blue", weekend: "bg-oxblood", evening: "bg-ink", more: "bg-stone" };

const todayLA = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};
const fmt = (date: string, o: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
};
const time = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(new Date(iso)).replace(" AM", "am").replace(" PM", "pm");
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
const years = (m: number) => (m < 24 ? `${m} mo` : `${Math.floor(m / 12)} yrs`);

const catOf = (s: PublicSession): Cat =>
  s.programSlug === "immersive-play" ? "immersive" : s.programSlug === "yalla-weekends" || s.kind === "weekend" ? "weekend" : s.kind === "parents_night" ? "evening" : "more";

/** Several sessions offered together (e.g. one weekend play session's age groups) read as one status. */
function statusOf(list: PublicSession[]): Status {
  const open = list.filter((s) => s.state.state === "available" || s.state.state === "limited");
  if (open.length) return open.every((s) => s.state.state === "limited") ? "few" : "available";
  if (list.some((s) => s.state.state === "full" && s.state.waitlist)) return "waitlist";
  return list.some((s) => s.state.state === "full") ? "full" : "closed";
}

const STATUS_TEXT: Record<Status, string | null> = { available: null, few: "A few spots left", waitlist: "Full · join waitlist", full: "Session full", closed: "Closed" };

function entriesFrom(sessions: PublicSession[]): Entry[] {
  const out: Entry[] = [];
  const weekend = new Map<string, PublicSession[]>();
  for (const s of sessions) {
    const cat = catOf(s);
    if (cat === "weekend" || cat === "evening") {
      const k = `${s.localDate}|${s.startsAt}`;
      weekend.set(k, [...(weekend.get(k) ?? []), s]);
      continue;
    }
    const status = statusOf([s]);
    const open = status === "available" || status === "few";
    out.push({
      key: s.id,
      date: s.localDate,
      startsAt: s.startsAt,
      cat,
      name: cat === "immersive" ? "Immersive Play Session" : s.title,
      time: `${time(s.startsAt)} – ${time(s.endsAt)}`,
      detail: cat === "immersive" ? "Ages 3 – 8 · Coworking for you +$15" : s.ages.min != null || s.ages.max != null ? `Ages ${years(s.ages.min ?? 0)} – ${years(s.ages.max ?? 131)}` : "All ages",
      price: s.priceCents == null ? "" : `${usd(s.priceCents)} per ${s.bookingUnit === "per_family" ? "family" : "child"}`,
      status,
      href: open ? `/book?offering=happening&select=${s.id}&until=${s.localDate}` : `/book?offering=happening&date=${s.localDate}`,
    });
  }
  for (const list of weekend.values()) {
    const s = list[0];
    const evening = s.kind === "parents_night";
    const am = time(s.startsAt).endsWith("am");
    out.push({
      key: list.map((x) => x.id).join(","),
      date: s.localDate,
      startsAt: s.startsAt,
      cat: evening ? "evening" : "weekend",
      name: evening ? "After Hours · Evening out" : `Weekend Play · ${am ? "Morning" : "Afternoon"}`,
      time: `${time(s.startsAt)} – ${time(s.endsAt)}`,
      detail: evening ? "Ages 18 mo – 10 yrs, in separate age groups · Sibling rate" : "Ages 18 mo – 10 yrs, in separate age groups",
      price: s.priceCents == null ? "" : `${usd(s.priceCents)} per child`,
      status: statusOf(list),
      // The booking calendar shows the day's age groups and matches each child to theirs.
      href: `/book?offering=happening&date=${s.localDate}`,
    });
  }
  // Anything not open for booking (too soon, paused, cancelled) is left off the list.
  return out.filter((e) => e.status !== "closed").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Every upcoming Happening in one list: Immersive Play, weekend play, After Hours, pop-ups and more.
 * Families filter by kind, then book a session (or join its waitlist) in the booking calendar.
 */
export function HappeningsCalendar() {
  const [today] = useState(todayLA);
  const [days, setDays] = useState(90);
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [filter, setFilter] = useState<Cat | "all">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = addDays(today, days - 1);
      const found: PublicSession[] = [];
      try {
        for (let from = today; from <= last; from = addDays(from, 120)) {
          const to = addDays(from, 119) < last ? addDays(from, 119) : last;
          const res = await fetch(`/api/availability?from=${from}&to=${to}&kind=happening,parents_night`, { cache: "no-store" });
          const json = (await res.json()) as { sessions?: PublicSession[] };
          found.push(...(json.sessions ?? []));
        }
        if (!cancelled) setSessions(found);
      } catch {
        if (!cancelled) setSessions((s) => s ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today, days]);

  const entries = useMemo(() => entriesFrom((sessions ?? []).filter((s) => s.localDate >= today)), [sessions, today]);
  const present = new Set(entries.map((e) => e.cat));
  const shown = entries.filter((e) => filter === "all" || e.cat === filter);
  const byDate = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of shown) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [shown]);

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {CATS.filter((c) => c.key === "all" || present.has(c.key)).map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={filter === c.key}
            onClick={() => setFilter(c.key)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[0.85rem] transition-colors ${filter === c.key ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"}`}
          >
            {c.key !== "all" ? <span className={`h-2 w-2 rounded-full ${DOT[c.key]}`} aria-hidden /> : null}
            {c.label}
          </button>
        ))}
      </div>

      {!sessions ? (
        <div className="mt-8 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-sand/50" />
          ))}
        </div>
      ) : !byDate.length ? (
        <p className="mt-8 border border-line bg-chalk p-7 text-ink-soft">New Happenings are coming soon. Check back shortly.</p>
      ) : (
        <ol className="mt-8 divide-y divide-line border-y border-line">
          {byDate.map(([date, list], i) => {
            const newMonth = i === 0 || byDate[i - 1][0].slice(0, 7) !== date.slice(0, 7);
            return (
              <li key={date}>
                {newMonth ? (
                  <p className="pt-8 pb-2 font-serif text-[1.3rem]">
                    {fmt(date, { month: "long" })} <span className="text-[0.85rem] text-ink-soft italic">{date.slice(0, 4)}</span>
                  </p>
                ) : null}
                <div className="grid grid-cols-[4rem_1fr] gap-4 py-5 sm:grid-cols-[5.5rem_1fr]">
                  <div className="text-center">
                    <p className="text-[0.62rem] tracking-[0.12em] text-ink-soft uppercase">{fmt(date, { weekday: "short" })}</p>
                    <p className="font-serif text-[2rem] leading-none">{fmt(date, { day: "numeric" })}</p>
                  </div>
                  <ul className="space-y-4">
                    {list.map((e) => {
                      const st = STATUS_TEXT[e.status];
                      return (
                        <li key={e.key} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-[1.02rem]">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[e.cat]}`} aria-hidden />
                              {e.name}
                            </p>
                            <p className="mt-0.5 text-[0.82rem] text-ink-soft">
                              {e.time} · {e.detail}
                              {e.price ? ` · ${e.price}` : ""}
                            </p>
                            {st ? <p className={`mt-0.5 text-[0.78rem] ${e.status === "few" ? "text-oxblood" : "text-ink-soft"}`}>{st}</p> : null}
                          </div>
                          {e.status === "available" || e.status === "few" || e.status === "waitlist" ? (
                            <a
                              href={e.href}
                              className={`inline-flex h-10 items-center rounded-full px-5 text-[0.85rem] transition-colors ${e.status === "waitlist" ? "border border-ink/25 hover:border-ink" : "bg-ink text-chalk hover:bg-blue"}`}
                            >
                              {e.status === "waitlist" ? "Join waitlist" : "Book"}
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {sessions ? (
        <button type="button" onClick={() => setDays((d) => d + 90)} className="mt-6 text-[0.9rem] text-blue underline-offset-4 hover:underline">
          Show later dates
        </button>
      ) : null}
    </div>
  );
}
