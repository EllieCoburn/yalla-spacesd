"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { loadDay, move, quote, reserve } from "@/app/(site)/portal/spaces/actions";
import { Mark } from "@/components/brand/Mark";
import type { BusyInterval, DayView, MyReservation, PublicWorkspace } from "@/lib/spaces/availability";
import type { Allowance, Quote, ReserveInput } from "@/lib/spaces/engine";
import { addDays, fmtDay, fmtDuration, fmtMin, fmtRange, laMinutes, toHHMM, toMin, usd, weekday } from "./time";


type Category = PublicWorkspace["category"];
type Me = { allowance: Allowance; mine: { workspaceId: string; start: string; end: string; reference: string }[] } | null;
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
  const opens = workspaces.filter((w) => w.hours).map((w) => toMin(w.hours![0]));
  const closes = workspaces.filter((w) => w.hours).map((w) => toMin(w.hours![1]));
  const from = Math.floor((opens.length ? Math.min(...opens) : 510) / 30) * 30;
  const to = Math.ceil((closes.length ? Math.max(...closes) : 990) / 30) * 30;
  const span = to - from;
  const pct = (m: number) => `${((Math.min(Math.max(m, from), to) - from) / span) * 100}%`;
  const ticks: number[] = [];
  for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) ticks.push(m);
  const [hover, setHover] = useState<{ id: string; m: number } | null>(null);
  const trackRef = useRef<Record<string, HTMLDivElement | null>>({});

  return (
    <div className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] overflow-x-auto px-[clamp(1.25rem,4vw,3.5rem)]">
      <div className="min-w-[44rem]">
        {/* Time markers */}
        <div className="grid grid-cols-[7.5rem_1fr] sm:grid-cols-[10rem_1fr]">
          <div className="sticky left-0 z-10 bg-chalk" />
          <div className="relative h-7" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 text-[0.7rem] text-ink-soft tabular-nums" style={{ left: pct(t) }}>
                {fmtMin(t, { compact: true })}
              </span>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {workspaces.map((w) => {
            const mine = (me?.mine ?? []).filter((m) => m.workspaceId === w.id && !skip.some((s) => s.start === m.start && s.end === m.end));
            // The family's own reservations are drawn as "Yours", not as someone else's "Reserved".
            const busy = localBusy(view.busy, w.id, [...skip, ...mine]);
            const allBusy = localBusy(view.busy, w.id, skip);
            const open = w.hours ? toMin(w.hours[0]) : null;
            const close = w.hours ? toMin(w.hours[1]) : null;
            const pickable = w.bookingTypes.some((b) => b === "complimentary" || b === "hourly");
            const freeText = !w.hours
              ? "Closed"
              : (() => {
                  const parts: string[] = [];
                  let cursor = Math.max(open!, nowMin ?? 0);
                  for (const b of [...allBusy].sort((a, c) => a.start - c.start)) {
                    if (b.start > cursor) parts.push(fmtRange(cursor, Math.min(b.start, close!)));
                    cursor = Math.max(cursor, b.end);
                  }
                  if (cursor < close!) parts.push(fmtRange(cursor, close!));
                  return parts.length ? `Available ${parts.join(", ")}` : "Fully reserved";
                })();
            return (
              <li key={w.id} className="grid grid-cols-[7.5rem_1fr] items-stretch sm:grid-cols-[10rem_1fr]">
                <div className="sticky left-0 z-10 flex flex-col justify-center bg-chalk py-3 pr-4">
                  <button
                    onClick={() => onPick(w.id, -1)}
                    className="text-left font-serif text-[1.15rem] leading-tight hover:text-blue focus-visible:text-blue focus-visible:outline-none"
                    aria-label={`Reserve ${w.name}, ${CATEGORY_LABEL[w.category]}. ${freeText}.`}
                  >
                    {w.name}
                  </button>
                  <span className="text-[0.68rem] tracking-[0.08em] text-ink-soft uppercase">{CATEGORY_LABEL[w.category]}</span>
                </div>
                <div
                  ref={(el) => {
                    trackRef.current[w.id] = el;
                  }}
                  className={`relative my-2.5 h-12 rounded-md ${w.hours ? "cursor-pointer" : ""}`}
                  aria-hidden
                  onMouseMove={(e) => {
                    if (!w.hours || !pickable) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    const m = from + ((e.clientX - r.left) / r.width) * span;
                    const slot = Math.floor(m / view.config.slotMinutes) * view.config.slotMinutes;
                    setHover({ id: w.id, m: slot });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    if (!w.hours) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    const m = from + ((e.clientX - r.left) / r.width) * span;
                    const slot = Math.floor(m / view.config.slotMinutes) * view.config.slotMinutes;
                    onPick(w.id, pickable ? slot : -1);
                  }}
                >
                  {/* Closed outside opening hours */}
                  <div className="hatch absolute inset-0 rounded-md" />
                  {w.hours ? <div className="absolute inset-y-0 rounded-md border border-blue/20 bg-paper" style={{ left: pct(open!), width: `calc(${pct(close!)} - ${pct(open!)})` }} /> : null}
                  {ticks.map((t) => (
                    <span key={t} className="absolute inset-y-1 w-px bg-ink/[0.06]" style={{ left: pct(t) }} />
                  ))}
                  {nowMin != null && w.hours && nowMin > open! ? (
                    <div className="absolute inset-y-0 rounded-l-md bg-chalk/70" style={{ left: pct(open!), width: `calc(${pct(Math.min(nowMin, close!))} - ${pct(open!)})` }} />
                  ) : null}
                  {busy.map((b, i) => (
                    <div
                      key={i}
                      title={`${b.status === "reserved" ? "Reserved" : "Unavailable"} · ${fmtRange(b.start, b.end)}`}
                      className={`absolute inset-y-1 flex items-center overflow-hidden rounded-[5px] px-2 text-[0.68rem] tracking-[0.06em] text-ink/55 uppercase ${b.status === "reserved" ? "bg-ink/[0.12]" : "hatch-dark"}`}
                      style={{ left: pct(b.start), width: `calc(${pct(b.end)} - ${pct(b.start)})` }}
                    >
                      {b.end - b.start >= 60 ? <span className="truncate">{b.status === "reserved" ? "Reserved" : "Unavailable"}</span> : null}
                    </div>
                  ))}
                  {mine.map((m) => (
                    <div
                      key={m.reference + m.start}
                      title={`Yours · ${fmtRange(laMinutes(m.start), laMinutes(m.end))}`}
                      className="absolute inset-y-1 flex items-center overflow-hidden rounded-[5px] bg-blue/25 px-2 text-[0.68rem] tracking-[0.06em] text-blue uppercase ring-1 ring-blue/50 ring-inset"
                      style={{ left: pct(laMinutes(m.start)), width: `calc(${pct(laMinutes(m.end))} - ${pct(laMinutes(m.start))})` }}
                    >
                      {laMinutes(m.end) - laMinutes(m.start) >= 45 ? <span className="truncate">Yours</span> : null}
                    </div>
                  ))}
                  {hover && hover.id === w.id && w.hours && hover.m >= open! && hover.m < close! ? (
                    <div
                      className="pointer-events-none absolute inset-y-0.5 rounded-[5px] border border-blue bg-blue/10 transition-[left] duration-100"
                      style={{ left: pct(hover.m), width: `calc(${pct(hover.m + view.config.slotMinutes)} - ${pct(hover.m)})` }}
                    >
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-ink px-2 py-0.5 text-[0.65rem] whitespace-nowrap text-chalk">{fmtMin(hover.m)}</span>
                    </div>
                  ) : null}
                  {nowMin != null && nowMin >= from && nowMin <= to ? (
                    <span className="absolute -inset-y-1 w-px bg-oxblood/70" style={{ left: pct(nowMin) }}>
                      <span className="absolute -top-1 -left-[3px] h-[7px] w-[7px] rounded-full bg-oxblood" />
                    </span>
                  ) : null}
                </div>
                <p className="sr-only">
                  {w.name}: {freeText}.
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[0.78rem] text-ink-soft">Tap an open time to start a reservation. Availability refreshes automatically.</p>
      </div>
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

  const kinds: { kind: Kind; title: string; detail: string; disabled?: string }[] = [];
  if (ws.complimentary)
    kinds.push({
      kind: "complimentary",
      title: "Complimentary time",
      detail: !signedIn ? "Included with tuition for eligible families" : !allowance?.eligible ? (allowance?.reason ?? "Not included") : `${remaining} of ${allowance.dailyMinutes} minutes left`,
      disabled: signedIn && allowance && (!allowance.eligible || remaining <= 0) ? (allowance.eligible ? "You’ve used your complimentary workspace time for this day." : "Not included for your family") : undefined,
    });
  if (!moving) {
    if (priced.hourly != null) kinds.push({ kind: "hourly", title: "By the hour", detail: `${usd(priced.hourly)} / hour` });
    if (priced.half_day != null && (view.config.halfDay.morning || view.config.halfDay.afternoon)) kinds.push({ kind: "half_day", title: "Half day", detail: `${usd(priced.half_day)}` });
    if (priced.full_day != null) kinds.push({ kind: "full_day", title: "Full day", detail: `${usd(priced.full_day)} · ${fmtRange(toMin(view.config.fullDay.start), toMin(view.config.fullDay.end))}` });
    if (priced.week != null) kinds.push({ kind: "week", title: "Week", detail: `${usd(priced.week)} · ${view.config.week.mode === "calendar" ? "Monday – Friday" : `${view.config.week.days} days`}` });
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
  const windowFree = (a: number, b: number) => !busy.some((x) => a < x.end && b > x.start) && (nowMin == null || a > nowMin);

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
        : { workspaceId: ws.id, bookingType: c.kind, date: view.date };

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
                  {ws.complimentary && ws.pricedTypes.length === 0 && signedIn && allowance?.eligible && remaining <= 0 ? (
                    <p className="mt-3 text-[0.82rem] text-ink-soft">Additional time in {ws.name} isn’t available to book online yet.</p>
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
                        const past = nowMin != null && toMin(w.start) <= nowMin;
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
                            <span className="text-[0.8rem] text-ink-soft">{free ? fmtRange(toMin(w.start), toMin(w.end)) : past ? "Already started" : "Reserved"}</span>
                          </button>
                        );
                      })}
                  </div>
                </fieldset>
              ) : null}

              {c.kind === "full_day" ? (
                <p className="text-[0.95rem]">
                  {fmtDay(view.date)}, {fmtRange(toMin(view.config.fullDay.start), toMin(view.config.fullDay.end))}
                  {!windowFree(toMin(view.config.fullDay.start), toMin(view.config.fullDay.end)) ? <span className="mt-2 block text-[0.88rem] text-ink-soft">Part of this day is already reserved. Try another date.</span> : null}
                </p>
              ) : null}

              {c.kind === "week" ? (
                <div className="text-[0.95rem]">
                  <p>
                    {fmtDay(view.weekDates[0], "short")} – {fmtDay(view.weekDates[view.weekDates.length - 1], "short")}, {fmtRange(toMin(view.config.fullDay.start), toMin(view.config.fullDay.end))} each day
                  </p>
                  <p className="mt-2 text-[0.85rem] text-ink-soft">We’ll check every day of the week before you pay. A week is booked whole or not at all.</p>
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
                <Row label="Time" value={`${fmtRange(laMinutes(q.intervals[0].startsAt), laMinutes(q.intervals[0].endsAt))}${q.intervals.length > 1 ? " each day" : ""}`} />
                <Row label="Duration" value={q.bookingType === "week" ? `${q.intervals.length} days` : q.bookingType === "full_day" ? "Full day" : q.bookingType === "half_day" ? "Half day" : fmtDuration(q.minutes)} />
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
                    </dt>
                    <dd className="tabular-nums">{usd(q.priceCents)}</dd>
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
                {c.kind === "complimentary" ? "Included with tuition" : c.kind && priced[c.kind] != null ? (c.kind === "hourly" && c.minutes ? usd(Math.round((priced.hourly * c.minutes) / 60)) : usd(priced[c.kind])) : ""}
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
