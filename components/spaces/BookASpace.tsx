"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { loadDay, move, quote, reserve } from "@/app/(site)/portal/spaces/actions";
import { Mark } from "@/components/brand/Mark";
import type { BusyInterval, DayView, MyReservation, PublicWorkspace } from "@/lib/spaces/availability";
import type { Allowance, Quote, ReserveInput } from "@/lib/spaces/engine";
import { addDays, fmtDay, fmtDuration, fmtMin, fmtRange, laMinutes, toHHMM, toMin, usd, weekday } from "./time";


type Category = PublicWorkspace["category"];
type Me = { allowance: Allowance; community: boolean; mine: { workspaceId: string; start: string; end: string; reference: string }[] } | null;
type Kind = ReserveInput["bookingType"];

const CATEGORIES: { key: "all" | Category; label: string }[] = [
  { key: "all", label: "All Spaces" },
  { key: "private_office", label: "Private Offices" },
  { key: "phone_booth", label: "Phone Booth" },
  { key: "private_desk", label: "Private Desks" },
];
const CATEGORY_LABEL: Record<Category, string> = { private_office: "Private Office", phone_booth: "Phone Booth", private_desk: "Private Desk" };
const UNIT: Record<string, string> = { half_day: "half-day", full_day: "day", week: "week", hourly: "hour" };
const KIND_LABEL: Record<Kind, string> = { complimentary: "Complimentary time", hourly: "By the hour", half_day: "Half day", full_day: "Full day", week: "Week" };
const MOTIF: Record<Category, "window" | "arch" | "balcony"> = { private_office: "window", phone_booth: "arch", private_desk: "balcony" };

/** Busy intervals as local minutes on the selected date, clamped to the day. */
function localBusy(busy: BusyInterval[], workspaceId: string, skip: { start: string; end: string }[] = []) {
  return busy
    .filter((b) => b.workspaceId === workspaceId && !skip.some((s) => s.start === b.start && s.end === b.end))
    .map((b) => ({ start: laMinutes(b.start), end: laMinutes(b.end) || 24 * 60, status: b.status }));
}

function freeStarts(ws: PublicWorkspace, view: DayView, minutes: number, busy: { start: number; end: number }[], nowMin: number | null) {
  if (!ws.hours) return [];
  const open = toMin(ws.hours[0]);
  const close = toMin(ws.hours[1]);
  const out: number[] = [];
  for (let s = open; s + minutes <= close; s += view.config.slotMinutes) {
    if (nowMin != null && s <= nowMin) continue;
    if (busy.some((b) => s < b.end && s + minutes > b.start)) continue;
    out.push(s);
  }
  return out;
}

/** Free time remaining in the open hours (from now, when viewing today), in minutes. */
function freeMinutes(ws: PublicWorkspace, busy: { start: number; end: number }[], nowMin: number | null) {
  if (!ws.hours) return 0;
  const open = Math.min(Math.max(toMin(ws.hours[0]), nowMin ?? 0), toMin(ws.hours[1]));
  const close = toMin(ws.hours[1]);
  let taken = 0;
  for (const b of busy) taken += Math.max(0, Math.min(close, b.end) - Math.max(open, b.start));
  return Math.max(0, close - open - taken);
}

