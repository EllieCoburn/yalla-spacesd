"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HAPPENING_TYPES, type HappeningType } from "@/content/happenings";
import type { PublicSession } from "@/lib/ops/public-booking";

type Status = "available" | "few" | "waitlist" | "full";
type Happening = {
  key: string;
  type: HappeningType;
  name: string;
  date: string;
  startsAt: string;
  time: string;
  start: string;
  ages: string;
  price: string;
  status: Status;
  /** Every session behind this Happening (one per age group where there are several). */
  ids: string[];
  /** Short name for a calendar square. */
  label: string;
};

const TYPE = Object.fromEntries(HAPPENING_TYPES.map((t) => [t.key, t])) as Record<HappeningType, (typeof HAPPENING_TYPES)[number]>;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const todayLA = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};
const fmt = (date: string, o: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
};
const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(new Date(iso)).replace(" AM", "am").replace(" PM", "pm");
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
const years = (m: number) => (m < 24 ? `${m} months` : `${Math.floor(m / 12)} years`);
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const typeOf = (s: PublicSession): HappeningType =>
  s.programSlug === "immersive-play" ? "immersive" : s.programSlug === "yalla-weekends" || s.kind === "weekend" ? "weekend" : s.kind === "parents_night" ? "evening" : "more";

/** A Happening offered in several age groups reads as one: open if any group has room. */
function statusOf(list: PublicSession[]): Status | null {
  const open = list.filter((s) => s.state.state === "available" || s.state.state === "limited");
  if (open.length) return open.every((s) => s.state.state === "limited") ? "few" : "available";
  if (list.some((s) => s.state.state === "full" && s.state.waitlist)) return "waitlist";
  return list.some((s) => s.state.state === "full") ? "full" : null;
}

