"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { loadDay, loadMonth } from "@/app/admin/(app)/calendar/actions";
import type { CalendarChild, CalendarDaySession, CalendarProgram, CalendarSession } from "@/lib/admin/queries/calendar";
import { monthGrid } from "@/lib/admin/calendar-grid";
import { eachDate, fmtDate, fmtTime } from "@/lib/time";

/**
 * The enrollment calendar. Months and days load in the background and are kept, so moving between
 * months (arrows, ← → keys, or Today) is instant; neighbouring months are fetched ahead of time.
 */

type Program = { key: CalendarProgram; label: string };
type Props = {
  programs: readonly Program[];
  today: string;
  initial: { month: string; program: CalendarProgram; date: string | null; sessions: CalendarSession[]; day: CalendarDaySession[] };
};

const STALE_MS = 60_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_DOT: Record<string, string> = { camp: "bg-blue", drop_in: "bg-[#2c6447]", happening: "bg-[#c08a3e]", parents_night: "bg-[#673e46]", nature: "bg-[#2c6447]" };

/** "18 months – 3 years" → "18m–3y". */
const shortGroup = (g: string) => g.replace(/\s*–\s*/g, "–").replace(/ months?/g, "m").replace(/ years?/g, "y").replace(/\s+/g, " ");

type Tone = "open" | "low" | "full" | "none";
const toneOf = (remaining: number, cap: number): Tone => (cap <= 0 ? "none" : remaining <= 0 ? "full" : remaining <= Math.max(2, Math.ceil(cap * 0.2)) ? "low" : "open");
const TONE_TEXT: Record<Tone, string> = { open: "text-[#2c6447]", low: "text-[#8a5212]", full: "text-[#8a2333]", none: "text-ink-soft" };
const TONE_BG: Record<Tone, string> = { open: "bg-[#e6f0ea] text-[#2c6447]", low: "bg-[#f8eedd] text-[#8a5212]", full: "bg-[#f6e3e5] text-[#8a2333]", none: "bg-ink/5 text-ink-soft" };
const TONE_BAR: Record<Tone, string> = { open: "bg-blue", low: "bg-[#c08a3e]", full: "bg-[#8a2333]", none: "bg-ink/20" };
const leftLabel = (remaining: number, cap: number) => (cap <= 0 ? "" : remaining <= 0 ? "Full" : `${remaining} left`);

/** "Weekend Play Sessions" → "Weekend", "Camp Yalla" → "Camp": short enough for a day square. */
const shortProgram = (name: string) =>
  name.replace(/\bYalla\b/g, "").replace(/\b(Play )?Sessions?\b/g, "").replace(/\bEvenings?\b/g, "").replace(/\s+/g, " ").trim() || name;

const KIND_ORDER: Record<string, number> = { camp: 0, drop_in: 1, happening: 2, parents_night: 3, nature: 4 };
const bySchedule = (a: CalendarSession, b: CalendarSession) =>
  (KIND_ORDER[a.programKind] ?? 9) - (KIND_ORDER[b.programKind] ?? 9) || a.programName.localeCompare(b.programName) || +new Date(a.startsAt) - +new Date(b.startsAt);

/** A program's sessions that start together (e.g. Weekend Play's 9am groups) form one time slot. */
const slotKey = (s: CalendarSession) => `${s.programName}|${+new Date(s.startsAt)}`;
/** "9:00am" → "9am", "1:30pm" → "1:30pm". */
const shortTime = (d: Date) => fmtTime(d).replace(":00", "");

type Slot<T extends CalendarSession = CalendarSession> = { key: string; label: string; sessions: T[]; total: CalendarSession };

/**
 * A day's sessions as time slots, in a steady order (Camp, Flex, Happenings, then the rest). Each slot
 * adds up only the age groups that run at the same time, never a morning and an afternoon together.
 */
