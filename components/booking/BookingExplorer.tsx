"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import type { PublicSession } from "@/lib/ops/public-booking";
import { addDaysISO, fmtDate, fmtTime, todayLA } from "@/lib/time";
import { Checkout, type SavedChild, type SignedInGuardian } from "./Checkout";
import { WaitlistForm } from "./WaitlistForm";
import { FAMILY_RATE, familyRateKey } from "@/lib/booking/family-rate";
import { stateLabel, usd } from "./format";

export const offerings: { kind: string; label: string }[] = [
  { kind: "all", label: "Everything" },
  { kind: "drop_in", label: "Yalla Flex" },
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
  { label: "6 years", months: 78 },
  { label: "7–10 years", months: 102 },
] as const;

const DAYS = 42;
export function BookingExplorer({
  guardian,
  savedChildren,
  wallet = null,
  sibling = { percent: 0, withPass: false },
}: {
  guardian: SignedInGuardian | null;
  savedChildren: SavedChild[];
  /** The signed-in family's Yalla Wallet. */
  wallet?: { passCents: number; creditCents: number } | null;
  /** The sibling discount (Settings → Billing). */
  sibling?: { percent: number; withPass: boolean };
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [offering, setOffering] = useState<string>(
    // Yalla Weekends is now part of Happenings; old links still land in the right place.
    ["weekend", "parents_night"].includes(params.get("offering") ?? "") ? "happening" : params.get("offering") || "all",
  );
  const [ageIdx, setAgeIdx] = useState(0);
  const [day, setDay] = useState<string | null>(params.get("date"));
  const [selected, setSelected] = useState<string[]>([]);
  /** Spots per selected session: one spot is one child. */
  const [spots, setSpots] = useState<Record<string, number>>({});
  /** Age groups of one Happening chosen together on the calendar: matched to children by age at checkout. */
  const [flexible, setFlexible] = useState<string[]>([]);
  /** Extras chosen per session in Your selection (Yalla Flex half day, Early Bird). */
  const [sessionExtras, setSessionExtras] = useState<Record<string, string[]>>({});
  const toggleSessionExtra = (sessionId: string, key: string, on: boolean, exclusive?: string[]) =>
    setSessionExtras((cur) => {
      const list = (cur[sessionId] ?? []).filter((k) => k !== key && !(exclusive ?? []).includes(k));
      return { ...cur, [sessionId]: on ? [...list, key] : list };
    });
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dayLimit, setDayLimit] = useState(7);
  const [waitlistFor, setWaitlistFor] = useState<PublicSession | null>(null);
  const today = useMemo(() => todayLA(), []);
  // The calendar shows six weeks. A link to a later date (e.g. a camp day in February) starts the
  // window a few days before that date instead, so it loads and shows straight away.
  const start = useMemo(() => {
    const linked = params.get("date");
    return linked &&
      /^\d{4}-\d{2}-\d{2}$/.test(linked) &&
      linked > addDaysISO(today, DAYS - 1)
      ? addDaysISO(linked, -3)
      : today;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  // Days chosen elsewhere (e.g. several camp days on the camp page) arrive as ?select=…&until=…
  // and go straight into the basket.
  const preselect = useMemo(
    () =>
      (params.get("select") ?? "")
        .split(",")
        .filter(Boolean)
        .slice(0, 60)
        .map((x) => {
          const [id, n] = x.split("*");
          return { id, n: Math.min(8, Math.max(1, Number(n) || 1)) };
        }),
    [],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const until = useMemo(() => {
    const u = params.get("until");
    return u && /^\d{4}-\d{2}-\d{2}$/.test(u) ? u : null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Children already chosen by name on a program page arrive as ?children=… and start ticked.
  const comingKids = useMemo(
    () =>
      (params.get("children") ?? "").split(",").filter(Boolean).slice(0, 12),
    [],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const comingExtras = useMemo(() => (params.get("extras") ?? "").split(",").filter(Boolean).slice(0, 6), []); // eslint-disable-line react-hooks/exhaustive-deps
  const preselected = useRef(false);

  const load = useCallback(async () => {
    try {
      const end =
        until && until > addDaysISO(start, DAYS - 1)
          ? until
          : addDaysISO(start, DAYS - 1);
      const found: PublicSession[] = [];
      let err: string | null = null;
      // The availability endpoint returns up to 120 days at a time.
      for (let from = start; from <= end; from = addDaysISO(from, 120)) {
        const to = addDaysISO(from, 119) < end ? addDaysISO(from, 119) : end;
        const res = await fetch(`/api/availability?from=${from}&to=${to}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          sessions: PublicSession[];
          error?: string;
        };
        found.push(...json.sessions);
        err = err ?? json.error ?? null;
      }
      setSessions(found);
      setError(err);
      if (preselect.length && !preselected.current) {
        preselected.current = true;
        const ok = found
          .filter((s) => preselect.some((p) => p.id === s.id) && stateLabel(s).selectable)
          .map((s) => s.id);
        if (ok.length) {
          setSelected(ok);
          setSpots(Object.fromEntries(preselect.map((p) => [p.id, p.n])));
          // Day length and Early Bird chosen on the Yalla Flex page carry into Your selection.
          const flexExtras = comingExtras.filter((k) => k === "half" || k === "early");
          if (flexExtras.length)
            setSessionExtras(Object.fromEntries(found.filter((s) => ok.includes(s.id) && s.kind === "drop_in").map((s) => [s.id, flexExtras])));
          // Several age groups of the same Happening, chosen together: the right group is picked by age.
          const chosenNow = found.filter((s) => ok.includes(s.id));
          setFlexible(
            chosenNow
              .filter((s) => chosenNow.filter((o) => o.programId === s.programId && o.startsAt === s.startsAt).length > 1)
              .map((s) => s.id),
          );
          setCheckoutOpen(true);
        }
        if (ok.length < preselect.length)
          setError(
            "Some of the days you chose were just booked by someone else. The rest are in your basket.",
          );
      }
    } catch {
      setError("We couldn’t load availability. Please refresh.");
      setSessions([]);
    }
  }, [start, until, preselect]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the URL shareable.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (offering !== "all") sp.set("offering", offering);
    if (day) sp.set("date", day);
    router.replace(`/book${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  }, [offering, day, router]);

  const childAge = ageBands[ageIdx].months;
  const all = useMemo(() => sessions ?? [], [sessions]);
  const eligible = useCallback(
    (s: PublicSession) =>
      childAge == null ||
      ((s.ages.min == null || childAge >= s.ages.min) &&
        (s.ages.max == null || childAge <= s.ages.max)),
    [childAge],
  );
  const byKind = useMemo(
    () => all.filter((s) => offering === "all" || s.kind === offering || (offering === "happening" && (s.kind === "weekend" || s.kind === "parents_night"))),
    [all, offering],
  );
  const days = useMemo(
    () => Array.from({ length: DAYS }, (_, i) => addDaysISO(start, i)),
    [start],
  );
  const visible = useMemo(() => {
    const list = day ? byKind.filter((s) => s.localDate === day) : byKind;
    // On a closure day, Flex shows a single "Yalla closed" line rather than one per age group.
    const seen = new Set<string>();
    return list.filter((s) => {
      if (s.kind !== "drop_in" || !s.closure) return true;
      if (seen.has(s.localDate)) return false;
      seen.add(s.localDate);
      return true;
    });
  }, [byKind, day]);
  const grouped = useMemo(() => {
    const m = new Map<string, PublicSession[]>();
    for (const s of visible)
      m.set(s.localDate, [...(m.get(s.localDate) ?? []), s]);
    return [...m.entries()];
  }, [visible]);
  const shown = day ? grouped : grouped.slice(0, dayLimit);
  const selectedSessions = all.filter((s) => selected.includes(s.id));

  function seriesOf(s: PublicSession) {
    return s.bookAsSeries && s.seriesId
      ? all.filter((x) => x.seriesId === s.seriesId && stateLabel(x).selectable)
      : [s];
  }

  function toggle(s: PublicSession) {
    const ids = seriesOf(s).map((x) => x.id);
    const removing = selected.includes(s.id);
    setSelected((cur) =>
      removing
        ? cur.filter((id) => !ids.includes(id))
        : [...cur, ...ids.filter((id) => !cur.includes(id))],
    );
    setSpots((sp) => {
      const next = { ...sp };
      for (const id of ids) removing ? delete next[id] : (next[id] = 1);
      return next;
    });
    if (removing) setFlexible((f) => f.filter((id) => !ids.includes(id)));
  }

  /** Change how many spots (children) a session has; zero removes it. A series changes together. */
  function setSpotCount(sessionId: string, n: number) {
    const s = all.find((x) => x.id === sessionId);
    if (!s) return;
    if (n <= 0) {
      if (selected.includes(sessionId)) toggle(s);
      return;
    }
    const ids = seriesOf(s).map((x) => x.id);
    setSpots((sp) => ({ ...sp, ...Object.fromEntries(ids.map((id) => [id, Math.min(8, n)])) }));
    setFlexible((f) => f.filter((id) => !ids.includes(id)));
  }
  const spotsFor = Object.fromEntries(selected.map((id) => [id, flexible.includes(id) ? 0 : (spots[id] ?? 1)]));
  const spotTotal = selected.reduce((t, id) => t + Math.max(1, spotsFor[id] ?? 1), 0);

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
                    offering === o.kind
                      ? "border-ink bg-ink text-chalk"
                      : "border-ink/15 text-ink/80 hover:border-ink/50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 text-[0.85rem]">
              <span className="eyebrow text-[0.6rem] text-ink-soft">
                Child’s age
              </span>
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
                day === null
                  ? "border-blue bg-blue text-chalk"
                  : "border-ink/10 hover:border-ink/40"
              }`}
            >
              <span className="eyebrow mt-2 text-[0.55rem]">All</span>
              <span className="font-serif text-[0.85rem] italic">dates</span>
            </button>
            {days.map((key) => {
              const daySessions = byKind.filter((s) => s.localDate === key);
              const bookable = daySessions.some(
                (s) => stateLabel(s).selectable && eligible(s),
              );
              const has = daySessions.length > 0;
              const active = day === key;
              const sel = daySessions.some((s) => selected.includes(s.id));
              return (
                <button
                  key={key}
                  disabled={!has}
                  onClick={() => setDay(active ? null : key)}
                  aria-label={`${fmtDate(key, "EEEE d MMMM")}${has ? (bookable ? ", spaces available" : ", fully booked or closed") : ", nothing offered"}`}
                  className={`relative flex h-[4.25rem] w-12 shrink-0 flex-col items-center justify-center rounded-t-full border transition-all ${
                    active
                      ? "border-ink bg-ink text-chalk"
                      : has
                        ? "border-ink/10 hover:border-ink/40"
                        : "border-transparent text-ink/25"
                  }`}
                >
                  <span className="eyebrow mt-2 text-[0.5rem]">
                    {fmtDate(key, "EEEEE")}
                  </span>
                  <span className="font-serif text-[1.05rem] leading-tight">
                    {fmtDate(key, "d")}
                  </span>
                  {key.endsWith("-01") ? (
                    <span className="absolute -top-0.5 text-[0.5rem] tracking-widest uppercase">
                      {fmtDate(key, "MMM")}
                    </span>
                  ) : null}
                  <span
                    className={`mt-0.5 h-1 w-1 rounded-full ${sel ? "bg-blue" : bookable ? (active ? "bg-chalk/70" : "bg-ink/40") : has ? "border border-current opacity-40" : "bg-transparent"}`}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="shell mt-10 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {error ? (
            <p className="mb-6 border-l-2 border-oxblood/40 pl-4 text-[0.9rem] text-oxblood">
              {error}
            </p>
          ) : null}
          {sessions === null ? (
            <div
              className="space-y-3"
              aria-busy="true"
              aria-label="Loading availability"
            >
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-24 animate-pulse bg-sand/50" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-24 text-center">
              <Mark name="sun" className="mx-auto h-10 w-10 text-blue" />
              <p className="display mt-6 text-[1.8rem]">
                {all.length
                  ? "Nothing on these dates."
                  : "New dates are coming soon."}
              </p>
              <p className="mt-2 text-ink-soft">
                {all.length
                  ? "Try another date or offering."
                  : "Check back shortly, or get in touch and we’ll let you know."}
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {shown.map(([key, list]) => (
                <section key={key}>
                  <h2 className="flex items-baseline gap-4">
                    <span className="display text-[1.9rem]">
                      {fmtDate(key, "EEEE")}
                    </span>
                    <span className="font-serif text-ink-soft italic">
                      {fmtDate(key, "d MMMM")}
                    </span>
                  </h2>
                  {playSessionGroups(list).map((g) => (
                    <div key={g.key} className={g.label ? "mt-6" : ""}>
                      {g.label ? (
                        <h3 className="flex flex-wrap items-baseline gap-x-3 border-b border-line pb-2">
                          <span className="eyebrow text-[0.62rem]">
                            {g.label}
                          </span>
                          <span className="font-serif text-[0.95rem] text-ink-soft italic">
                            {fmtTime(g.list[0].startsAt)} –{" "}
                            {fmtTime(g.list[0].endsAt)}
                          </span>
                        </h3>
                      ) : null}
                      <ul className="mt-4 space-y-3">
                        {g.list.map((s) => (
                          <SessionRow
                            key={s.id}
                            s={s}
                            heading={g.label ? ageGroupTitle(s) : undefined}
                            eligible={eligible(s)}
                            selected={selected.includes(s.id)}
                            onToggle={() => toggle(s)}
                            onWaitlist={() => setWaitlistFor(s)}
                            seriesCount={seriesOf(s).length}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
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

        <aside className="hidden lg:col-span-4 lg:block">
          <div className="sticky top-[17rem]">
            <Basket
              sessions={selectedSessions}
              onRemove={toggle}
              spots={spotsFor}
              onSpots={setSpotCount}
              sessionExtras={sessionExtras}
              onExtra={toggleSessionExtra}
              onContinue={() => setCheckoutOpen(true)}
              guardian={guardian}
              siblingPercent={sibling.percent}
            />
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
            <Basket
              sessions={selectedSessions}
              onRemove={toggle}
              spots={spotsFor}
              onSpots={setSpotCount}
              sessionExtras={sessionExtras}
              onExtra={toggleSessionExtra}
              onContinue={() => setCheckoutOpen(true)}
              compact
              guardian={guardian}
              siblingPercent={sibling.percent}
            />
          </div>
        ) : null}
        <div className="flex items-center gap-3 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setSheetOpen((v) => !v)}
            className="flex-1 text-left"
          >
            <span className="block text-[0.95rem]">
              {spotTotal} spot{spotTotal === 1 ? "" : "s"} selected
            </span>
            <span className="text-[0.75rem] text-ink-soft">
              {sheetOpen ? "Hide" : "Review selection"}
            </span>
          </button>
          <button
            onClick={() => setCheckoutOpen(true)}
            className="h-12 rounded-full bg-ink px-6 text-[0.9rem] text-chalk"
          >
            Continue
          </button>
        </div>
      </div>

      {checkoutOpen ? (
        <Checkout
          sessions={selectedSessions}
          guardian={guardian}
          savedChildren={savedChildren}
          includeChildren={comingKids}
          includeExtras={comingExtras}
          wallet={wallet}
          sibling={sibling}
          spots={spotsFor}
          onSpots={setSpotCount}
          defaultExtras={sessionExtras}
          onClose={() => setCheckoutOpen(false)}
          onRefresh={load}
          onSignedIn={() => router.refresh()}
        />
      ) : null}
      {waitlistFor ? (
        <WaitlistForm
          session={waitlistFor}
          guardian={guardian}
          savedChildren={savedChildren}
          onClose={() => setWaitlistFor(null)}
        />
      ) : null}
    </div>
  );
}

// Weekend Play Sessions (a Happening): split each day into its AM and PM play sessions.
const isWeekendPlay = (s: PublicSession) => s.programSlug === "yalla-weekends" || s.kind === "weekend";
function playSessionGroups(list: PublicSession[]) {
  const other = list.filter((s) => !isWeekendPlay(s));
  const weekend = list.filter(isWeekendPlay);
  const isAM = (s: PublicSession) => fmtTime(s.startsAt).endsWith("am");
  return [
    { key: "other", label: null, list: other },
    { key: "am", label: "Weekend Play · AM session", list: weekend.filter(isAM) },
    {
      key: "pm",
      label: "Weekend Play · PM session",
      list: weekend.filter((s) => !isAM(s)),
    },
  ].filter((g) => g.list.length);
}

// Within a play session, the age group is all a row needs to say.
function ageGroupTitle(s: PublicSession) {
  return s.title.split(" · ").at(-1) ?? s.title;
}

const kindName: Record<string, string> = {
  drop_in: "Yalla Flex · Drop-in",
  nature: "Yalla Outside",
  weekend: "Yalla Happenings",
  happening: "Yalla Happenings",
  parents_night: "Yalla Happenings · After Hours Evenings",
  camp: "Camp Yalla",
  private_event: "Yalla Celebrations",
};

function SessionRow({
  s,
  heading,
  eligible,
  selected,
  onToggle,
  onWaitlist,
  seriesCount,
}: {
  s: PublicSession;
  heading?: string;
  eligible: boolean;
  selected: boolean;
  onToggle: () => void;
  onWaitlist: () => void;
  seriesCount: number;
}) {
  const st = stateLabel(s);
  const disabled = !st.selectable || !eligible;
  const ageNote =
    !eligible && s.ages.min != null && s.ages.max != null
      ? `For ages ${s.ages.min < 24 ? `${s.ages.min} mo` : `${Math.floor(s.ages.min / 12)} yr`} – ${Math.floor(s.ages.max / 12)} yr`
      : null;
  const status = (
    <>
      {ageNote ? (
        <span className="text-ink-soft">{ageNote}</span>
      ) : (
        <span
          className={
            st.tone === "low"
              ? "text-oxblood"
              : st.tone === "muted"
                ? "text-ink-soft"
                : "text-ink-soft"
          }
        >
          {st.text}
        </span>
      )}
    </>
  );
  // Unavailable rows are faded part by part, so a link inside (e.g. "Explore camp") stays bright and clickable.
  const dim = disabled && s.state.state !== "full" ? "opacity-55" : "";
  return (
    <li>
      <div
        className={`grid w-full grid-cols-[1fr_auto] items-center gap-4 border p-5 text-left transition-all duration-300 sm:grid-cols-[8rem_1fr_auto] sm:p-6 ${
          selected ? "border-blue bg-blue/[0.06]" : "border-line bg-paper"
        }`}
      >
        <span className={`hidden font-serif text-[1.05rem] sm:block ${dim}`}>
          {fmtTime(s.startsAt)}
          <span className="block text-[0.85rem] text-ink-soft">
            to {fmtTime(s.endsAt)}
          </span>
        </span>
        <span>
          <span className={`eyebrow block text-[0.58rem] text-ink-soft ${dim}`}>
            {s.kind === "happening" && s.programName !== "Yalla Happenings" ? `Yalla Happenings · ${s.programName}` : (kindName[s.kind] ?? s.programName)}
            {s.cohort ? ` · ${s.cohort}` : ""}
          </span>
          <span className={`display mt-1 block text-[1.35rem] ${dim}`}>
            {s.kind === "drop_in" && s.closure ? `Yalla closed · ${s.closure}` : (heading ?? s.title)}
          </span>
          {s.campToday ? (
            <a href={`/book?offering=camp&date=${s.localDate}`} className="mt-1 inline-block text-[0.82rem] font-medium text-blue underline decoration-blue/50 underline-offset-4 transition-colors hover:text-blue-deep hover:decoration-blue-deep">
              Camp Yalla runs this day. Explore camp →
            </a>
          ) : null}
          <span className={`mt-1 block text-[0.82rem] text-ink-soft sm:hidden ${dim}`}>
            {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
          </span>
          <span className={`mt-1 block text-[0.82rem] text-ink-soft ${dim} ${s.kind === "drop_in" && s.closure ? "hidden" : ""}`}>
            {s.halfPriceCents != null ? `${usd(s.priceCents)} full day · ${usd(s.halfPriceCents)} half day` : usd(s.priceCents)}
            {s.priceCents != null
              ? s.bookingUnit === "per_family"
                ? " per family"
                : s.bookingUnit === "per_child"
                  ? " per child"
                  : ""
              : ""}
            {s.kind === FAMILY_RATE.kind
              ? ` · ${usd(FAMILY_RATE.familyCents)} for siblings`
              : ""}
            {s.bookAsSeries
              ? ` · books as a full series (${seriesCount} days)`
              : ""}
            {s.approvalRequired ? " · confirmed after approval" : ""}
          </span>
          <span className={`mt-1 block text-[0.8rem] sm:hidden ${dim}`}>{status}</span>
        </span>
        <span className={`flex items-center gap-4 ${dim}`}>
          <span className="hidden text-right text-[0.8rem] sm:block">
            {status}
          </span>
          {s.kind === "drop_in" && s.closure ? null : s.state.state === "full" && s.state.waitlist && eligible ? (
            <button
              onClick={onWaitlist}
              className="h-9 rounded-full border border-ink/25 px-4 text-[0.78rem] whitespace-nowrap transition-colors hover:border-ink"
            >
              Join waitlist
            </button>
          ) : (
            <button
              onClick={onToggle}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`${selected ? "Remove" : "Add"} ${s.title} on ${fmtDate(s.localDate)}`}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-25 ${
                selected
                  ? "border-blue bg-blue text-chalk"
                  : "border-ink/20 hover:border-ink"
              }`}
            >
              {selected ? (
                <svg
                  viewBox="0 0 14 10"
                  className="h-2.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path d="M1 5l4 4 8-8" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 12 12"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                >
                  <path d="M6 0v12M0 6h12" />
                </svg>
              )}
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

/** Yalla Flex: full or half day, and Early Bird when staff have opened seats that day. */
function FlexChoices({ s, chosen, onExtra }: { s: PublicSession; chosen: string[]; onExtra: (sessionId: string, key: string, on: boolean) => void }) {
  const half = chosen.includes("half");
  const pill = (on: boolean) => `rounded-full border px-2.5 py-1 text-[0.72rem] transition-colors ${on ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"}`;
  return (
    <span className="mt-2 block space-y-2">
      <span className="flex flex-wrap gap-1.5" role="group" aria-label="Day length">
        <button type="button" aria-pressed={!half} className={pill(!half)} onClick={() => onExtra(s.id, "half", false)}>
          Full day · {usd(s.priceCents)}
        </button>
        <button type="button" aria-pressed={half} className={pill(half)} onClick={() => onExtra(s.id, "half", true)}>
          Half day · {usd(s.halfPriceCents)}
        </button>
      </span>
      {s.earlyBirdOpen ? (
        <label className="flex cursor-pointer items-center gap-2 text-[0.75rem]">
          <input type="checkbox" checked={chosen.includes("early")} onChange={(e) => onExtra(s.id, "early", e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-blue)]" />
          <span>
            Early Bird, 8:00–8:30am, +$16 <span className="text-ink-soft">(12 months and older)</span>
          </span>
        </label>
      ) : (
        <span className="block text-[0.72rem] text-ink-soft">No Early Bird this day</span>
      )}
    </span>
  );
}

/** One spot is one child. Families add a spot for each child coming to the same session. */
function SpotStepper({ s, n, onSpots }: { s: PublicSession; n: number; onSpots?: (sessionId: string, n: number) => void }) {
  if (!onSpots || s.bookingUnit !== "per_child") return null;
  if (n === 0) return <span className="text-[0.72rem] text-ink-soft">Age group matched at checkout</span>;
  const btn = "flex h-6 w-6 items-center justify-center rounded-full border border-ink/20 text-[0.85rem] leading-none transition-colors hover:border-ink";
  return (
    <span className="inline-flex items-center gap-2 text-[0.78rem]">
      <button type="button" className={btn} aria-label={`One fewer spot for ${s.title}`} onClick={() => onSpots(s.id, n - 1)}>
        −
      </button>
      <span className="min-w-[3.6rem] text-center">
        {n} {n === 1 ? "child" : "children"}
      </span>
      <button type="button" className={btn} aria-label={`Add a spot for another child at ${s.title}`} onClick={() => onSpots(s.id, n + 1)} disabled={n >= 8}>
        +
      </button>
    </span>
  );
}

/** Basket rows: After Hours age groups on the same evening are shown together under the family rate. */
function basketRows(sorted: PublicSession[]) {
  const rows: (
    | { type: "single"; session: PublicSession }
    | { type: "evening"; key: string; sessions: PublicSession[] }
  )[] = [];
  for (const s of sorted) {
    if (s.kind !== FAMILY_RATE.kind) {
      rows.push({ type: "single", session: s });
      continue;
    }
    const key = familyRateKey(s.programId, s.localDate);
    const existing = rows.find((r) => r.type === "evening" && r.key === key);
    if (existing && existing.type === "evening") existing.sessions.push(s);
    else rows.push({ type: "evening", key, sessions: [s] });
  }
  return rows;
}

function Basket({
  sessions,
  onRemove,
  onContinue,
  compact,
  guardian,
  siblingPercent = 0,
  spots = {},
  onSpots,
  sessionExtras = {},
  onExtra,
}: {
  sessions: PublicSession[];
  /** Spots per session (one per child); 0 = age group matched at checkout. */
  spots?: Record<string, number>;
  onSpots?: (sessionId: string, n: number) => void;
  sessionExtras?: Record<string, string[]>;
  onExtra?: (sessionId: string, key: string, on: boolean) => void;
  onRemove: (s: PublicSession) => void;
  onContinue: () => void;
  compact?: boolean;
  guardian: SignedInGuardian | null;
  siblingPercent?: number;
}) {
  const sorted = [...sessions].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  // Two or more sessions of the same program on the same day (different age groups) are siblings:
  // show the discount here, matching checkout. Siblings in the same group are counted at checkout.
  const n = (x: PublicSession) => spots[x.id] ?? 1;
  const perChild = sorted.filter((x) => x.bookingUnit === "per_child" && x.kind !== FAMILY_RATE.kind && x.priceCents && n(x) > 0);
  const byDay = new Map<string, number[]>();
  for (const x of perChild)
    byDay.set(`${x.programId}|${x.localDate}`, [...(byDay.get(`${x.programId}|${x.localDate}`) ?? []), ...Array<number>(n(x)).fill(x.priceCents ?? 0)]);
  const siblingSaving = siblingPercent > 0
    ? [...byDay.values()].reduce((sum, prices) => sum + [...prices].sort((a, b) => b - a).slice(1).reduce((t, p) => t + Math.round((p * siblingPercent) / 100), 0), 0)
    : 0;
  const subtotal = perChild.reduce((sum, x) => sum + (x.priceCents ?? 0) * n(x), 0);
  // A subtotal and total only when every item is a simple per-child price (extras and family rates are added at checkout).
  const simple = perChild.length === sorted.length && !sorted.some((x) => x.halfPriceCents != null);
  return (
    <div className={compact ? "" : "border border-line bg-paper p-7"}>
      {!compact ? (
        <>
          <Mark name="roofline" className="h-3.5 w-auto text-blue" />
          <p className="display mt-6 text-[1.6rem]">Your selection</p>
        </>
      ) : null}
      {sorted.length === 0 ? (
        <p className="mt-3 text-[0.92rem] text-ink-soft">
          Choose sessions from the calendar. They’ll gather here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {basketRows(sorted).map((row) =>
            row.type === "single" ? (
              <li
                key={row.session.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span>
                  <span className="block text-[0.92rem]">
                    {row.session.title}
                  </span>
                  <span className="text-[0.78rem] text-ink-soft">
                    {fmtDate(row.session.localDate, "EEE d MMM")} ·{" "}
                    {fmtTime(row.session.startsAt)} ·{" "}
                    {row.session.halfPriceCents != null ? `${usd(row.session.priceCents)} full · ${usd(row.session.halfPriceCents)} half` : usd(row.session.priceCents)}
                    {n(row.session) > 1 ? ` × ${n(row.session)}` : ""}
                  </span>
                  <span className="mt-2 block">
                    <SpotStepper s={row.session} n={n(row.session)} onSpots={onSpots} />
                  </span>
                  {row.session.halfPriceCents != null && onExtra ? (
                    <FlexChoices s={row.session} chosen={sessionExtras[row.session.id] ?? []} onExtra={onExtra} />
                  ) : null}
                </span>
                <button
                  onClick={() => onRemove(row.session)}
                  className="text-[0.75rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                >
                  Remove
                </button>
              </li>
            ) : (
              <li key={row.key} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.92rem]">
                    {row.sessions[0].programName}
                  </span>
                  <span className="font-serif text-[0.95rem] whitespace-nowrap">
                    {row.sessions.reduce((t, g) => t + Math.max(1, n(g)), 0) > 1
                      ? `${usd(FAMILY_RATE.familyCents)} family rate`
                      : `${usd(row.sessions[0].priceCents)} per child`}
                  </span>
                </div>
                <span className="text-[0.78rem] text-ink-soft">
                  {fmtDate(row.sessions[0].localDate, "EEE d MMM")} ·{" "}
                  {fmtTime(row.sessions[0].startsAt)} –{" "}
                  {fmtTime(row.sessions[0].endsAt)}
                </span>
                <ul className="mt-2 space-y-1">
                  {row.sessions.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between gap-3 text-[0.82rem]"
                    >
                      <span className="text-ink-soft">
                        {g.title.replace(`${g.programName} · `, "")}
                        <span className="ml-3 inline-block align-middle">
                          <SpotStepper s={g} n={n(g)} onSpots={onSpots} />
                        </span>
                      </span>
                      <button
                        onClick={() => onRemove(g)}
                        className="text-[0.75rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[0.75rem] text-ink-soft">
                  {usd(FAMILY_RATE.familyCents)} covers up to{" "}
                  {FAMILY_RATE.childrenIncluded} children; each additional child
                  is {usd(FAMILY_RATE.extraChildCents)}. You’ll add your
                  children next.
                </p>
              </li>
            ),
          )}
        </ul>
      )}
      {siblingSaving > 0 && simple ? (
        <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[0.88rem]">
          {simple ? (
            <div className="flex justify-between text-ink-soft">
              <dt>Subtotal</dt>
              <dd>{usd(subtotal)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-blue">
            <dt>Sibling discount ({siblingPercent}%)</dt>
            <dd>−{usd(siblingSaving)}</dd>
          </div>
          {simple ? (
            <div className="flex items-baseline justify-between pt-1">
              <dt>Total</dt>
              <dd className="font-serif text-[1.15rem]">{usd(subtotal - siblingSaving)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {!compact ? (
        <>
          <button
            onClick={onContinue}
            disabled={!sorted.length}
            className="mt-6 h-12 w-full rounded-full bg-ink text-[0.9rem] text-chalk transition-colors duration-500 hover:bg-blue disabled:cursor-not-allowed disabled:opacity-30"
          >
            Continue
          </button>
          {guardian ? (
            <p className="mt-5 text-[0.78rem] text-ink-soft">
              Booking as {guardian.firstName}. Saved children are ready in the
              next step.
            </p>
          ) : (
            <p className="mt-5 text-[0.78rem] text-ink-soft">
              Already a Yalla family?{" "}
              <Link
                href="/portal?next=/book"
                className="underline underline-offset-4"
              >
                Sign in
              </Link>{" "}
              to book with saved details.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