export function BookASpace({ initialView, initialMe, signedIn, moving }: { initialView: DayView; initialMe: Me; signedIn: boolean; moving: MyReservation | null }) {
  const [view, setView] = useState(initialView);
  const [me, setMe] = useState<Me>(initialMe);
  const [date, setDate] = useState(initialView.date);
  const [category, setCategory] = useState<"all" | Category>("all");
  const [sheet, setSheet] = useState<{ workspaceId: string; start?: number } | null>(null);
  const [loading, startLoading] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(
    (d: string, quiet = false) => {
      const run = async () => {
        const r = await loadDay(d);
        if (r.ok) {
          setView(r.data.view);
          setMe(r.data.me);
        } else if (!quiet) setNotice(r.error);
      };
      if (quiet) void run();
      else startLoading(run);
    },
    [startLoading],
  );

  // Keep availability current while the page is open: refresh every 30 seconds and on focus.
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refresh(date, true);
    const id = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [date, refresh]);

  const pickDate = (d: string) => {
    setDate(d);
    setNotice(null);
    refresh(d);
  };

  const days = useMemo(() => Array.from({ length: 28 }, (_, i) => addDays(view.today, i)), [view.today]);
  const shown = view.workspaces.filter((w) => category === "all" || w.category === category);
  const nowMin = date === view.today ? laMinutes(view.now) : date < view.today ? 24 * 60 : null;
  const movingSkip = moving ? (me?.mine ?? []).filter((m) => m.reference === moving.reference) : [];
  const active = sheet ? view.workspaces.find((w) => w.id === sheet.workspaceId) ?? null : null;
  const allowance = me?.allowance ?? null;
  const movingMinutes = moving && moving.intervals[0]?.localDate === date ? moving.complimentaryMinutes : 0;
  const compNames = joinNames(view.workspaces.filter((w) => w.complimentary).map((w) => w.name));

  return (
    <div className="pb-24">
      {moving ? (
        <div className="shell mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border border-blue/30 bg-blue/[0.05] px-5 py-4 text-[0.92rem]">
            <span>
              Changing <strong className="font-medium">{moving.workspace.name}</strong> on {fmtDay(moving.intervals[0].localDate, "short")}, {fmtRange(laMinutes(moving.intervals[0].start), laMinutes(moving.intervals[0].end))}. Choose a new time in {compNames}.
            </span>
            <Link href="/portal/spaces/reservations" className="text-[0.85rem] text-ink-soft underline underline-offset-4 hover:text-ink">
              Keep it as it is
            </Link>
          </div>
        </div>
      ) : null}

      {signedIn && me && !me.community ? (
        <div className="shell mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border border-blue/30 bg-blue/[0.05] px-5 py-4 text-[0.92rem]">
            <span className="max-w-2xl">
              Coworking spaces are reserved for families in the Yalla community. Once your child has attended a session at Yalla, you can reserve a space here. Care is booked separately.
            </span>
            <Link href="/book" className="text-[0.85rem] text-ink underline underline-offset-4 hover:text-blue">
              Explore and book care
            </Link>
          </div>
        </div>
      ) : null}

      {/* Allowance */}
      <div className="shell grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <AllowanceCard allowance={allowance} signedIn={signedIn} date={date} today={view.today} extra={movingMinutes} daily={view.config.complimentary.dailyMinutes} names={compNames} />
        </div>
        <div className="lg:col-span-5 lg:text-right">
          <div className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] flex gap-2 overflow-x-auto px-[clamp(1.25rem,4vw,3.5rem)] lg:mx-0 lg:justify-end lg:px-0" role="group" aria-label="Filter by type of space">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                aria-pressed={category === c.key}
                className={`h-10 shrink-0 rounded-full border px-4 text-[0.85rem] transition-all duration-300 focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none ${
                  category === c.key ? "border-ink bg-ink text-chalk" : "border-ink/15 text-ink/80 hover:border-ink/50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Date strip */}
      <div className="sticky top-16 z-30 mt-10 border-y border-line bg-chalk/90 backdrop-blur-xl">
        <div className="shell py-3">
          <div className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] flex gap-1.5 overflow-x-auto px-[clamp(1.25rem,4vw,3.5rem)] pb-1" role="listbox" aria-label="Choose a date">
            {days.map((d) => {
              const open = view.config.openWeekdays.includes(weekday(d));
              const sel = d === date;
              return (
                <button
                  key={d}
                  role="option"
                  aria-selected={sel}
                  disabled={!open}
                  onClick={() => pickDate(d)}
                  aria-label={`${fmtDay(d)}${open ? "" : ", closed"}`}
                  className={`relative flex h-[4.25rem] w-12 shrink-0 flex-col items-center justify-center rounded-t-full border transition-all duration-300 focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none ${
                    sel ? "border-ink bg-ink text-chalk" : open ? "border-ink/10 hover:border-ink/40" : "border-transparent text-ink/25"
                  }`}
                >
                  <span className="eyebrow mt-2 text-[0.5rem]">{fmtDay(d, "weekday").slice(0, 1)}</span>
                  <span className="font-serif text-[1.05rem] leading-tight">{fmtDay(d, "num")}</span>
                  {d.endsWith("-01") || d === view.today ? <span className="absolute -top-0.5 text-[0.5rem] tracking-widest uppercase">{d === view.today ? "Today" : fmtDay(d, "month")}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {notice ? (
        <div className="shell mt-6">
          <p role="status" className="border-l-2 border-oxblood/40 pl-4 text-[0.9rem] text-oxblood">
            {notice}
          </p>
        </div>
      ) : null}

      {/* Timeline */}
      <section className="shell mt-12" aria-labelledby="timeline-title">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="timeline-title" className="flex items-baseline gap-4">
            <span className="display text-[clamp(1.7rem,1.3rem+1vw,2.2rem)]">{fmtDay(date, "long").split(",")[0]}</span>
            <span className="font-serif text-ink-soft italic">{fmtDay(date, "long").split(", ")[1]}</span>
          </h2>
          <Legend />
        </div>
        <div className={`mt-6 transition-opacity duration-300 ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
          {!view.open ? (
            <div className="border border-line bg-paper py-20 text-center">
              <Mark name="sun" className="mx-auto h-10 w-10 text-blue" />
              <p className="display mt-6 text-[1.7rem]">Yalla is closed this day.</p>
              <p className="mt-2 text-ink-soft">Choose another date to find your space.</p>
            </div>
          ) : (
            <Timeline view={view} workspaces={shown} me={me} nowMin={date === view.today ? laMinutes(view.now) : null} skip={movingSkip} onPick={(workspaceId, start) => setSheet({ workspaceId, start })} />
          )}
        </div>
      </section>

      {/* Workspaces */}
      <section className="shell mt-20" aria-labelledby="spaces-title">
        <h2 id="spaces-title" className="display text-[clamp(1.9rem,1.4rem+1.4vw,2.6rem)]">
          The <em>spaces.</em>
        </h2>
        <ul className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((w) => (
            <WorkspaceCard key={w.id} ws={w} daily={view.config.complimentary.dailyMinutes} free={freeMinutes(w, localBusy(view.busy, w.id, movingSkip), nowMin)} started={nowMin != null && !!w.hours && nowMin > toMin(w.hours[0])} disabled={!!moving && !w.complimentary} onOpen={() => setSheet({ workspaceId: w.id })} />
          ))}
        </ul>
      </section>

      {active ? (
        <BookingSheet
          key={`${active.id}-${date}-${sheet?.start ?? ""}`}
          ws={active}
          view={view}
          me={me}
          signedIn={signedIn}
          initialStart={sheet?.start}
          nowMin={nowMin}
          moving={moving}
          skip={movingSkip}
          onClose={() => setSheet(null)}
          onChanged={() => refresh(date, true)}
          onConflict={(msg) => {
            setSheet(null);
            setNotice(msg);
            refresh(date);
          }}
        />
      ) : null}
    </div>
  );
}

const joinNames = (n: string[]) => (n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);