function slotsOf<T extends CalendarSession>(list: T[], { withProgram, compact = false }: { withProgram: boolean; compact?: boolean }): Slot<T>[] {
  const sorted = [...list].sort(bySchedule);
  const keys = [...new Set(sorted.map(slotKey))];
  const perProgram = new Map<string, number>();
  for (const k of keys) perProgram.set(k.split("|")[0], (perProgram.get(k.split("|")[0]) ?? 0) + 1);
  return keys.map((key) => {
    const g = sorted.filter((s) => slotKey(s) === key);
    const sum = (k: "booked" | "held" | "used" | "effectiveCapacity" | "remaining" | "waiting" | "capacity") => g.reduce((n, s) => n + s[k], 0);
    const name = g[0].programName;
    const timed = (perProgram.get(name) ?? 0) > 1;
    const start = new Date(g[0].startsAt);
    // In a day square, "Weekend AM" fits where "Weekend · 9am" wouldn't (when that's enough to tell them apart).
    const halves = keys.filter((k) => k.startsWith(`${name}|`)).map((k) => Number(fmtTime(new Date(Number(k.split("|")[1]))).match(/[ap]m$/)?.[0] === "pm"));
    const ampm = compact && new Set(halves).size === halves.length ? (fmtTime(start).endsWith("pm") ? " PM" : " AM") : null;
    const when = ampm ?? ` · ${shortTime(start)}`;
    const label = withProgram ? `${shortProgram(name)}${timed ? when : ""}` : shortTime(start);
    const total: CalendarSession = { ...g[0], id: key, group: label, booked: sum("booked"), held: sum("held"), used: sum("used"), effectiveCapacity: sum("effectiveCapacity"), remaining: sum("remaining"), waiting: sum("waiting"), capacity: sum("capacity") };
    return { key, label, sessions: g, total };
  });
}

function Meter({ s, className = "" }: { s: Pick<CalendarSession, "used" | "held" | "effectiveCapacity" | "remaining">; className?: string }) {
  const cap = Math.max(s.effectiveCapacity, 1);
  const tone = toneOf(s.remaining, s.effectiveCapacity);
  const firm = Math.min(100, ((s.used - s.held) / cap) * 100);
  const held = Math.min(100 - firm, (s.held / cap) * 100);
  return (
    <span className={`flex h-1.5 overflow-hidden rounded-full bg-ink/[0.07] ${className}`} aria-hidden>
      <span className={`h-full transition-[width] duration-500 ease-[var(--ease-soft)] ${TONE_BAR[tone]}`} style={{ width: `${firm}%` }} />
      {held > 0 ? <span className="h-full bg-[repeating-linear-gradient(135deg,#c08a3e_0_3px,#e9cf9f_3px_6px)]" style={{ width: `${held}%` }} /> : null}
    </span>
  );
}

const avatarTones = ["bg-[#e7e5f1] text-blue", "bg-[#e6f0ea] text-[#2c6447]", "bg-[#f8eedd] text-[#8a5212]", "bg-[#f3e4e8] text-[#673e46]", "bg-[#e3eef4] text-[#2d5d7b]"];
const avatarTone = (id: string) => avatarTones[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % avatarTones.length];
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const ATTEND: Record<string, { label: string; cls: string } | undefined> = {
  checked_in: { label: "Here", cls: "bg-[#e6f0ea] text-[#2c6447]" },
  checked_out: { label: "Picked up", cls: "bg-ink/5 text-ink-soft" },
  absent: { label: "Absent", cls: "bg-[#f6e3e5] text-[#8a2333]" },
};