function happeningsFrom(sessions: PublicSession[]): Happening[] {
  const groups = new Map<string, PublicSession[]>();
  for (const s of sessions) {
    const k = `${s.programId}|${s.startsAt}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out: Happening[] = [];
  for (const [key, list] of groups) {
    const s = list[0];
    const status = statusOf(list);
    if (!status) continue; // Not open for booking (too soon, paused or cancelled).
    const type = typeOf(s);
    const min = Math.min(...list.map((x) => x.ages.min ?? 0));
    const max = Math.max(...list.map((x) => x.ages.max ?? 131));
    const am = clock(s.startsAt).endsWith("am");
    out.push({
      key,
      type,
      name: type === "weekend" ? `Weekend Play · ${am ? "Morning" : "Afternoon"}` : type === "more" ? s.title : TYPE[type].short,
      date: s.localDate,
      startsAt: s.startsAt,
      time: `${clock(s.startsAt)} – ${clock(s.endsAt)}`,
      start: clock(s.startsAt).replace(":00", ""),
      ages: type === "immersive" ? "3 – 8 years" : `${years(min)} – ${years(max)}${list.length > 1 ? ", in separate age groups" : ""}`,
      price: s.priceCents == null ? "Price on request" : `${usd(s.priceCents)} per ${s.bookingUnit === "per_family" ? "family" : "child"}`,
      status,
      ids: list.map((x) => x.id),
      label: type === "more" ? s.title : TYPE[type].short,
    });
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

const STATUS: Record<Status, string | null> = { available: null, few: "A few spots left", waitlist: "Full · join waitlist", full: "Session full" };

/**
 * Yalla Happenings in one calendar. Every kind of Happening has its own color and is chosen the
 * same way: tap it, see the details, add it to your booking. Checkout then matches each child to
 * the right session (and age group), with any extras and the sibling rate.
 */
export function HappeningsCalendar() {
  const router = useRouter();
  const [today] = useState(todayLA);
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [filter, setFilter] = useState<HappeningType | "all">("all");
  const [focus, setFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = addDays(today, 364);
      const found: PublicSession[] = [];
      try {
        // The availability endpoint returns up to 120 days at a time.
        for (let from = today; from <= last; from = addDays(from, 120)) {
          const to = addDays(from, 119) < last ? addDays(from, 119) : last;
          const res = await fetch(`/api/availability?from=${from}&to=${to}&kind=happening,parents_night`, { cache: "no-store" });
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
  }, [today]);

  // "See dates" links elsewhere on the page (#dates-immersive etc.) filter the calendar.
  useEffect(() => {
    const apply = () => {
      const m = window.location.hash.match(/^#dates-(\w+)$/);
      if (m && TYPE[m[1] as HappeningType]) {
        setFilter(m[1] as HappeningType);
        document.getElementById("calendar")?.scrollIntoView({ behavior: "smooth" });
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const all = useMemo(() => happeningsFrom((sessions ?? []).filter((s) => s.localDate >= today)), [sessions, today]);
  const byKey = useMemo(() => new Map(all.map((h) => [h.key, h])), [all]);
  const shown = all.filter((h) => filter === "all" || h.type === filter);
  const present = new Set(all.map((h) => h.type));
  const lastMonth = all.length ? all[all.length - 1].date.slice(0, 7) : month;
  const onDay = (d: string) => shown.filter((h) => h.date === d);

  // Weeks of the month, Sunday first.
  const first = `${month}-01`;
  const lead = new Date(`${first}T12:00:00Z`).getUTCDay();
  const cells = Array.from({ length: Math.ceil((lead + new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate()) / 7) * 7 }, (_, i) =>
    addDays(first, i - lead),
  );
  const monthDays = cells.filter((d) => d.startsWith(month) && onDay(d).length);

  const focused = focus ? byKey.get(focus) : undefined;
  const chosen = picked.map((k) => byKey.get(k)).filter((h): h is Happening => !!h);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const book = () => {
    if (!chosen.length) return;
    const ids = chosen.flatMap((h) => h.ids);
    const until = chosen.map((h) => h.date).reduce((a, b) => (a > b ? a : b));
    router.push(`/book?offering=happening&select=${ids.join(",")}&until=${until}`);
  };

  const entry = (h: Happening, roomy = false) => {
    const t = TYPE[h.type];
    const on = picked.includes(h.key);
    const closed = h.status === "full" || h.status === "waitlist";
    return (
      <button
        type="button"
        onClick={() => setFocus(h.key)}
        aria-pressed={on}
        aria-label={`${h.name}, ${fmt(h.date, { weekday: "long", month: "long", day: "numeric" })}, ${h.time}${STATUS[h.status] ? `, ${STATUS[h.status]!.toLowerCase()}` : ""}${on ? ", in your booking" : ""}`}
        className={`flex w-full gap-1.5 rounded-md border text-left transition-colors ${roomy ? "items-center px-3 py-2.5 text-[0.9rem]" : "items-start px-1.5 py-1 text-[0.7rem] leading-tight"} ${
          on ? t.solid : closed ? "border-dashed border-ink/20 text-ink/45" : `${t.tint} text-ink`
        } ${focus === h.key ? "ring-2 ring-ink/60 ring-offset-1 ring-offset-chalk" : ""}`}
      >
        {!on ? (
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot} ${roomy ? "" : "mt-[0.3rem]"}`} aria-hidden />
        ) : (
          <span aria-hidden className={roomy ? "" : "text-[0.62rem]"}>
            ✓
          </span>
        )}
        {roomy ? (
          <span className="min-w-0 flex-1">
            <span className="tabular-nums">{h.time}</span> · {h.name}
          </span>
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block text-[0.62rem] tabular-nums opacity-75">{h.start}</span>
            <span className="line-clamp-2 block">{h.label}</span>
          </span>
        )}
        {h.status === "few" && !on ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-oxblood" aria-hidden /> : null}
      </button>
    );
  };

  const detail = (h: Happening) => {
    const t = TYPE[h.type];
    const on = picked.includes(h.key);
    return (
      <div>
        <p className="flex items-center gap-2 text-[0.72rem] tracking-[0.12em] text-ink-soft uppercase">
          <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden /> {t.name}
        </p>
        <p className="display mt-2 text-[1.5rem] leading-tight">{h.name}</p>
        <dl className="mt-3 space-y-1 text-[0.88rem]">
          <div className="flex gap-2">
            <dt className="w-12 shrink-0 text-ink-soft">When</dt>
            <dd>
              {fmt(h.date, { weekday: "long", month: "long", day: "numeric" })}, {h.time}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-12 shrink-0 text-ink-soft">Ages</dt>
            <dd>{h.ages}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-12 shrink-0 text-ink-soft">Price</dt>
            <dd>{h.price}</dd>
          </div>
        </dl>
        {t.notes.length && h.type !== "more" ? <p className="mt-3 text-[0.8rem] text-ink-soft">{t.notes[0]}</p> : null}
        {STATUS[h.status] ? <p className={`mt-3 text-[0.82rem] ${h.status === "few" ? "text-oxblood" : "text-ink-soft"}`}>{STATUS[h.status]}</p> : null}
        <div className="mt-4">
          {h.status === "available" || h.status === "few" ? (
            <button
              type="button"
              onClick={() => toggle(h.key)}
              className={`inline-flex h-11 w-full items-center justify-center rounded-full text-[0.88rem] transition-colors ${on ? "border border-ink/25 hover:border-ink" : "bg-ink text-chalk hover:bg-blue"}`}
            >
              {on ? "Remove from my booking" : "Add to my booking"}
            </button>
          ) : h.status === "waitlist" ? (
            <a href={`/book?offering=happening&date=${h.date}`} className="inline-flex h-11 w-full items-center justify-center rounded-full border border-ink/25 text-[0.88rem] hover:border-ink">
              Join the waitlist
            </a>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Filter by kind; the colors double as the key. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="-mx-5 flex w-[calc(100%+2.5rem)] gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Show">
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
            className={`rounded-full border px-4 py-2 text-[0.85rem] transition-colors ${filter === "all" ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"}`}
          >
            Everything
          </button>
          {HAPPENING_TYPES.filter((t) => present.has(t.key)).map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={filter === t.key}
              onClick={() => setFilter(filter === t.key ? "all" : t.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[0.85rem] transition-colors ${filter === t.key ? t.solid : "border-ink/20 hover:border-ink"}`}
            >
              <span className={`h-2 w-2 rounded-full ${filter === t.key ? "bg-current" : t.dot}`} aria-hidden />
              {t.short}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            disabled={month <= today.slice(0, 7)}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/20 hover:border-ink disabled:opacity-30"
          >
            ‹
          </button>
          <p className="w-40 text-center font-serif text-[1.3rem]" aria-live="polite">
            {fmt(first, { month: "long" })} <span className="text-[0.9rem] text-ink-soft italic">{month.slice(0, 4)}</span>
          </p>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= lastMonth}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/20 hover:border-ink disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_19rem]">
        <div>
          {!sessions ? (
            <div className="h-[30rem] animate-pulse rounded-xl bg-sand/50" aria-busy="true" />
          ) : (
            <>
              {/* Month grid (tablet and up) */}
              <div className="hidden overflow-hidden rounded-xl border border-line bg-chalk sm:block">
                <div className="grid grid-cols-7 border-b border-line bg-paper">
                  {WEEKDAYS.map((w) => (
                    <p key={w} className="py-2 text-center text-[0.65rem] tracking-[0.12em] text-ink-soft uppercase">
                      {w}
                    </p>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {cells.map((d, i) => {
                    const inMonth = d.startsWith(month);
                    const past = d < today;
                    return (
                      <div
                        key={d}
                        className={`min-h-[6.5rem] border-line p-1.5 ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${inMonth && !past ? "" : "bg-paper/60"}`}
                      >
                        <p className={`mb-1 px-0.5 text-[0.78rem] ${d === today ? "font-medium text-blue" : inMonth && !past ? "" : "text-ink/30"}`}>{Number(d.slice(8))}</p>
                        {inMonth ? (
                          <div className="space-y-1">
                            {onDay(d).map((h) => (
                              <div key={h.key}>{entry(h)}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Day list (phones) */}
              <div className="sm:hidden">
                {monthDays.length ? (
                  <ol className="divide-y divide-line border-y border-line">
                    {monthDays.map((d) => (
                      <li key={d} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 py-4">
                        <div className="text-center">
                          <p className="text-[0.6rem] tracking-[0.12em] text-ink-soft uppercase">{fmt(d, { weekday: "short" })}</p>
                          <p className="font-serif text-[1.6rem] leading-none">{fmt(d, { day: "numeric" })}</p>
                        </div>
                        <div className="space-y-2">
                          {onDay(d).map((h) => (
                            <div key={h.key}>
                              {entry(h, true)}
                              {focus === h.key ? (
                                <div className="mt-2 rounded-xl border border-line bg-paper p-4">
                                  {detail(h)}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>

              {!shown.some((h) => h.date.startsWith(month)) ? (
                <p className="mt-4 text-[0.9rem] text-ink-soft">
                  {all.length ? "Nothing on this month" + (filter !== "all" ? ` for ${TYPE[filter].short}` : "") + ". Try the next month." : "New Happenings are coming soon. Check back shortly."}
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* Details and your booking */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="hidden rounded-xl border border-line bg-paper p-5 sm:block">
            {focused ? detail(focused) : <p className="text-[0.9rem] text-ink-soft">Tap any Happening on the calendar to see its details and add it to your booking.</p>}
          </div>
          <div className="rounded-xl border border-line bg-chalk p-5">
            <p className="eyebrow text-[0.62rem] text-ink-soft">Your booking</p>
            {chosen.length ? (
              <ul className="mt-3 space-y-2">
                {chosen.map((h) => (
                  <li key={h.key} className="flex items-start gap-2.5 text-[0.88rem]">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE[h.type].dot}`} aria-hidden />
                    <span className="flex-1">
                      {h.name}
                      <span className="block text-[0.78rem] text-ink-soft">
                        {fmt(h.date, { weekday: "short", month: "short", day: "numeric" })} · {h.time}
                      </span>
                    </span>
                    <button type="button" onClick={() => toggle(h.key)} aria-label={`Remove ${h.name}`} className="text-ink-soft hover:text-ink">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[0.85rem] text-ink-soft">Nothing yet. Add as many Happenings as you like, of any kind.</p>
            )}
            <button
              type="button"
              onClick={book}
              disabled={!chosen.length}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-ink text-[0.88rem] text-chalk transition-colors hover:bg-blue disabled:cursor-not-allowed disabled:opacity-35"
            >
              {chosen.length ? `Continue with ${chosen.length} ${chosen.length === 1 ? "Happening" : "Happenings"}` : "Continue"}
            </button>
            <p className="mt-2 text-[0.75rem] text-ink-soft">Next, choose your children. Each joins the right age group automatically.</p>
          </div>
        </aside>
      </div>

      {/* Phones: keep the next step in reach once something is chosen. */}
      {chosen.length ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-chalk/95 px-5 py-3 backdrop-blur sm:hidden">
          <button type="button" onClick={book} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-ink text-[0.9rem] text-chalk">
            Continue with {chosen.length} {chosen.length === 1 ? "Happening" : "Happenings"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
