"use client";

import { addDays, format, isSameDay, startOfDay } from "date-fns";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { availabilityFor, previewSessions, type PreviewSession } from "@/lib/booking/preview";
import type { ProgramKind } from "@/lib/booking/types";
import { Checkout } from "./Checkout";

export const offerings: { kind: ProgramKind | "all"; label: string }[] = [
  { kind: "all", label: "Everything" },
  { kind: "drop_in", label: "Yalla Flex" },
  { kind: "weekend", label: "Yalla Weekends" },
  { kind: "parents_night", label: "Yalla After Hours" },
  { kind: "camp", label: "Camp Yalla" },
  { kind: "happening", label: "Yalla Happenings" },
];

export const ageBands = [
  { label: "Any age", months: undefined },
  { label: "4–11 months", months: 8 },
  { label: "1 year", months: 18 },
  { label: "2 years", months: 30 },
  { label: "3 years", months: 42 },
  { label: "4–5 years", months: 54 },
] as const;

const DAYS = 42;

export function BookingExplorer() {
  const params = useSearchParams();
  const router = useRouter();
  const [offering, setOffering] = useState<ProgramKind | "all">((params.get("offering") as ProgramKind) || "all");
  const [ageIdx, setAgeIdx] = useState(0);
  const [day, setDay] = useState<string | null>(params.get("date"));
  const [selected, setSelected] = useState<string[]>([]);
  const [sessions, setSessions] = useState<PreviewSession[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dayLimit, setDayLimit] = useState(7);

  // Sessions are generated on the client so "today" is the visitor's today.
  useEffect(() => {
    const from = addDays(startOfDay(new Date()), 1);
    setSessions(previewSessions({ from: format(from, "yyyy-MM-dd"), to: format(addDays(from, DAYS - 1), "yyyy-MM-dd") }));
  }, []);

  // Keep the URL shareable.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (offering !== "all") sp.set("offering", offering);
    if (day) sp.set("date", day);
    router.replace(`/book${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  }, [offering, day, router]);

  const childAge = ageBands[ageIdx].months;
  const byKind = useMemo(() => sessions.filter((s) => offering === "all" || s.kind === offering), [sessions, offering]);
  const days = useMemo(() => {
    const from = addDays(startOfDay(new Date()), 1);
    return Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  }, []);
  const visible = useMemo(() => (day ? byKind.filter((s) => format(new Date(s.startsAt), "yyyy-MM-dd") === day) : byKind), [byKind, day]);

  const grouped = useMemo(() => {
    const m = new Map<string, PreviewSession[]>();
    for (const s of visible) {
      const k = format(new Date(s.startsAt), "yyyy-MM-dd");
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [visible]);
  const shown = day ? grouped : grouped.slice(0, dayLimit);

  const selectedSessions = sessions.filter((s) => selected.includes(s.id));

  function toggle(s: PreviewSession) {
    // Camps book as a whole week.
    const ids = s.groupId ? sessions.filter((x) => x.groupId === s.groupId).map((x) => x.id) : [s.id];
    setSelected((cur) => (cur.includes(s.id) ? cur.filter((id) => !ids.includes(id)) : [...cur, ...ids.filter((id) => !cur.includes(id))]));
  }

  return (
    <div className="pb-32 lg:pb-24">
      {/* Filters */}
      <div className="sticky top-16 z-30 border-y border-line bg-chalk/90 backdrop-blur-xl">
        <div className="shell py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] flex gap-2 overflow-x-auto px-[clamp(1.25rem,4vw,3.5rem)] lg:mx-0 lg:px-0">
              {offerings.map((o) => (
                <button
                  key={o.kind}
                  onClick={() => setOffering(o.kind)}
                  aria-pressed={offering === o.kind}
                  className={`h-10 shrink-0 rounded-full border px-4 text-[0.85rem] transition-all duration-300 ${
                    offering === o.kind ? "border-ink bg-ink text-chalk" : "border-ink/15 text-ink/80 hover:border-ink/50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 text-[0.85rem]">
              <span className="eyebrow text-[0.6rem] text-ink-soft">Child’s age</span>
              <select
                value={ageIdx}
                onChange={(e) => setAgeIdx(Number(e.target.value))}
                className="h-10 appearance-none rounded-full border border-ink/15 bg-transparent bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22><path d=%22M1 1l4 4 4-4%22 fill=%22none%22 stroke=%22%23292c45%22/></svg>')] bg-[length:10px_6px] bg-[position:right_1rem_center] bg-no-repeat pr-10 pl-4 text-[0.85rem] focus:border-ink focus:ring-0 focus:outline-none"
              >
                {ageBands.map((b, i) => (
                  <option key={b.label} value={i}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Date strip */}
          <div className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] mt-4 flex gap-1.5 overflow-x-auto px-[clamp(1.25rem,4vw,3.5rem)] pb-1">
            <button
              onClick={() => setDay(null)}
              className={`flex h-[4.25rem] w-16 shrink-0 flex-col items-center justify-center rounded-t-full border text-[0.7rem] transition-all ${
                day === null ? "border-blue bg-blue text-chalk" : "border-ink/10 hover:border-ink/40"
              }`}
            >
              <span className="eyebrow mt-2 text-[0.55rem]">All</span>
              <span className="font-serif text-[0.85rem] italic">dates</span>
            </button>
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const daySessions = byKind.filter((s) => isSameDay(new Date(s.startsAt), d));
              const has = daySessions.length > 0;
              const active = day === key;
              const sel = daySessions.some((s) => selected.includes(s.id));
              return (
                <button
                  key={key}
                  disabled={!has}
                  onClick={() => setDay(active ? null : key)}
                  className={`relative flex h-[4.25rem] w-12 shrink-0 flex-col items-center justify-center rounded-t-full border transition-all ${
                    active ? "border-ink bg-ink text-chalk" : has ? "border-ink/10 hover:border-ink/40" : "border-transparent text-ink/25"
                  }`}
                >
                  <span className="eyebrow mt-2 text-[0.5rem]">{format(d, "EEEEE")}</span>
                  <span className="font-serif text-[1.05rem] leading-tight">{format(d, "d")}</span>
                  {d.getDate() === 1 ? <span className="absolute -top-0.5 text-[0.5rem] tracking-widest uppercase">{format(d, "MMM")}</span> : null}
                  <span className={`mt-0.5 h-1 w-1 rounded-full ${sel ? "bg-blue" : has ? (active ? "bg-chalk/60" : "bg-ink/30") : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="shell mt-10 grid gap-12 lg:grid-cols-12">
        {/* Sessions */}
        <div className="lg:col-span-8">
          {sessions.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-24 animate-pulse bg-sand/50" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-24 text-center">
              <Mark name="sun" className="mx-auto h-10 w-10 text-blue" />
              <p className="display mt-6 text-[1.8rem]">Nothing scheduled here yet.</p>
              <p className="mt-2 text-ink-soft">Try another date or offering.</p>
            </div>
          ) : (
            <div className="space-y-12">
              {shown.map(([key, list]) => (
                <section key={key}>
                  <h2 className="flex items-baseline gap-4">
                    <span className="display text-[1.9rem]">{format(new Date(key + "T00:00:00"), "EEEE")}</span>
                    <span className="font-serif text-ink-soft italic">{format(new Date(key + "T00:00:00"), "d MMMM")}</span>
                  </h2>
                  <ul className="mt-4 space-y-3">
                    {list.map((s) => (
                      <SessionRow key={s.id} s={s} childAge={childAge} selected={selected.includes(s.id)} onToggle={() => toggle(s)} />
                    ))}
                  </ul>
                </section>
              ))}
              {!day && grouped.length > shown.length ? (
                <button
                  onClick={() => setDayLimit((n) => n + 7)}
                  className="h-12 w-full rounded-full border border-ink/20 text-[0.9rem] transition-colors hover:border-ink"
                >
                  Show more dates
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Basket (desktop) */}
        <aside className="hidden lg:col-span-4 lg:block">
          <div className="sticky top-[17rem]">
            <Basket sessions={selectedSessions} onRemove={toggle} onContinue={() => setCheckoutOpen(true)} />
          </div>
        </aside>
      </div>

      {/* Basket (mobile) */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-chalk/95 backdrop-blur-xl transition-transform duration-500 ease-[var(--ease-soft)] lg:hidden ${
          selected.length ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {sheetOpen ? (
          <div className="max-h-[60vh] overflow-y-auto px-5 pt-5">
            <Basket sessions={selectedSessions} onRemove={toggle} onContinue={() => setCheckoutOpen(true)} compact />
          </div>
        ) : null}
        <div className="flex items-center gap-3 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={() => setSheetOpen((v) => !v)} className="flex-1 text-left">
            <span className="block text-[0.95rem]">
              {selected.length} session{selected.length === 1 ? "" : "s"} selected
            </span>
            <span className="text-[0.75rem] text-ink-soft">{sheetOpen ? "Hide" : "Review selection"}</span>
          </button>
          <button onClick={() => setCheckoutOpen(true)} className="h-12 rounded-full bg-ink px-6 text-[0.9rem] text-chalk">
            Continue
          </button>
        </div>
      </div>

      {checkoutOpen ? (
        <Checkout
          sessions={selectedSessions}
          onClose={() => setCheckoutOpen(false)}
          onDone={() => {
            setSelected([]);
            setSheetOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

const kindName: Record<ProgramKind, string> = {
  membership: "Yalla Everyday",
  drop_in: "Yalla Flex · Drop-in",
  nature: "Yalla Outside",
  weekend: "Yalla Weekends",
  happening: "Yalla Happenings",
  parents_night: "Yalla After Hours",
  camp: "Camp Yalla",
  private_event: "Yalla Celebrations",
};

function SessionRow({ s, childAge, selected, onToggle }: { s: PreviewSession; childAge?: number; selected: boolean; onToggle: () => void }) {
  const a = availabilityFor(s, childAge);
  const start = new Date(s.startsAt);
  const end = new Date(s.endsAt);
  const disabled = a.state === "ineligible";
  return (
    <li>
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={selected}
        className={`group grid w-full grid-cols-[1fr_auto] items-center gap-4 border p-5 text-left transition-all duration-300 sm:grid-cols-[8rem_1fr_auto] sm:p-6 ${
          selected ? "border-blue bg-blue/[0.06]" : "border-line bg-paper hover:border-ink/40"
        } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
      >
        <span className="hidden font-serif text-[1.05rem] sm:block">
          {format(start, "h:mmaaa")}
          <span className="block text-[0.85rem] text-ink-soft">to {format(end, "h:mmaaa")}</span>
        </span>
        <span>
          <span className="eyebrow block text-[0.58rem] text-ink-soft">{kindName[s.kind]}</span>
          <span className="display mt-1 block text-[1.35rem]">{s.title}</span>
          <span className="mt-1 block text-[0.82rem] text-ink-soft sm:hidden">
            {format(start, "h:mmaaa")} – {format(end, "h:mmaaa")}
          </span>
          {s.groupId ? <span className="mt-1 block text-[0.8rem] text-ink-soft">Books as a full week</span> : null}
        </span>
        <span className="flex items-center gap-4">
          <span className="hidden text-right text-[0.8rem] sm:block">
            {a.state === "open" && <span className="text-ink-soft">{a.remaining} spaces</span>}
            {a.state === "limited" && <span className="text-oxblood">Only {a.remaining} left</span>}
            {a.state === "full" && <span className="text-ink-soft">Full · waitlist</span>}
            {a.state === "ineligible" && <span className="text-ink-soft">{a.reason}</span>}
          </span>
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-300 ${
              selected ? "border-blue bg-blue text-chalk" : "border-ink/20 group-hover:border-ink"
            }`}
          >
            {selected ? (
              <svg viewBox="0 0 14 10" className="h-2.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M1 5l4 4 8-8" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M6 0v12M0 6h12" />
              </svg>
            )}
          </span>
        </span>
        <span className="col-span-2 text-[0.78rem] sm:hidden">
          {a.state === "open" && <span className="text-ink-soft">{a.remaining} spaces</span>}
          {a.state === "limited" && <span className="text-oxblood">Only {a.remaining} left</span>}
          {a.state === "full" && <span className="text-ink-soft">Full · join the waitlist</span>}
          {a.state === "ineligible" && <span className="text-ink-soft">{a.reason}</span>}
        </span>
      </button>
    </li>
  );
}

function Basket({
  sessions,
  onRemove,
  onContinue,
  compact,
}: {
  sessions: PreviewSession[];
  onRemove: (s: PreviewSession) => void;
  onContinue: () => void;
  compact?: boolean;
}) {
  const sorted = [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <div className={compact ? "" : "border border-line bg-paper p-7"}>
      {!compact ? (
        <>
          <Mark name="roofline" className="h-3.5 w-auto text-blue" />
          <p className="display mt-6 text-[1.6rem]">Your selection</p>
        </>
      ) : null}
      {sorted.length === 0 ? (
        <p className="mt-3 text-[0.92rem] text-ink-soft">Choose sessions from the calendar. They’ll gather here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {sorted.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <span>
                <span className="block text-[0.92rem]">{s.title}</span>
                <span className="text-[0.78rem] text-ink-soft">
                  {format(new Date(s.startsAt), "EEE d MMM · h:mmaaa")}
                  {availabilityFor(s).state === "full" ? " · waitlist" : ""}
                </span>
              </span>
              <button onClick={() => onRemove(s)} className="text-[0.75rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {!compact ? (
        <>
          <button
            onClick={onContinue}
            disabled={!sorted.length}
            className="mt-6 h-12 w-full rounded-full bg-ink text-[0.9rem] text-chalk transition-colors duration-500 hover:bg-blue disabled:cursor-not-allowed disabled:opacity-30"
          >
            Continue
          </button>
          <p className="mt-5 text-[0.78rem] text-ink-soft">
            Already a Yalla family?{" "}
            <Link href="/portal" className="underline underline-offset-4">
              Sign in
            </Link>{" "}
            to book with saved details.
          </p>
        </>
      ) : null}
    </div>
  );
}