function AllowanceCard({ allowance, signedIn, date, today, extra, daily, names }: { allowance: Allowance | null; signedIn: boolean; date: string; today: string; extra: number; daily: number; names: string }) {
  const when = date === today ? "today" : `on ${fmtDay(date, "short")}`;
  if (!signedIn)
    return (
      <div>
        <p className="eyebrow text-ink-soft">Your complimentary workspace time</p>
        <p className="display mt-3 text-[1.6rem]">Sign in to see your time.</p>
        <p className="mt-2 max-w-md text-[0.92rem] text-ink-soft">Eligible families receive up to {daily} minutes a day in {names}, included with tuition.</p>
      </div>
    );
  if (!allowance) return null;
  if (!allowance.eligible)
    return (
      <div>
        <p className="eyebrow text-ink-soft">Your complimentary workspace time</p>
        <p className="mt-3 max-w-md text-[0.95rem] text-ink-soft">{allowance.reason}. Paid workspace options are available below.</p>
      </div>
    );
  const remaining = Math.min(allowance.dailyMinutes, allowance.remainingMinutes + extra);
  const pct = allowance.dailyMinutes ? (remaining / allowance.dailyMinutes) * 100 : 0;
  return (
    <div>
      <p className="eyebrow text-ink-soft">Your complimentary workspace time</p>
      <p className="display mt-3 text-[clamp(1.6rem,1.3rem+0.9vw,2.1rem)]" aria-live="polite">
        {remaining === allowance.dailyMinutes ? (
          <>
            {allowance.dailyMinutes} minutes <em>available {when}.</em>
          </>
        ) : remaining === 0 ? (
          <>
            All used <em>{when}.</em>
          </>
        ) : (
          <>
            {remaining} of {allowance.dailyMinutes} minutes <em>remaining.</em>
          </>
        )}
      </p>
      <div className="mt-4 h-1 max-w-sm overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`${remaining} of ${allowance.dailyMinutes} complimentary minutes remaining ${when}`}>
        <div className="h-full rounded-full bg-blue transition-[width] duration-700 ease-[var(--ease-soft)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-[0.82rem] text-ink-soft">Shared across {names}. {remaining === 0 ? "You can still explore available paid options." : "Resets each day."}</p>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-4 text-[0.75rem] text-ink-soft" aria-label="Legend">
      <li className="flex items-center gap-2">
        <span className="h-3 w-5 rounded-[3px] border border-blue/25 bg-paper" aria-hidden /> Available
      </li>
      <li className="flex items-center gap-2">
        <span className="h-3 w-5 rounded-[3px] bg-ink/[0.12]" aria-hidden /> Reserved
      </li>
      <li className="flex items-center gap-2">
        <span className="h-3 w-5 rounded-[3px] bg-blue/25 ring-1 ring-blue/50 ring-inset" aria-hidden /> Yours
      </li>
      <li className="flex items-center gap-2">
        <span className="hatch h-3 w-5 rounded-[3px]" aria-hidden /> Closed
      </li>
    </ul>
  );
}

/**
 * The day as a calendar: times down the side, one column per space. Every open half-hour is a
 * button; reservations show as labeled blocks ("Reserved", or "Yours") so everyone can see what's
 * taken. Phones show one space at a time.
 */