export function EnrollmentCalendar({ programs, today, initial }: Props) {
  const [month, setMonth] = useState(initial.month);
  const [program, setProgram] = useState<CalendarProgram>(initial.program);
  const [date, setDate] = useState<string | null>(initial.date);
  const [dir, setDir] = useState(0);
  const months = useRef(new Map<string, { at: number; data: CalendarSession[] }>([[`${initial.program}|${initial.month}`, { at: Date.now(), data: initial.sessions }]]));
  const days = useRef(new Map<string, { at: number; data: CalendarDaySession[] }>(initial.date ? [[`${initial.program}|${initial.date}`, { at: Date.now(), data: initial.day }]] : []));
  const inflight = useRef(new Map<string, Promise<unknown>>());
  const [, force] = useState(0);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchMonth = useCallback((p: CalendarProgram, m: string, { background = false } = {}) => {
    const key = `${p}|${m}`;
    const hit = months.current.get(key);
    if (hit && Date.now() - hit.at < STALE_MS) return Promise.resolve(hit.data);
    if (!inflight.current.has(`m:${key}`)) {
      const job = loadMonth(m, p)
        .then((data) => {
          months.current.set(key, { at: Date.now(), data });
          force((n) => n + 1);
          return data;
        })
        .finally(() => inflight.current.delete(`m:${key}`));
      inflight.current.set(`m:${key}`, job);
    }
    return hit && background ? Promise.resolve(hit.data) : (inflight.current.get(`m:${key}`) as Promise<CalendarSession[]>);
  }, []);

  const fetchDay = useCallback((p: CalendarProgram, d: string) => {
    const key = `${p}|${d}`;
    const hit = days.current.get(key);
    if (hit && Date.now() - hit.at < STALE_MS) return Promise.resolve(hit.data);
    if (!inflight.current.has(`d:${key}`)) {
      const job = loadDay(d, p)
        .then((data) => {
          days.current.set(key, { at: Date.now(), data });
          force((n) => n + 1);
          return data;
        })
        .finally(() => inflight.current.delete(`d:${key}`));
      inflight.current.set(`d:${key}`, job);
    }
    return inflight.current.get(`d:${key}`) as Promise<CalendarDaySession[]>;
  }, []);

  const grid = useMemo(() => monthGrid(month), [month]);
  const monthEntry = months.current.get(`${program}|${month}`);
  const sessions = monthEntry?.data;
  const dayEntry = date ? days.current.get(`${program}|${date}`) : undefined;

  // Load what's showing (refreshing it quietly when it's a minute old), then the months either side.
  useEffect(() => {
    startTransition(async () => {
      await fetchMonth(program, month, { background: true });
    });
    const t = setTimeout(() => {
      void fetchMonth(program, grid.next).catch(() => {});
      void fetchMonth(program, grid.prev).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [program, month, grid.next, grid.prev, fetchMonth]);

  useEffect(() => {
    if (date) void fetchDay(program, date).catch(() => {});
  }, [program, date, fetchDay]);

  // Keep the address bar in step without reloading, so the view can be shared or bookmarked.
  useEffect(() => {
    const p = new URLSearchParams({ month, program, ...(date ? { date } : {}) });
    window.history.replaceState(null, "", `/admin/calendar?${p}`);
  }, [month, program, date]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarSession[]>();
    for (const s of sessions ?? []) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [sessions]);

  // When the month or program changes, pick a sensible day: the one chosen if it's in view, today, or the next day with sessions.
  const pickDay = useCallback(
    (list: CalendarSession[], m: string) => {
      const g = monthGrid(m);
      const inMonth = list.filter((s) => s.date >= g.first && s.date <= g.last);
      if (today.startsWith(m) && list.some((s) => s.date === today)) return today;
      return (inMonth.find((s) => s.date >= today) ?? inMonth[0])?.date ?? null;
    },
    [today],
  );

  const goMonth = useCallback(
    (m: string, d?: number) => {
      setDir(d ?? (m > month ? 1 : -1));
      setMonth(m);
      const cached = months.current.get(`${program}|${m}`)?.data;
      if (cached) setDate(m === today.slice(0, 7) ? today : pickDay(cached, m));
      else
        fetchMonth(program, m)
          .then((list) => setDate((cur) => (cur && cur.startsWith(m) ? cur : pickDay(list, m))))
          .catch(() => {});
    },
    [month, program, today, pickDay, fetchMonth],
  );

  const goProgram = useCallback(
    (p: CalendarProgram) => {
      setDir(0);
      setProgram(p);
      fetchMonth(p, month)
        .then((list) => setDate((cur) => (cur && list.some((s) => s.date === cur) ? cur : pickDay(list, month))))
        .catch(() => {});
    },
    [month, pickDay, fetchMonth],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") goMonth(grid.prev, -1);
      else if (e.key === "ArrowRight") goMonth(grid.next, 1);
      else if (e.key.toLowerCase() === "t") {
        goMonth(today.slice(0, 7));
        setDate(today);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goMonth, grid.prev, grid.next, today]);

  const inMonth = (sessions ?? []).filter((s) => s.date >= grid.first && s.date <= grid.last);
  const totals = {
    children: inMonth.reduce((n, s) => n + s.booked, 0),
    open: inMonth.reduce((n, s) => n + s.remaining, 0),
    days: new Set(inMonth.map((s) => s.date)).size,
    full: inMonth.filter((s) => s.effectiveCapacity > 0 && s.remaining <= 0).length,
    paying: inMonth.reduce((n, s) => n + s.held, 0),
    waiting: inMonth.reduce((n, s) => n + s.waiting, 0),
  };
  const dates = eachDate(grid.start, grid.end);
  const loadingMonth = !sessions;
  // Weeks with nothing on fold down, so the busy weeks get the room.
  const busyWeek = new Set(dates.map((d, i) => ((byDate.get(d)?.length ?? 0) > 0 ? Math.floor(i / 7) : -1)));

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-ink-soft uppercase">Enrollment calendar</p>
          <h1 key={month} className="display mt-1 animate-[fade_0.35s_var(--ease-soft)] text-[clamp(1.9rem,1.4rem+1.6vw,2.6rem)] leading-none text-ink">
            {fmtDate(grid.first, "MMMM")} <span className="text-ink-soft">{fmtDate(grid.first, "yyyy")}</span>
          </h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="no-scrollbar flex max-w-full overflow-x-auto rounded-full bg-ink/[0.06] p-1" role="tablist" aria-label="Program">
            {programs.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={program === p.key}
                onClick={() => goProgram(p.key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.8rem] whitespace-nowrap transition-all duration-300 ${program === p.key ? "bg-white text-ink shadow-[0_1px_3px_rgba(41,44,69,0.14)]" : "text-ink-soft hover:text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-full bg-white p-1 shadow-[0_0_0_1px_rgba(41,44,69,0.1)]">
            <button type="button" onClick={() => goMonth(grid.prev, -1)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink" aria-label="Previous month" title="Previous month (←)">
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              onClick={() => {
                goMonth(today.slice(0, 7));
                setDate(today);
              }}
              className="h-8 rounded-full px-3 text-[0.8rem] text-ink transition-colors hover:bg-ink/5"
              title="Today (T)"
            >
              Today
            </button>
            <button type="button" onClick={() => goMonth(grid.next, 1)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink" aria-label="Next month" title="Next month (→)">
              <Chevron dir="right" />
            </button>
          </div>
        </div>
      </div>

      {/* The month in numbers */}
      <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-ink/[0.08] shadow-[0_0_0_1px_rgba(41,44,69,0.08)] sm:grid-cols-4">
        {[
          { label: "Children booked", value: totals.children, sub: totals.days ? `across ${totals.days} day${totals.days === 1 ? "" : "s"}` : "nothing scheduled" },
          { label: "Spots open", value: totals.open, sub: totals.full ? `${totals.full} group${totals.full === 1 ? "" : "s"} full` : "no groups full", tone: totals.open ? "text-[#2c6447]" : "" },
          { label: "Paying now", value: totals.paying, sub: "spots held at checkout" },
          { label: "Waitlist", value: totals.waiting, sub: totals.waiting ? "waiting for a spot" : "no one waiting" },
        ].map((x) => (
          <div key={x.label} className="bg-white px-5 py-4">
            <dt className="text-[0.7rem] tracking-[0.08em] text-ink-soft uppercase">{x.label}</dt>
            <dd className={`mt-1 text-[1.65rem] leading-tight font-semibold tabular-nums ${x.tone ?? "text-ink"} ${loadingMonth ? "opacity-30" : ""}`}>{loadingMonth ? "–" : x.value}</dd>
            <dd className="text-[0.75rem] text-ink-soft">{loadingMonth ? " " : x.sub}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        {/* The month */}
        <div className="relative self-start overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(41,44,69,0.08),0_8px_30px_-12px_rgba(41,44,69,0.12)]">
          <div className={`absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden transition-opacity ${pending || loadingMonth ? "opacity-100" : "opacity-0"}`} aria-hidden>
            <span className="block h-full w-1/3 animate-[cal-load_1s_ease-in-out_infinite] bg-blue" />
          </div>
          <div className="grid grid-cols-7 border-b border-ink/[0.07]">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`px-2 py-2.5 text-center text-[0.68rem] font-medium tracking-[0.12em] uppercase sm:px-3 sm:text-left ${i > 4 ? "text-ink/35" : "text-ink-soft"}`}>
                {d}
              </div>
            ))}
          </div>
          <div key={`${program}|${month}`} className={`grid grid-cols-7 ${dir > 0 ? "animate-[cal-next_0.4s_var(--ease-soft)]" : dir < 0 ? "animate-[cal-prev_0.4s_var(--ease-soft)]" : "animate-[fade_0.3s_var(--ease-soft)]"}`}>
            {dates.map((d, i) => {
              const raw = byDate.get(d) ?? [];
              // Camp and Flex: one row per age group. Happenings and Everything: one row per time slot.
              const daySlots = slotsOf(raw, { withProgram: true, compact: true });
              const perGroup = program === "camp" || program === "flex";
              const rows = perGroup && daySlots.length === 1 ? daySlots[0].sessions : daySlots.map((x) => x.total);
              const out = d < grid.first || d > grid.last;
              const sel = d === date;
              const isToday = d === today;
              const past = d < today;
              const open = raw.reduce((n, s) => n + s.remaining, 0);
              const cap = raw.reduce((n, s) => n + s.effectiveCapacity, 0);
              const tone = raw.length ? toneOf(open, cap) : "none";
              // One total only makes sense when everything that day runs at the same time.
              const oneSlot = daySlots.length === 1;
              const allFull = raw.length > 0 && raw.every((s) => s.effectiveCapacity > 0 && s.remaining <= 0);
              const coming = raw.reduce((n, s) => n + s.booked, 0);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDate(d);
                    if (raw.length && window.matchMedia("(max-width: 1279px)").matches) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
                  }}
                  onMouseEnter={() => raw.length && void fetchDay(program, d).catch(() => {})}
                  aria-pressed={sel}
                  aria-label={`${fmtDate(d, "EEEE d MMMM")}: ${raw.length ? `${coming} booked, ${open} spots open` : "nothing scheduled"}`}
                  className={`group relative flex flex-col border-ink/[0.07] p-1.5 text-left transition-colors duration-200 outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-blue sm:p-2.5 ${busyWeek.has(Math.floor(i / 7)) ? "min-h-[4.25rem] sm:min-h-[8.5rem]" : "min-h-[3.25rem] sm:min-h-[4.5rem]"} ${i % 7 !== 6 ? "border-r" : ""} ${i < dates.length - 7 ? "border-b" : ""} ${
                    sel ? "z-[1] bg-blue/[0.05]" : out ? "bg-[#faf9f5]" : raw.length ? "hover:bg-[#f7f6fb]" : "hover:bg-ink/[0.015]"
                  }`}
                >
                  {sel ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[2px] ring-2 ring-blue ring-inset" /> : null}
                  <span className="flex items-center justify-between gap-1">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-[0.82rem] tabular-nums transition-colors ${
                        isToday ? "bg-blue font-semibold text-white" : out ? "text-ink/25" : past ? "text-ink/45" : "text-ink"
                      }`}
                    >
                      {Number(d.slice(8))}
                    </span>
                    {raw.length && !out && (oneSlot || allFull) ? (
                      <span className={`hidden rounded-full px-2 py-0.5 text-[0.66rem] whitespace-nowrap font-medium tabular-nums sm:inline ${TONE_BG[tone]} ${past ? "opacity-60" : ""}`}>{tone === "full" ? "Full" : `${open} open`}</span>
                    ) : null}
                  </span>
                  {/* Phones: one dot and the spots open. */}
                  {raw.length ? (
                    <span className={`mt-auto flex items-center gap-1 sm:hidden ${out ? "opacity-40" : ""}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${TONE_BAR[allFull ? "full" : tone]}`} />
                      {oneSlot || allFull ? <span className={`text-[0.66rem] tabular-nums ${TONE_TEXT[tone]}`}>{allFull ? "Full" : open}</span> : <span className="text-[0.66rem] text-ink-soft">{daySlots.length}</span>}
                    </span>
                  ) : null}
                  {rows.length ? (
                    <span className={`mt-2 hidden flex-col gap-1.5 sm:flex ${out ? "opacity-40" : past ? "opacity-70" : ""}`}>
                      {rows.slice(0, 6).map((s) => {
                        const t = toneOf(s.remaining, s.effectiveCapacity);
                        return (
                          <span key={s.id} className="block">
                            {!perGroup || daySlots.length > 1 ? (
                              <>
                                <span className="flex min-w-0 items-center gap-1 text-[0.68rem] leading-tight tracking-[-0.01em] text-ink">
                                  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[s.programKind] ?? "bg-ink/40"}`} />
                                  <span className="truncate">{s.group}</span>
                                </span>
                                <span className="mt-1 flex items-center gap-1.5">
                                  <Meter s={s} className="flex-1" />
                                  <span className={`shrink-0 text-[0.64rem] leading-none tabular-nums ${TONE_TEXT[t]}`}>{s.effectiveCapacity ? `${s.used}/${s.effectiveCapacity}` : s.booked}</span>
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="flex items-baseline justify-between gap-1.5 text-[0.7rem] leading-tight">
                                  <span className="truncate text-ink">{shortGroup(s.group)}</span>
                                  <span className={`shrink-0 tabular-nums ${TONE_TEXT[t]}`}>{s.effectiveCapacity ? `${s.used}/${s.effectiveCapacity}` : s.booked}</span>
                                </span>
                                <Meter s={s} className="mt-1" />
                              </>
                            )}
                          </span>
                        );
                      })}
                      {rows.length > 6 ? <span className="text-[0.66rem] text-ink-soft">+{rows.length - 6} more</span> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink/[0.07] px-4 py-2.5 text-[0.7rem] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-blue" /> Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-[repeating-linear-gradient(135deg,#c08a3e_0_3px,#e9cf9f_3px_6px)]" /> Paying now
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-[#c08a3e]" /> Nearly full
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-[#8a2333]" /> Full
            </span>
            <span className="ml-auto hidden sm:inline">Use ← → to change month · T for today</span>
          </div>
        </div>

        {/* The chosen day */}
        <div ref={panelRef} className="scroll-mt-20 self-start xl:sticky xl:top-6">
          <DayPanel key={`${program}|${date}`} date={date} program={program} today={today} data={dayEntry?.data} />
        </div>
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} />
    </svg>
  );
}

function DayPanel({ date, program, today, data }: { date: string | null; program: CalendarProgram; today: string; data: CalendarDaySession[] | undefined }) {
  const list = data ?? [];
  const slots = slotsOf(list, { withProgram: program === "all" || program === "happenings" || new Set(list.map((s) => s.programName)).size > 1 });
  const [slotKeyChosen, setSlot] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const slot = slots.find((x) => x.key === slotKeyChosen) ?? slots[0];
  const current = slot?.sessions.find((s) => s.id === tab) ?? slot?.sessions[0];
  const coming = list.reduce((n, s) => n + s.children.length, 0);

  return (
    <aside className="rounded-2xl bg-white shadow-[0_0_0_1px_rgba(41,44,69,0.08),0_8px_30px_-12px_rgba(41,44,69,0.12)]">
      <div className="border-b border-ink/[0.07] px-5 pt-5 pb-4">
        <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">{date === today ? "Today" : date && date < today ? "Past day" : "Day"}</p>
        <h2 className="display mt-1 text-[1.5rem] leading-tight text-ink">{date ? fmtDate(date, "EEEE d MMMM") : "Choose a day"}</h2>
        {date && data && list.length ? (
          <p className="mt-1 text-[0.82rem] text-ink-soft">
            <span className="font-medium text-ink">{coming}</span> {coming === 1 ? "child" : "children"} coming
            {slots.length === 1 ? (
              <>
                {" · "}
                <span className={`font-medium ${slots[0].total.remaining ? "text-[#2c6447]" : "text-[#8a2333]"}`}>
                  {slots[0].total.remaining ? `${slots[0].total.remaining} of ${slots[0].total.effectiveCapacity} spots open` : "fully booked"}
                </span>
              </>
            ) : (
              ` · ${slots.length} sessions`
            )}
          </p>
        ) : null}
      </div>

      {!date ? (
        <p className="px-5 py-10 text-center text-[0.86rem] text-ink-soft">Choose a day on the calendar to see who’s coming.</p>
      ) : !data ? (
        <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-3">
              <span className="h-9 w-9 rounded-full bg-ink/[0.06]" />
              <span className="h-3 flex-1 rounded bg-ink/[0.06]" style={{ maxWidth: `${70 - i * 10}%` }} />
            </div>
          ))}
        </div>
      ) : !slot ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[0.92rem] text-ink">Nothing scheduled</p>
          <p className="mt-1 text-[0.8rem] text-ink-soft">Pick another day, or add sessions from the schedule.</p>
        </div>
      ) : (
        <>
          {/* Sessions that day (time slots), each with its own spots left. */}
          {slots.length > 1 ? (
            <div className="border-b border-ink/[0.07] px-5 py-3">
              <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-ink/[0.05] p-1" role="tablist" aria-label="Sessions">
                {slots.map((x) => {
                  const t = toneOf(x.total.remaining, x.total.effectiveCapacity);
                  const active = x.key === slot.key;
                  return (
                    <button
                      key={x.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setSlot(x.key);
                        setTab(null);
                      }}
                      className={`min-w-[5.5rem] shrink-0 rounded-lg px-3 py-1.5 text-left transition-all duration-200 ${active ? "bg-white shadow-[0_1px_3px_rgba(41,44,69,0.14)]" : "hover:bg-white/50"}`}
                    >
                      <span className="flex items-center gap-1.5 text-[0.78rem] leading-tight font-medium whitespace-nowrap text-ink">
                        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[x.total.programKind] ?? "bg-ink/40"}`} />
                        {x.label}
                      </span>
                      <span className={`block text-[0.68rem] whitespace-nowrap tabular-nums ${TONE_TEXT[t]}`}>
                        {x.total.effectiveCapacity ? `${x.total.used}/${x.total.effectiveCapacity} · ${leftLabel(x.total.remaining, x.total.effectiveCapacity)}` : `${x.total.booked} booked`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {/* Age groups in that session. */}
          {slot.sessions.length > 1 ? (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pt-4" role="tablist" aria-label="Groups">
              {slot.sessions.map((s) => {
                const t = toneOf(s.remaining, s.effectiveCapacity);
                const active = s.id === current?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(s.id)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-left transition-all duration-200 ${active ? "bg-ink text-chalk" : "bg-ink/[0.04] text-ink hover:bg-ink/[0.08]"}`}
                  >
                    <span className="block text-[0.78rem] leading-tight font-medium whitespace-nowrap">{shortGroup(groupLabel(s))}</span>
                    <span className={`block text-[0.68rem] whitespace-nowrap tabular-nums ${active ? "text-chalk/70" : TONE_TEXT[t]}`}>{leftLabel(s.remaining, s.effectiveCapacity) || `${s.booked} booked`}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {current ? <GroupView key={current.id} s={current} /> : null}
        </>
      )}
    </aside>
  );
}

/** "Weekend Play · AM play session · 4 – 7 years" → "4 – 7 years". */
const groupLabel = (s: CalendarSession) => s.title.split(" · ").pop() ?? s.title;

function GroupView({ s }: { s: CalendarDaySession }) {
  const t = toneOf(s.remaining, s.effectiveCapacity);
  const allergies = s.children.filter((c) => c.allergies).length;
  const forms = s.children.filter((c) => c.formsMissing).length;
  return (
    <div key={s.id} className="animate-[fade_0.25s_var(--ease-soft)]">
      <div className="px-5 pt-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[0.95rem] font-medium text-ink">{s.title}</p>
            <p className="text-[0.78rem] text-ink-soft">
              {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
            </p>
          </div>
          {s.effectiveCapacity ? (
            <p className="shrink-0 text-right">
              <span className={`block text-[1.6rem] leading-none font-semibold tabular-nums ${TONE_TEXT[t]}`}>{s.remaining <= 0 ? "Full" : s.remaining}</span>
              <span className="text-[0.7rem] text-ink-soft">{s.remaining <= 0 ? `${s.used} of ${s.effectiveCapacity}` : `spot${s.remaining === 1 ? "" : "s"} left of ${s.effectiveCapacity}`}</span>
            </p>
          ) : null}
        </div>
        {s.effectiveCapacity ? <Meter s={s} className="mt-3 h-2" /> : null}
        <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.74rem] text-ink-soft">
          <span>{s.booked} booked</span>
          {s.held ? <span className="text-[#8a5212]">{s.held} paying now</span> : null}
          {s.used - s.booked - s.held > 0 ? <span>{s.used - s.booked - s.held} members or reserved</span> : null}
          {s.waiting ? <span className="text-blue">{s.waiting} on the waitlist</span> : null}
          {allergies ? <span className="text-[#8a5212]">{allergies} with allergies</span> : null}
          {forms ? <span className="text-[#8a2333]">{forms} missing forms</span> : null}
        </p>
      </div>

      {s.children.length ? (
        <ul className="mt-4 max-h-[min(60vh,34rem)] divide-y divide-ink/[0.06] overflow-y-auto border-t border-ink/[0.07]">
          {s.children.map((c) => (
            <ChildRow key={c.childId} c={c} />
          ))}
        </ul>
      ) : (
        <p className="mx-5 mt-4 rounded-xl bg-[#f7f5ef] px-4 py-3 text-[0.82rem] text-ink-soft">No one booked yet.</p>
      )}

      {s.notComing.length ? (
        <details className="group border-t border-ink/[0.07] px-5 py-3 text-[0.78rem] text-ink-soft">
          <summary className="cursor-pointer list-none select-none hover:text-ink">
            {s.notComing.length} not coming <span className="inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <ul className="mt-2 space-y-0.5">
            {s.notComing.map((n, i) => (
              <li key={i}>
                {n.name} <span className="text-ink/40">· {n.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-ink/[0.07] px-5 py-3.5">
        <Link href={`/admin/roster?date=${s.date}&session=${s.id}`} className="inline-flex h-8 items-center rounded-full bg-ink px-3.5 text-[0.78rem] font-medium text-chalk transition-colors hover:bg-blue">
          Check in
        </Link>
        <Link href={`/admin/sessions/${s.id}`} className="inline-flex h-8 items-center rounded-full px-3 text-[0.78rem] text-ink ring-1 ring-ink/15 transition-colors hover:ring-ink/40">
          Session details
        </Link>
        <a href={`/admin/export/roster/${s.id}`} className="inline-flex h-8 items-center rounded-full px-3 text-[0.78rem] text-ink ring-1 ring-ink/15 transition-colors hover:ring-ink/40">
          Download roster
        </a>
      </div>
    </div>
  );
}

function ChildRow({ c }: { c: CalendarChild }) {
  const a = ATTEND[c.attendance];
  return (
    <li>
      <Link href={`/admin/families/${c.familyId}`} className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-[#f7f6fb]">
        <span aria-hidden className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.72rem] font-semibold ${avatarTone(c.childId)}`}>
          {initials(c.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[0.88rem] text-ink">{c.name}</span>
            <span className="shrink-0 text-[0.72rem] text-ink-soft">{c.age}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.7rem]">
            {c.allergies ? (
              <span className="inline-flex items-center gap-1 text-[#8a5212]" title={`Allergies: ${c.allergies}`}>
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden fill="currentColor">
                  <path d="M6 1 11.2 10.4H.8z" />
                </svg>
                {c.allergies}
              </span>
            ) : null}
            {c.formsMissing ? <span className="text-[#8a2333]">{c.formsMissing} form{c.formsMissing === 1 ? "" : "s"} missing</span> : null}
            {c.extras.map((x) => (
              <span key={x} className="text-ink-soft">
                {x}
              </span>
            ))}
            {c.member ? <span className="text-ink-soft">Club Yalla</span> : null}
          </span>
        </span>
        {a ? <span className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-medium ${a.cls}`}>{a.label}</span> : null}
      </Link>
    </li>
  );
}