function Timeline({
  view,
  workspaces,
  me,
  nowMin,
  skip,
  onPick,
}: {
  view: DayView;
  workspaces: PublicWorkspace[];
  me: Me;
  nowMin: number | null;
  skip: { start: string; end: string }[];
  onPick: (workspaceId: string, start: number) => void;
}) {
  const ROW = 30; // minutes per row
  const opens = workspaces.filter((w) => w.hours).map((w) => toMin(w.hours![0]));
  const closes = workspaces.filter((w) => w.hours).map((w) => toMin(w.hours![1]));
  const from = Math.floor((opens.length ? Math.min(...opens) : 510) / ROW) * ROW;
  const to = Math.ceil((closes.length ? Math.max(...closes) : 990) / ROW) * ROW;
  const rows: number[] = [];
  for (let m = from; m < to; m += ROW) rows.push(m);
  const top = (m: number) => `${((Math.min(Math.max(m, from), to) - from) / (to - from)) * 100}%`;
  const height = (a: number, b: number) => `${((Math.min(b, to) - Math.max(a, from)) / (to - from)) * 100}%`;
  const [phonePick, setPhonePick] = useState<string | null>(null);
  const phoneSpace = workspaces.find((w) => w.id === phonePick) ?? workspaces[0];

  const column = (w: PublicWorkspace) => {
    const mine = (me?.mine ?? []).filter((m) => m.workspaceId === w.id && !skip.some((s) => s.start === m.start && s.end === m.end));
    // The family's own reservations are drawn as "Yours", not as someone else's "Reserved".
    const busy = localBusy(view.busy, w.id, [...skip, ...mine]);
    const allBusy = localBusy(view.busy, w.id, skip);
    const open = w.hours ? toMin(w.hours[0]) : null;
    const close = w.hours ? toMin(w.hours[1]) : null;
    const pickable = w.bookingTypes.some((b) => b === "complimentary" || b === "hourly");
    const free = (m: number) => open != null && m >= open && m < close! && (nowMin == null || m >= nowMin) && !allBusy.some((b) => m >= b.start && m < b.end);
    return (
      <div className="relative" style={{ height: `${rows.length * 2.75}rem` }}>
        {/* One button per open half-hour */}
        {rows.map((m, i) => {
          const ok = free(m);
          return (
            <button
              key={m}
              type="button"
              disabled={!ok}
              onClick={() => onPick(w.id, pickable ? m : -1)}
              aria-label={`${w.name}, ${fmtMin(m)}${ok ? ", available" : ""}`}
              className={`group absolute inset-x-0 flex items-center border-t border-line/70 px-2 text-left text-[0.72rem] transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-blue/50 focus-visible:outline-none ${
                ok ? "bg-paper hover:bg-blue/10" : "cursor-default"
              }`}
              style={{ top: `${i * 2.75}rem`, height: "2.75rem" }}
            >
              {ok ? <span className="text-blue opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">+ {fmtMin(m)}</span> : null}
            </button>
          );
        })}
        {/* Closed: before opening and after closing */}
        {open == null ? (
          <div className="hatch pointer-events-none absolute inset-0 flex items-center justify-center text-[0.72rem] text-ink-soft">Closed</div>
        ) : (
          <>
            {open > from ? <div className="hatch pointer-events-none absolute inset-x-0" style={{ top: 0, height: height(from, open) }} /> : null}
            {close! < to ? <div className="hatch pointer-events-none absolute inset-x-0" style={{ top: top(close!), height: height(close!, to) }} /> : null}
          </>
        )}
        {/* Time that has passed */}
        {nowMin != null && nowMin > from ? <div className="pointer-events-none absolute inset-x-0 bg-chalk/70" style={{ top: 0, height: height(from, nowMin) }} /> : null}
        {busy.map((b, i) => (
          <div
            key={i}
            className={`absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-[0.7rem] leading-tight ${b.status === "reserved" ? "bg-ink/[0.12] text-ink/70" : "hatch-dark text-ink/60"}`}
            style={{ top: top(b.start), height: height(b.start, b.end) }}
          >
            <span className="block font-medium tracking-[0.06em] uppercase">{b.status === "reserved" ? "Reserved" : "Unavailable"}</span>
            {b.end - b.start >= 45 ? <span className="block">{fmtRange(b.start, b.end)}</span> : null}
          </div>
        ))}
        {mine.map((m) => (
          <div
            key={m.reference + m.start}
            className="absolute inset-x-1 overflow-hidden rounded-md bg-blue/20 px-2 py-1 text-[0.7rem] leading-tight text-blue ring-1 ring-blue/50 ring-inset"
            style={{ top: top(laMinutes(m.start)), height: height(laMinutes(m.start), laMinutes(m.end)) }}
          >
            <span className="block font-medium tracking-[0.06em] uppercase">Yours</span>
            {laMinutes(m.end) - laMinutes(m.start) >= 45 ? <span className="block">{fmtRange(laMinutes(m.start), laMinutes(m.end))}</span> : null}
          </div>
        ))}
        {nowMin != null && nowMin > from && nowMin < to ? (
          <span className="pointer-events-none absolute inset-x-0 h-px bg-oxblood/70" style={{ top: top(nowMin) }}>
            <span className="absolute -top-[3px] -left-[3px] h-[7px] w-[7px] rounded-full bg-oxblood" />
          </span>
        ) : null}
      </div>
    );
  };

  const times = (
    <div className="relative" style={{ height: `${rows.length * 2.75}rem` }} aria-hidden>
      {rows.map((m, i) =>
        m % 60 === 0 ? (
          <span key={m} className="absolute right-3 -translate-y-1/2 text-[0.7rem] text-ink-soft tabular-nums" style={{ top: `${i * 2.75}rem` }}>
            {fmtMin(m, { compact: true })}
          </span>
        ) : null,
      )}
    </div>
  );

  const header = (w: PublicWorkspace) => (
    <button type="button" onClick={() => onPick(w.id, -1)} className="block w-full px-2 pb-3 text-left hover:text-blue focus-visible:text-blue focus-visible:outline-none">
      <span className="block font-serif text-[1.15rem] leading-tight">{w.name}</span>
      <span className="text-[0.62rem] tracking-[0.08em] text-ink-soft uppercase">{CATEGORY_LABEL[w.category]}</span>
    </button>
  );

  return (
    <div>
      {/* Tablet and up: every space side by side */}
      <div className="hidden overflow-x-auto sm:block">
        <div className="grid min-w-[40rem] pt-2" style={{ gridTemplateColumns: `4rem repeat(${workspaces.length}, minmax(7.5rem, 1fr))` }}>
          <div />
          {workspaces.map((w) => (
            <div key={w.id} className="border-l border-line">
              {header(w)}
            </div>
          ))}
          <div className="border-t border-line pt-0">{times}</div>
          {workspaces.map((w) => (
            <div key={w.id} className="overflow-hidden border-t border-l border-line">
              {column(w)}
            </div>
          ))}
        </div>
      </div>

      {/* Phones: one space at a time */}
      <div className="sm:hidden">
        <div className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] flex gap-2 overflow-x-auto px-[clamp(1.25rem,4vw,3.5rem)] pb-3" role="group" aria-label="Choose a space">
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-pressed={phoneSpace?.id === w.id}
              onClick={() => setPhonePick(w.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-left text-[0.85rem] ${phoneSpace?.id === w.id ? "border-ink bg-ink text-chalk" : "border-ink/15"}`}
            >
              {w.name}
              <span className="ml-1.5 text-[0.7rem] opacity-60">{CATEGORY_LABEL[w.category]}</span>
            </button>
          ))}
        </div>
        {phoneSpace ? (
          <div className="grid grid-cols-[3.5rem_1fr] border-t border-line">
            {times}
            <div className="overflow-hidden border-l border-line">{column(phoneSpace)}</div>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-[0.78rem] text-ink-soft">Tap an open time to reserve it. Reserved times are shown for everyone, and availability refreshes automatically.</p>
    </div>
  );
}

function WorkspaceCard({ ws, free, started, daily, disabled, onOpen }: { ws: PublicWorkspace; free: number; started: boolean; daily: number; disabled: boolean; onOpen: () => void }) {
  const total = ws.hours ? toMin(ws.hours[1]) - toMin(ws.hours[0]) : 0;
  const availability = !ws.hours ? "Closed this day" : free === 0 ? (started ? "No more openings today" : "Fully reserved") : free === total ? "Open all day" : `${fmtDuration(free)} open${started ? " today" : ""}`;
  const priceLine = ws.complimentary
    ? ws.pricedTypes.length
      ? "Complimentary time available with tuition"
      : `Up to ${daily} minutes complimentary, subject to your remaining daily allowance`
    : ws.fromPrice
      ? `From ${usd(ws.fromPrice.cents)} / ${UNIT[ws.fromPrice.bookingType]}`
      : "Pricing coming soon";
  return (
    <li className="group">
      <button onClick={onOpen} disabled={disabled} className="block w-full text-left focus-visible:outline-none disabled:opacity-40" aria-label={`${ws.name}, ${CATEGORY_LABEL[ws.category]}. ${availability}. ${priceLine}.`}>
        <div className="relative aspect-[4/3] overflow-hidden rounded-t-[999px] bg-mist transition-transform duration-700 ease-[var(--ease-soft)] group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-blue/50">
          {ws.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ws.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full items-end justify-center pb-[12%]">
              <Mark name={MOTIF[ws.category]} className="h-[42%] w-auto text-blue/80 transition-transform duration-[1.2s] ease-[var(--ease-soft)] group-hover:-translate-y-1" />
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[0.6rem] tracking-[0.18em] text-blue/60 uppercase">Photo coming soon</span>
            </div>
          )}
        </div>
        <div className="mt-5 flex items-baseline justify-between gap-4">
          <p className="display text-[1.9rem]">{ws.name}</p>
          <span className={`text-[0.78rem] ${free === 0 || !ws.hours ? "text-ink-soft" : "text-blue"}`}>{availability}</span>
        </div>
        <p className="eyebrow mt-1 text-[0.6rem] text-ink-soft">{CATEGORY_LABEL[ws.category]}</p>
        {ws.summary ? <p className="mt-3 text-[0.95rem] text-ink-soft">{ws.summary}</p> : null}
        <p className="mt-3 text-[0.9rem]">{priceLine}</p>
        {ws.complimentary && ws.pricedTypes.length ? <p className="text-[0.85rem] text-ink-soft">Additional paid reservations available</p> : null}
        <span className="mt-5 inline-flex h-10 items-center rounded-full border border-ink/20 px-5 text-[0.85rem] transition-colors group-hover:border-ink">
          {disabled ? "Not part of this change" : "View availability"}
        </span>
      </button>
    </li>
  );
}

/* ── The reservation sheet ── */

type Choice = { kind: Kind | null; minutes: number | null; start: number | null; half: "morning" | "afternoon" | null };

function BookingSheet({
  ws,
  view,
  me,
  signedIn,
  initialStart,
  nowMin,
  moving,
  skip,
  onClose,
  onChanged,
  onConflict,
}: {
  ws: PublicWorkspace;
  view: DayView;
  me: Me;
  signedIn: boolean;
  initialStart?: number;
  nowMin: number | null;
  moving: MyReservation | null;
  skip: { start: string; end: string }[];
  onClose: () => void;
  onChanged: () => void;
  onConflict: (msg: string) => void;
}) {
  const allowance = me?.allowance ?? null;
  const extra = moving && moving.intervals[0]?.localDate === view.date ? moving.complimentaryMinutes : 0;
  const remaining = allowance ? Math.min(allowance.dailyMinutes, allowance.remainingMinutes + extra) : 0;
  const busy = localBusy(view.busy, ws.id, skip);
  const priced = Object.fromEntries(ws.pricedTypes.map((p) => [p.bookingType, p.cents])) as Record<string, number>;
  // A half or full day that has already begun can be booked for what's left, from the next half
  // hour, at a prorated price. Returns the start it would get (or null once it's over).
  const fromNow = (a: number, b: number) => {
    if (nowMin == null || a > nowMin) return a;
    const next = Math.ceil((nowMin + 0.01) / 30) * 30;
    return next < b ? next : null;
  };
  const prorate = (cents: number, a: number, b: number) => {
    const f = fromNow(a, b);
    return f == null ? null : Math.round((cents * (b - f)) / (b - a));
  };
  const fd = { a: toMin(view.config.fullDay.start), b: toMin(view.config.fullDay.end) };
  const fdFrom = fromNow(fd.a, fd.b);

  const kinds: { kind: Kind; title: string; detail: string; disabled?: string }[] = [];
  if (ws.complimentary)
    kinds.push({
      kind: "complimentary",
      title: "Complimentary time",
      detail: !signedIn ? "Included with tuition for eligible families" : !allowance?.eligible ? (allowance?.reason ?? "Not included") : `${remaining} of ${allowance.dailyMinutes} minutes left`,
      disabled:
        signedIn && allowance && (!allowance.eligible || remaining <= 0)
          ? allowance.eligible
            ? "You’ve used your complimentary workspace time for this day."
            : `${allowance.reason}${allowance.reason.endsWith("membership") ? " on this day" : ""}`
          : undefined,
    });
  if (!moving) {
    if (priced.hourly != null) kinds.push({ kind: "hourly", title: "By the hour", detail: `${usd(priced.hourly)} / hour` });
    if (priced.half_day != null && (view.config.halfDay.morning || view.config.halfDay.afternoon)) {
      const h = view.config.halfDay;
      const only = h.morning && !h.afternoon ? h.morning : !h.morning && h.afternoon ? h.afternoon : null;
      const ended = (["morning", "afternoon"] as const).every((k) => !h[k] || fromNow(toMin(h[k]!.start), toMin(h[k]!.end)) == null);
      kinds.push({
        kind: "half_day",
        title: "Half day",
        detail: only ? `${usd(priced.half_day)} · ${fmtRange(toMin(only.start), toMin(only.end))}` : usd(priced.half_day),
        disabled: ended ? "Today’s half day has ended. A full day is prorated for the time that’s left." : undefined,
      });
    }
    if (priced.full_day != null) kinds.push({
        kind: "full_day",
        title: "Full day",
        detail:
          fdFrom != null && fdFrom !== fd.a
            ? `${usd(prorate(priced.full_day, fd.a, fd.b)!)} · ${fmtRange(fdFrom, fd.b)} · prorated, already underway`
            : `${usd(priced.full_day)} · ${fmtRange(fd.a, fd.b)}`,
        disabled: fdFrom == null ? "Today’s session has ended." : undefined,
      });
    if (priced.week != null)
      kinds.push({ kind: "week", title: "Week", detail: `${usd(priced.week)} · ${view.config.week.mode === "calendar" ? "Monday – Friday" : `${view.config.week.days} days in a row, starting any day`}` });
  }
  const firstEnabled = kinds.find((k) => !k.disabled)?.kind ?? null;
  const startGiven = initialStart != null && initialStart >= 0 ? initialStart : null;
  const [c, setC] = useState<Choice>(() => {
    const kind = startGiven != null && kinds.find((k) => (k.kind === "complimentary" || k.kind === "hourly") && !k.disabled)?.kind;
    const k = kind || firstEnabled;
    const minutes = k === "complimentary" ? (view.config.complimentary.durations.filter((d) => d <= remaining).slice(-1)[0] ?? null) : k === "hourly" ? view.config.hourly.durations[0] : null;
    return { kind: k, minutes, start: startGiven, half: view.config.halfDay.morning ? "morning" : view.config.halfDay.afternoon ? "afternoon" : null };
  });
  const [step, setStep] = useState<"choose" | "review" | "done">("choose");
  // A week starts on any open day the family picks and runs for the configured number of open days.
  const [weekStart, setWeekStart] = useState(view.date);
  const openOn = (d: string) => view.config.openWeekdays.includes(weekday(d));
  const weekStarts = Array.from({ length: 28 }, (_, i) => addDays(view.today, i)).filter((d) => openOn(d) && d >= view.today);
  const weekSpan = (() => {
    if (view.config.week.mode === "calendar") return view.weekDates;
    const out: string[] = [];
    for (let d = weekStart; out.length < view.config.week.days; d = addDays(d, 1)) if (openOn(d)) out.push(d);
    return out;
  })();
  const [q, setQ] = useState<Quote | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startPending] = useTransition();
  const [doneRef, setDoneRef] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [onClose]);

  const timed = c.kind === "complimentary" || c.kind === "hourly";
  const durations = c.kind === "complimentary" ? view.config.complimentary.durations : c.kind === "hourly" ? view.config.hourly.durations : [];
  const starts = timed && c.minutes ? freeStarts(ws, view, c.minutes, busy, nowMin) : [];
  // If the chosen start doesn't fit the chosen duration, fall back gracefully.
  const startOk = c.start != null && starts.includes(c.start);
  const halfWindow = c.half ? view.config.halfDay[c.half] : null;
  const windowFree = (a: number, b: number) => {
    const f = fromNow(a, b);
    return f != null && !busy.some((x) => f < x.end && b > x.start);
  };

  const input: ReserveInput | null = !c.kind
    ? null
    : timed
      ? startOk && c.minutes
        ? { workspaceId: ws.id, bookingType: c.kind, date: view.date, start: toHHMM(c.start!), minutes: c.minutes }
        : null
      : c.kind === "half_day"
        ? halfWindow
          ? { workspaceId: ws.id, bookingType: "half_day", date: view.date, half: c.half! }
          : null
        : { workspaceId: ws.id, bookingType: c.kind, date: c.kind === "week" && view.config.week.mode !== "calendar" ? weekStart : view.date };

  const review = () => {
    if (!input) return;
    setProblem(null);
    startPending(async () => {
      const r = await quote(input, moving?.reference);
      if (!r.ok) return setProblem(r.error);
      if (!r.data.available) return setProblem(r.data.problem);
      setQ(r.data);
      setStep("review");
    });
  };

  const confirm = () => {
    if (!input) return;
    setProblem(null);
    startPending(async () => {
      if (moving) {
        const r = await move(moving.reference, input);
        if (!r.ok) return r.code === "taken" ? onConflict("Someone just reserved that time. Here’s what’s still available.") : setProblem(r.error);
        setDoneRef(moving.reference);
        setStep("done");
        onChanged();
        return;
      }
      const r = await reserve(input);
      if (!r.ok) return r.code === "taken" ? onConflict("Someone just reserved that time. Here’s what’s still available.") : setProblem(r.error);
      if (r.data.url) {
        window.location.assign(r.data.url);
        return;
      }
      setDoneRef(r.data.reference);
      setStep("done");
      onChanged();
    });
  };

  const total = q?.priceCents ?? 0;
  const policy =
    c.kind === "complimentary"
      ? view.config.complimentaryCutoffMinutes
        ? `Free to change or cancel until ${view.config.complimentaryCutoffMinutes} minutes before it starts.`
        : "Free to change or cancel until it starts. Cancelling returns the minutes to your day."
      : view.config.paidFamilyCancel === "contact"
        ? "To change or cancel a paid reservation, contact Yalla. Any refund or credit is at Yalla’s discretion."
        : `Cancel online until ${view.config.paidCutoffHours} hours before it starts. Any refund or credit is at Yalla’s discretion.`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] motion-safe:animate-[fade_300ms_ease]" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[28px] bg-chalk shadow-[0_-20px_60px_-20px_rgba(41,44,69,0.35)] outline-none motion-safe:animate-[sheet-up_420ms_var(--ease-soft)] sm:max-h-none sm:max-w-[34rem] sm:rounded-none sm:motion-safe:animate-[sheet-in_420ms_var(--ease-soft)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 pt-6 pb-5 sm:px-8 sm:pt-8">
          <div>
            <p className="eyebrow text-[0.6rem] text-ink-soft">
              {CATEGORY_LABEL[ws.category]} · {fmtDay(view.date, "short")}
            </p>
            <h2 id="sheet-title" className="display mt-2 text-[2.2rem]">
              {step === "done" ? (
                <>
                  Your space is <em>all yours.</em>
                </>
              ) : step === "review" ? (
                <>
                  Your time in <em>{ws.name}</em>
                </>
              ) : moving ? (
                <>
                  Change to <em>{ws.name}</em>
                </>
              ) : (
                ws.name
              )}
            </h2>
            {step === "choose" && ws.summary ? <p className="mt-2 text-[0.9rem] text-ink-soft">{ws.summary}</p> : null}
          </div>
          <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/15 hover:border-ink focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none" aria-label="Close">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {/* Step indicator */}
          <ol className="mb-7 flex gap-2" aria-label="Steps">
            {["Choose", "Review", "Confirmed"].map((s, i) => {
              const at = ["choose", "review", "done"].indexOf(step);
              return (
                <li key={s} className="flex flex-1 flex-col gap-1.5" aria-current={i === at ? "step" : undefined}>
                  <span className={`h-[3px] rounded-full transition-colors duration-500 ${i <= at ? "bg-blue" : "bg-ink/10"}`} />
                  <span className={`text-[0.65rem] tracking-[0.12em] uppercase ${i === at ? "text-ink" : "text-ink-soft"}`}>{s}</span>
                </li>
              );
            })}
          </ol>

          {step === "choose" ? (
            <div className="space-y-8">
              {kinds.length === 0 ? (
                <p className="text-ink-soft">{ws.name} can’t be booked online right now.</p>
              ) : (
                <fieldset>
                  <legend className="eyebrow mb-3 text-[0.6rem] text-ink-soft">How would you like to book?</legend>
                  <div className="grid gap-2">
                    {kinds.map((k) => (
                      <label
                        key={k.kind}
                        className={`flex cursor-pointer items-center justify-between gap-4 border px-4 py-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue/40 ${
                          c.kind === k.kind ? "border-ink bg-paper" : "border-line hover:border-ink/40"
                        } ${k.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <span>
                          <input
                            type="radio"
                            name="kind"
                            className="sr-only"
                            checked={c.kind === k.kind}
                            disabled={!!k.disabled}
                            onChange={() =>
                              setC((p) => ({
                                ...p,
                                kind: k.kind,
                                minutes: k.kind === "complimentary" ? (view.config.complimentary.durations.filter((d) => d <= remaining).slice(-1)[0] ?? null) : k.kind === "hourly" ? view.config.hourly.durations[0] : null,
                              }))
                            }
                          />
                          <span className="block">{k.title}</span>
                          <span className="text-[0.8rem] text-ink-soft">{k.disabled ?? k.detail}</span>
                        </span>
                        <span className={`h-4 w-4 shrink-0 rounded-full border transition-all ${c.kind === k.kind ? "border-[5px] border-blue" : "border-ink/30"}`} aria-hidden />
                      </label>
                    ))}
                  </div>
                  {ws.complimentary && ws.pricedTypes.length === 0 && signedIn && allowance && (!allowance.eligible || remaining <= 0) ? (
                    <p className="mt-3 text-[0.82rem] text-ink-soft">
                      {ws.name} is reserved with complimentary time only for now; paid time isn’t offered online yet. Paid options are available in our private offices and desks.
                    </p>
                  ) : null}
                </fieldset>
              )}

              {timed ? (
                <>
                  <fieldset>
                    <legend className="eyebrow mb-3 text-[0.6rem] text-ink-soft">Duration</legend>
                    <div className="flex flex-wrap gap-2">
                      {durations.map((d) => {
                        const over = c.kind === "complimentary" && signedIn && d > remaining;
                        return (
                          <button
                            key={d}
                            type="button"
                            disabled={over}
                            aria-pressed={c.minutes === d}
                            onClick={() => setC((p) => ({ ...p, minutes: d }))}
                            className={`h-10 rounded-full border px-4 text-[0.85rem] transition-all focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-35 ${
                              c.minutes === d ? "border-ink bg-ink text-chalk" : "border-ink/15 hover:border-ink/50"
                            }`}
                          >
                            {d < 60 ? `${d} min` : d % 60 ? `${Math.floor(d / 60)} hr ${d % 60}` : `${d / 60} hr${d > 60 ? "s" : ""}`}
                            {c.kind === "hourly" && priced.hourly != null ? <span className="ml-1.5 opacity-60">{usd(Math.round((priced.hourly * d) / 60))}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="eyebrow mb-3 text-[0.6rem] text-ink-soft">Start time</legend>
                    {starts.length === 0 ? (
                      <p className="text-[0.9rem] text-ink-soft">Looks like this space is spoken for. Try another time or explore a different workspace.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {starts.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={c.start === s}
                            onClick={() => setC((p) => ({ ...p, start: s }))}
                            className={`h-10 rounded-full border text-[0.82rem] tabular-nums transition-all focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none ${
                              c.start === s ? "border-blue bg-blue text-chalk" : "border-ink/12 hover:border-ink/50"
                            }`}
                          >
                            {fmtMin(s)}
                          </button>
                        ))}
                      </div>
                    )}
                    {startOk && c.minutes ? (
                      <p className="mt-4 text-[0.9rem]" aria-live="polite">
                        {fmtRange(c.start!, c.start! + c.minutes)} · {fmtDuration(c.minutes)}
                      </p>
                    ) : null}
                  </fieldset>
                </>
              ) : null}

              {c.kind === "half_day" ? (
                <fieldset>
                  <legend className="eyebrow mb-3 text-[0.6rem] text-ink-soft">Which half?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["morning", "afternoon"] as const)
                      .filter((h) => view.config.halfDay[h])
                      .map((h) => {
                        const w = view.config.halfDay[h]!;
                        const free = windowFree(toMin(w.start), toMin(w.end));
                        const from = fromNow(toMin(w.start), toMin(w.end));
                        const past = from == null;
                        const late = from != null && from !== toMin(w.start);
                        return (
                          <button
                            key={h}
                            type="button"
                            disabled={!free}
                            aria-pressed={c.half === h}
                            onClick={() => setC((p) => ({ ...p, half: h }))}
                            className={`border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none disabled:opacity-40 ${c.half === h ? "border-ink bg-paper" : "border-line hover:border-ink/40"}`}
                          >
                            <span className="block capitalize">{h}</span>
                            <span className="text-[0.8rem] text-ink-soft">{free ? (late ? `${fmtRange(from!, toMin(w.end))} · ${usd(prorate(priced.half_day, toMin(w.start), toMin(w.end))!)} prorated` : fmtRange(toMin(w.start), toMin(w.end))) : past ? "Ended" : "Reserved"}</span>
                          </button>
                        );
                      })}
                  </div>
                </fieldset>
              ) : null}

              {c.kind === "full_day" ? (
                <p className="text-[0.95rem]">
                  {fmtDay(view.date)}, {fmtRange(fdFrom ?? fd.a, fd.b)}
                  {fdFrom != null && fdFrom !== fd.a ? (
                    <span className="mt-2 block text-[0.88rem] text-ink-soft">Today’s session is already underway, so you’ll pay only for the time that’s left.</span>
                  ) : null}
                  {fdFrom != null && !windowFree(fd.a, fd.b) ? <span className="mt-2 block text-[0.88rem] text-ink-soft">Part of this day is already reserved. Try another date.</span> : null}
                </p>
              ) : null}

              {c.kind === "week" ? (
                <div className="text-[0.95rem]">
                  {view.config.week.mode !== "calendar" ? (
                    <fieldset className="mb-5">
                      <legend className="eyebrow mb-3 text-[0.6rem] text-ink-soft">Choose your first day</legend>
                      <div className="no-scrollbar -mx-6 flex gap-1.5 overflow-x-auto px-6 pb-1 sm:-mx-8 sm:px-8">
                        {weekStarts.map((d) => (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={weekStart === d}
                            onClick={() => setWeekStart(d)}
                            aria-label={`Start on ${fmtDay(d)}`}
                            className={`flex h-[4rem] w-12 shrink-0 flex-col items-center justify-center rounded-t-full border transition-colors ${
                              weekStart === d ? "border-ink bg-ink text-chalk" : weekSpan.includes(d) ? "border-ink/40 bg-mist/60" : "border-ink/10 hover:border-ink/40"
                            }`}
                          >
                            <span className="eyebrow mt-2 text-[0.5rem]">{fmtDay(d, "weekday").slice(0, 2)}</span>
                            <span className="font-serif text-[1.05rem] leading-tight">{fmtDay(d, "num")}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <p>
                    {fmtDay(weekSpan[0], "short")} – {fmtDay(weekSpan[weekSpan.length - 1], "short")}, {fmtRange(toMin(view.config.fullDay.start), toMin(view.config.fullDay.end))} each day
                  </p>
                </div>
              ) : null}

              {problem ? (
                <p role="alert" className="border-l-2 border-oxblood/40 pl-4 text-[0.9rem] text-oxblood">
                  {problem}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "review" && q ? (
            <div className="space-y-6">
              <dl className="divide-y divide-line border-y border-line">
                <Row label="Space" value={`${ws.name} · ${CATEGORY_LABEL[ws.category]}`} />
                <Row label={q.intervals.length > 1 ? "Dates" : "Date"} value={q.intervals.length > 1 ? `${fmtDay(q.intervals[0].localDate, "short")} – ${fmtDay(q.intervals[q.intervals.length - 1].localDate, "short")}` : fmtDay(q.intervals[0].localDate)} />
                <Row
                  label="Time"
                  value={
                    q.intervals.length > 1
                      ? `${fmtRange(laMinutes(q.intervals[q.intervals.length - 1].startsAt), laMinutes(q.intervals[q.intervals.length - 1].endsAt))} each day${
                          laMinutes(q.intervals[0].startsAt) !== laMinutes(q.intervals[q.intervals.length - 1].startsAt) ? ` (from ${fmtMin(laMinutes(q.intervals[0].startsAt))} on the first day)` : ""
                        }`
                      : fmtRange(laMinutes(q.intervals[0].startsAt), laMinutes(q.intervals[0].endsAt))
                  }
                />
                <Row label="Duration" value={q.bookingType === "week" ? `${q.intervals.length} days` : q.proratedFromCents != null ? fmtDuration(q.minutes) : q.bookingType === "full_day" ? "Full day" : q.bookingType === "half_day" ? "Half day" : fmtDuration(q.minutes)} />
              </dl>
              <dl className="space-y-2 text-[0.95rem]">
                {q.bookingType === "complimentary" ? (
                  <div className="flex justify-between gap-4">
                    <dt>Tuition benefit</dt>
                    <dd className="text-blue">Included</dd>
                  </div>
                ) : (
                  <div className="flex justify-between gap-4">
                    <dt>
                      {KIND_LABEL[q.bookingType]}
                      {q.bookingType === "hourly" ? ` · ${fmtDuration(q.minutes)}` : ""}
                      {q.proratedFromCents != null ? " · prorated" : ""}
                    </dt>
                    <dd className="tabular-nums">
                      {q.proratedFromCents != null ? <span className="mr-2 text-ink-soft line-through">{usd(q.proratedFromCents)}</span> : null}
                      {usd(q.priceCents)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-line pt-3">
                  <dt className="display text-[1.4rem]">Total</dt>
                  <dd className="display text-[1.4rem] tabular-nums">{usd(total)}</dd>
                </div>
              </dl>
              <p className="text-[0.82rem] text-ink-soft">{policy}</p>
              {!signedIn ? (
                <p className="border-l-2 border-oxblood/40 pl-4 text-[0.85rem] text-oxblood">
                  This is a preview. <Link href="/portal?signin=1&next=/portal/spaces" className="underline underline-offset-4">Sign in</Link> to reserve.
                </p>
              ) : null}
              {problem ? (
                <p role="alert" className="border-l-2 border-oxblood/40 pl-4 text-[0.9rem] text-oxblood">
                  {problem}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "done" ? (
            <div className="space-y-6 motion-safe:animate-[rise_600ms_var(--ease-soft)]">
              <Mark name="dotsun" className="h-12 w-auto text-blue" />
              <dl className="divide-y divide-line border-y border-line">
                <Row label="Space" value={ws.name} />
                {q ? <Row label="When" value={`${fmtDay(q.intervals[0].localDate, "short")}, ${fmtRange(laMinutes(q.intervals[0].startsAt), laMinutes(q.intervals[0].endsAt))}`} /> : null}
                {q ? <Row label="Duration" value={fmtDuration(q.minutes)} /> : null}
                <Row label="Status" value="Confirmed" />
                <Row label="Confirmation" value={doneRef ?? ""} />
                <Row label="Price" value={total ? usd(total) : "Included with tuition"} />
              </dl>
              <div className="flex flex-wrap gap-3">
                <Link href="/portal/spaces/reservations" className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-[0.88rem] text-chalk hover:bg-blue">
                  View my reservations
                </Link>
                <button onClick={onClose} className="inline-flex h-11 items-center rounded-full border border-ink/20 px-5 text-[0.88rem] hover:border-ink">
                  Book another space
                </button>
                {doneRef ? (
                  <a href={`/portal/spaces/ics/${doneRef}`} className="inline-flex h-11 items-center px-2 text-[0.88rem] text-blue underline-offset-4 hover:underline">
                    Add to calendar
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {step !== "done" ? (
          <div className="flex items-center justify-between gap-4 border-t border-line bg-paper px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">
            {step === "review" ? (
              <button onClick={() => setStep("choose")} className="text-[0.88rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                Back
              </button>
            ) : (
              <span className="text-[0.85rem] text-ink-soft" aria-live="polite">
                {c.kind === "complimentary" ? "Included with tuition" : c.kind && priced[c.kind] != null ? (c.kind === "hourly" && c.minutes
                      ? usd(Math.round((priced.hourly * c.minutes) / 60))
                      : c.kind === "full_day"
                        ? usd(prorate(priced.full_day, fd.a, fd.b) ?? priced.full_day)
                        : c.kind === "half_day" && halfWindow
                          ? usd(prorate(priced.half_day, toMin(halfWindow.start), toMin(halfWindow.end)) ?? priced.half_day)
                          : usd(priced[c.kind])) : ""}
              </span>
            )}
            {step === "choose" ? (
              <button
                onClick={review}
                disabled={!input || pending}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[0.9rem] text-chalk transition-colors hover:bg-blue disabled:cursor-not-allowed disabled:opacity-35"
              >
                {pending ? <Spinner /> : null}
                Review
              </button>
            ) : (
              <button
                onClick={confirm}
                disabled={pending || !signedIn}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[0.9rem] text-chalk transition-colors hover:bg-blue disabled:cursor-not-allowed disabled:opacity-35"
              >
                {pending ? <Spinner /> : null}
                {moving ? "Confirm new time" : total > 0 ? `Continue to payment · ${usd(total)}` : "Confirm reservation"}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="text-[0.85rem] text-ink-soft">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
}
