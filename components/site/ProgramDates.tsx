"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { addToCart, removeFromCart } from "@/lib/booking/cart";
import { familyRateTotal } from "@/lib/booking/family-rate";
import type { PublicSession } from "@/lib/ops/public-booking";
import { Checkout, type SavedChild, type SignedInGuardian } from "@/components/booking/Checkout";
import { ageInMonths } from "@/lib/time";
import { addonsFor } from "@/lib/booking/addons";

/**
 * An age group (matched to sessions by its minimum age in months) or a cohort (matched by name).
 * minAge and maxAge also place a signed-in family's own children in the right group.
 */
export type DateGroup = {
  key: string;
  label: string;
  sub?: string;
  minAge?: number;
  maxAge?: number;
  cohort?: string;
  priceCents: number;
};
type Child = { id: string; name: string; birthDate: string; /** Staff-set Yalla Flex cohort hold. */ flexHold?: string | null };
type AddedChild = Child & { firstName: string; lastName: string };

const fmt = (date: string, o: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
};
const todayLA = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(
    new Date(),
  );
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};
const NO_DAYS: string[] = [];
const ageText = (m: number) =>
  m < 24 ? `${m} mo` : `${Math.floor(m / 12)} yrs`;
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
const open = (s: PublicSession | undefined): s is PublicSession =>
  !!s && (s.state.state === "available" || s.state.state === "limited");

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
  program,
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
  /** Only this program's sessions (e.g. Immersive Play among other Happenings). */
  program?: string;
}) {
  const router = useRouter();
  const [today] = useState(todayLA);
  const [sessions, setSessions] = useState<PublicSession[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [hint, setHint] = useState(false);
  /** Extras for the grown-up (e.g. coworking during Immersive Play), once per session. */
  const forFamily = addonsFor(kind, program).filter((a) => a.perFamily);
  const [stay, setStay] = useState<string[]>([]);
  // Yalla Flex: full or half day, and Early Bird (on days staff open seats, children 12 months+).
  const isFlex = kind === "drop_in";
  const [half, setHalf] = useState(false);
  const [early, setEarly] = useState(false);
  const earlyOn = (day: string) => groups.some((g) => sessionFor(day, g)?.earlyBirdOpen);
  /** A signed-in family's children; null until known, empty for everyone else. */
  const [kids, setKids] = useState<Child[] | null>(null);
  /** What checkout needs (signed-in guardian, saved children, wallet, sibling discount). */
  type CheckoutCtx = { guardian: SignedInGuardian | null; savedChildren: SavedChild[]; wallet: { passCents: number; creditCents: number } | null; sibling: { percent: number; withPass: boolean } };
  const [ctx, setCtx] = useState<CheckoutCtx>({ guardian: null, savedChildren: [], wallet: null, sibling: { percent: 0, withPass: false } });
  /** Checkout opens right here, over the chosen days, rather than on another page. */
  const [checkout, setCheckout] = useState<{ sessions: PublicSession[]; spots: Record<string, number>; extras: Record<string, string[]>; include: string[]; newChildren: AddedChild[]; includeExtras: string[] } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [chosenKids, setChosenKids] = useState<string[]>([]);
  /** Bumped when a family signs in from checkout, so the page picks up their children. */
  const [familyKey, setFamilyKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/family/children", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { children: [] }))
      .then((j: { children?: Child[]; checkout?: CheckoutCtx }) => {
        if (cancelled) return;
        setKids(j.children ?? []);
        if (j.checkout) setCtx(j.checkout);
      })
      .catch(() => !cancelled && setKids([]));
    return () => {
      cancelled = true;
    };
  }, [familyKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = [addDays(today, horizonDays), ...days].reduce((m, d) =>
        d > m ? d : m,
      );
      const found: PublicSession[] = [];
      try {
        // The availability endpoint returns up to 120 days at a time.
        for (let from = today; from <= last; from = addDays(from, 120)) {
          const to = addDays(from, 119) < last ? addDays(from, 119) : last;
          const res = await fetch(
            `/api/availability?from=${from}&to=${to}&kind=${kind}`,
            { cache: "no-store" },
          );
          const json = (await res.json()) as { sessions?: PublicSession[] };
          found.push(
            ...(json.sessions ?? []).filter(
              (s) => !program || s.programSlug === program,
            ),
          );
        }
        if (!cancelled) setSessions(found);
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, today, horizonDays, kind, program, reloadKey]);

  const matches = (s: PublicSession, g: DateGroup) =>
    g.cohort ? s.cohort === g.cohort : s.ages.min === g.minAge;
  const sessionFor = (day: string, g: DateGroup) =>
    sessions?.find((s) => s.localDate === day && matches(s, g));

  const all = useMemo(
    () =>
      [...new Set([...days, ...(sessions ?? []).map((s) => s.localDate)])]
        .filter((d) => d >= today)
        .sort(),
    [days, sessions, today],
  );
  const months = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of all)
      m.set(d.slice(0, 7), [...(m.get(d.slice(0, 7)) ?? []), d]);
    return [...m.entries()];
  }, [all]);

  /** A month's dates as Monday–Friday weeks: five slots per week, null where there's no day to show. */
  const weeksOf = (list: string[]) => {
    const wd = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday
    const weeks = new Map<string, (string | null)[]>();
    for (const d of list) {
      const w = wd(d);
      if (w === 0 || w === 6) continue;
      const monday = addDays(d, 1 - w);
      const row = weeks.get(monday) ?? [null, null, null, null, null];
      row[w - 1] = d;
      weeks.set(monday, row);
    }
    return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
  };

  // Sparse schedules (one or two dates a month, like After Hours) read better as one grid than as
  // a row per month.
  const flow =
    months.length > 2 && months.every(([, list]) => list.length <= 2);

  // Signed-in families pick their children by name; each child's group follows their age on the day.
  const byName = !!kids?.length;
  /** Children added here by name and birthday (not saved to the family yet; checkout saves them). */
  const [added, setAdded] = useState<AddedChild[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ firstName: "", lastName: "", birthDate: "" });
  const [addError, setAddError] = useState<string | null>(null);
  const allKids: Child[] = [...(kids ?? []), ...added];
  const addChild = () => {
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    if (!firstName || !lastName) return setAddError("Add their first and last name.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.birthDate) || draft.birthDate > today) return setAddError("Add their date of birth.");
    const c: AddedChild = { id: `new-${Date.now()}`, name: `${firstName} ${lastName}`, firstName, lastName, birthDate: draft.birthDate };
    setAdded((a) => [...a, c]);
    // Ticked straight away when they fit one of this program's age groups.
    if (fitsOn(c)) setChosenKids((k) => [...k, c.id]);
    setDraft({ firstName: "", lastName: "", birthDate: "" });
    setAddError(null);
    setAdding(false);
    setHint(false);
  };
  const removeAdded = (id: string) => {
    setAdded((a) => a.filter((c) => c.id !== id));
    setChosenKids((k) => k.filter((x) => x !== id));
  };
  const groupOf = (c: Child, day: string) => {
    // A child staff hold in a Flex cohort books that cohort only, whatever their age.
    if (isFlex && c.flexHold) return groups.find((g) => g.key === c.flexHold);
    const m = ageInMonths(c.birthDate, day);
    return groups.find(
      (g) =>
        g.minAge != null && g.maxAge != null && m >= g.minAge && m <= g.maxAge,
    );
  };
  /** The first chosen day (or, before any is chosen, the first upcoming day) the child is old enough for. */
  const fitsOn = (c: Child) => (picked.length ? picked : all).find((d) => groupOf(c, d));
  const pickedKids = allKids.filter((c) => chosenKids.includes(c.id));
  /** Chosen children who aren't the right age yet on a chosen day (that day isn't booked for them). */
  const tooYoungOn = byName
    ? picked.flatMap((d) => pickedKids.filter((k) => !groupOf(k, d) && ageInMonths(k.birthDate, d) < Math.min(...groups.map((x) => x.minAge ?? 0))).map((k) => `${k.name.split(" ")[0]} on ${fmt(d, { month: "short", day: "numeric" })}`))
    : [];
  /** How many children go in each group on a given day. */
  const countsOn = (day: string): Record<string, number> => {
    if (!byName) return counts;
    const c: Record<string, number> = {};
    for (const k of pickedKids) {
      const g = groupOf(k, day);
      if (g) c[g.key] = (c[g.key] ?? 0) + 1;
    }
    return c;
  };
  const comingOn = (day: string) => {
    const c = countsOn(day);
    return groups.filter((g) => (c[g.key] ?? 0) > 0);
  };
  const children = byName
    ? pickedKids.length
    : groups.reduce((n, g) => n + (counts[g.key] ?? 0), 0);
  const known = !!sessions?.length;
  // Yalla Flex only opens an age group when there's a vacancy, so days stay greyed until the
  // family says who's coming; then each day shows open or full for those children.
  const waiting = kind === "drop_in" && children === 0;
  const askWho = () => {
    setHint(true);
    document.getElementById(`${kind}-who`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  /** A date can be picked when at least one of the chosen groups has room (or availability is unknown). */
  const pickable = (day: string) => {
    if (waiting) return false;
    if (closedDay(day)) return false;
    if (!known) return true;
    const coming = comingOn(day);
    return (coming.length ? coming : groups).some((g) =>
      open(sessionFor(day, g)),
    );
  };
  const fewLeft = (day: string) => {
    const coming = comingOn(day);
    return (
      known &&
      (coming.length ? coming : groups).some(
        (g) => sessionFor(day, g)?.state.state === "limited",
      )
    );
  };

  const toggle = (day: string) =>
    setPicked((p) =>
      p.includes(day) ? p.filter((d) => d !== day) : [...p, day].sort(),
    );
  const toggleMonth = (list: string[]) => {
    const can = list.filter(pickable);
    const allIn = can.every((d) => picked.includes(d));
    setPicked((p) =>
      allIn
        ? p.filter((d) => !can.includes(d))
        : [...new Set([...p, ...can])].sort(),
    );
  };
  const bump = (key: string, by: number) => {
    setHint(false);
    setCounts((c) => ({
      ...c,
      [key]: Math.max(0, Math.min(6, (c[key] ?? 0) + by)),
    }));
  };
  const toggleKid = (id: string) => {
    setHint(false);
    setChosenKids((k) =>
      k.includes(id) ? k.filter((x) => x !== id) : [...k, id],
    );
  };

  // What will go in the basket, the total, and any chosen group that's full on a chosen date.
  const lines: PublicSession[] = [];
  /** Children going to each session: one spot each. */
  const spotCount = new Map<string, number>();
  const fullFor: string[] = [];
  let total = 0;
  const siblingPct = ctx.sibling.percent;
  let siblingSaving = 0;
  for (const d of picked) {
    const prices: number[] = [];
    const c = countsOn(d);
    for (const g of comingOn(d)) {
      const s = sessionFor(d, g);
      if (open(s)) {
        lines.push(s);
        spotCount.set(s.id, c[g.key]);
        for (let i = 0; i < c[g.key]; i++)
          prices.push(isFlex && half && s.halfPriceCents != null ? s.halfPriceCents : (s.priceCents ?? g.priceCents));
        // Early Bird for children 12 months and older, on days it's offered.
        if (isFlex && early && s.earlyBirdOpen && (g.minAge ?? 0) >= 12) total += 1600 * c[g.key];
      } else if (known)
        fullFor.push(
          `${g.label} on ${fmt(d, { month: "short", day: "numeric" })}`,
        );
      else for (let i = 0; i < c[g.key]; i++) prices.push(g.priceCents);
    }
    total += familyRate
      ? familyRateTotal(prices)
      : prices.reduce((a, b) => a + b, 0);
    // Sibling discount: each additional child that day (the highest price pays in full), as at checkout.
    if (!familyRate && siblingPct > 0)
      siblingSaving += [...prices].sort((a, b) => b - a).slice(1).reduce((sum, p) => sum + Math.round((p * siblingPct) / 100), 0);
    if (prices.length)
      total += forFamily
        .filter((a) => stay.includes(a.key))
        .reduce((sum, a) => sum + a.priceCents, 0);
  }

  const book = () => {
    if (!picked.length) return;
    if (!children) {
      setHint(true);
      document
        .getElementById(`${kind}-who`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const who = byName
      ? `&children=${pickedKids.filter((k) => !added.some((a) => a.id === k.id)).map((k) => k.id).join(",")}`
      : "";
    const chosenExtras = [...stay, ...(isFlex && half ? ["half"] : []), ...(isFlex && early ? ["early"] : [])];
    // Open checkout over this page, so the chosen days stay in view.
    if (lines.length) {
      const flexExtras = chosenExtras.filter((k) => k === "half" || k === "early" || k === "adult");
      // Into the cart too, so it's kept if they look at another page first.
      addToCart(lines.map((s) => ({ id: s.id, date: s.localDate, label: s.title || s.programName, spots: spotCount.get(s.id) ?? 1, extras: flexExtras })));
      setCheckout({
        sessions: lines,
        spots: Object.fromEntries(lines.map((s) => [s.id, spotCount.get(s.id) ?? 1])),
        extras: flexExtras.length ? Object.fromEntries(lines.map((s) => [s.id, flexExtras])) : {},
        include: byName ? pickedKids.filter((k) => !added.some((a) => a.id === k.id)).map((k) => k.id) : [],
        newChildren: added.filter((a) => chosenKids.includes(a.id)),
        includeExtras: chosenExtras,
      });
      return;
    }
    const extras = chosenExtras.length ? `&extras=${chosenExtras.join(",")}` : "";
    if (lines.length)
      router.push(
        `/book?offering=${kind}&select=${lines.map((s) => ((spotCount.get(s.id) ?? 1) > 1 ? `${s.id}*${spotCount.get(s.id)}` : s.id)).join(",")}&until=${picked[picked.length - 1]}${who}${extras}`,
      );
    else router.push(`/book?offering=${kind}&date=${picked[0]}${who}`);
  };

  /** Full on a chosen group's session, and whether its waitlist is open. */
  const fullState = (day: string) => {
    if (!known || pickable(day)) return null;
    const coming = comingOn(day);
    const st = (coming.length ? coming : groups).map(
      (g) => sessionFor(day, g)?.state,
    );
    return st.some((x) => x?.state === "full" && x.waitlist)
      ? "waitlist"
      : st.some((x) => x?.state === "full")
        ? "full"
        : "closed";
  };

  /** One date. Status is shown in words only: a few spots left, or full with the waitlist. */
  /** One of Yalla's closure days: every group's session that day is closed for it. */
  const closedDay = (day: string) => {
    const list = groups.map((g) => sessionFor(day, g)).filter((x): x is PublicSession => !!x);
    if (!list.length || !list.every((x) => x.closure)) return null;
    return { reason: list[0].closure as string, camp: list.some((x) => x.campToday) };
  };

  const tile = (d: string, flowTile: boolean, fill = false) => {
    // fill: the tile stretches to its column (Yalla Flex's Monday–Friday week rows).
    const size = flowTile ? "h-[5.75rem] w-full" : fill ? "h-[5.25rem] w-full" : "h-[5.25rem] w-[5.25rem]";
    const closed = closedDay(d);
    if (closed) {
      const date = (
        <>
          {fill ? null : <span className="text-[0.62rem] tracking-[0.12em] uppercase opacity-70">{flowTile ? fmt(d, { month: "short" }) : fmt(d, { weekday: "short" })}</span>}
          <span className={`font-serif leading-none ${flowTile ? "text-[1.6rem]" : "text-[1.45rem]"}`}>{fmt(d, { day: "numeric" })}</span>
          <span className="mt-1 text-[0.58rem] leading-tight">{fill ? "Closed" : "Yalla closed"}</span>
        </>
      );
      const label = `${fmt(d, { weekday: "long", month: "long", day: "numeric" })}: Yalla closed for ${closed.reason}`;
      return closed.camp ? (
        <a
          href={`/book?offering=camp&date=${d}`}
          aria-label={`${label}. Explore camp that day`}
          title={`${closed.reason}: Yalla closed. Camp Yalla runs this day.`}
          className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-blue/40 bg-blue/[0.04] px-1 text-center text-ink/45 transition-colors hover:border-blue hover:text-ink ${size}`}
        >
          {date}
          <span className="mt-0.5 text-[0.58rem] leading-tight text-blue">{fill ? "Camp →" : "Explore camp →"}</span>
        </a>
      ) : (
        <span aria-label={label} title={`${closed.reason}: Yalla closed`} className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-ink/15 bg-ink/[0.03] px-1 text-center text-ink/35 ${size}`}>
          {date}
        </span>
      );
    }
    if (waiting)
      return (
        <button
          type="button"
          onClick={askWho}
          aria-label={`${fmt(d, { weekday: "long", month: "long", day: "numeric" })}: choose who’s coming first`}
          className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-ink/15 px-1 text-center text-ink/35 ${size}`}
        >
          {fill ? null : <span className="text-[0.62rem] tracking-[0.12em] uppercase opacity-70">{flowTile ? fmt(d, { month: "short" }) : fmt(d, { weekday: "short" })}</span>}
          <span className={`font-serif leading-none ${flowTile ? "text-[1.6rem]" : "text-[1.45rem]"}`}>{fmt(d, { day: "numeric" })}</span>
        </button>
      );
    const on = picked.includes(d);
    const full = fullState(d);
    const few = !full && fewLeft(d);
    const status =
      full === "waitlist"
        ? "Full · join waitlist"
        : full === "full"
          ? "Session full"
          : full
            ? kind === "drop_in"
              ? "Session full"
              : "Closed"
            : few
              ? kind === "camp"
                ? "Almost full"
                : "A few spots left"
              : null;
    const label = `${fmt(d, { weekday: "long", month: "long", day: "numeric", ...(flowTile ? { year: "numeric" } : {}) })}${status ? `, ${status.toLowerCase()}` : ""}`;
    const shape = `relative flex flex-col items-center justify-center rounded-xl border px-1 text-center transition-all duration-200 focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:outline-none ${size}`;
    const inner = (
      <>
        <span className={`text-[0.62rem] tracking-[0.12em] uppercase opacity-70 ${fill ? "hidden" : ""}`}>
          {flowTile
            ? fmt(d, { month: "short" }) +
              (d.slice(0, 4) !== today.slice(0, 4) ? ` ’${d.slice(2, 4)}` : "")
            : fmt(d, { weekday: "short" })}
        </span>
        <span
          className={`font-serif leading-none ${flowTile ? "text-[1.6rem]" : "text-[1.45rem]"}`}
        >
          {fmt(d, { day: "numeric" })}
        </span>
        {status ? (
          <span
            className={`mt-1 text-[0.6rem] leading-tight ${on ? "opacity-80" : full ? "" : "text-oxblood"}`}
          >
            {fill && status === "Session full" ? "Full" : status}
          </span>
        ) : isFlex && early && !full ? (
          <span className={`mt-1 text-[0.58rem] leading-tight ${on ? "opacity-80" : "text-ink-soft"}`}>{earlyOn(d) ? "Early Bird open" : "No Early Bird"}</span>
        ) : flowTile ? (
          <span className="mt-0.5 text-[0.62rem] opacity-60">
            {fmt(d, { weekday: "short" })}
          </span>
        ) : null}
      </>
    );
    if (full === "waitlist")
      return (
        <a
          href={`/book?offering=${kind}&date=${d}`}
          aria-label={label}
          className={`${shape} border-dashed border-ink/25 text-ink-soft hover:border-ink hover:text-ink`}
        >
          {inner}
        </a>
      );
    return (
      <button
        type="button"
        disabled={!!full}
        aria-pressed={on}
        onClick={() => toggle(d)}
        aria-label={label}
        className={`${shape} ${on ? "border-ink bg-ink text-chalk" : full ? "cursor-not-allowed border-dashed border-ink/15 text-ink/40" : "border-ink/15 bg-paper hover:border-ink"}`}
      >
        {inner}
      </button>
    );
  };

  const units = (n: number) => `${n} ${unit}${n === 1 ? "" : "s"}`;

  if (sessions && !months.length)
    return (
      <p className="border border-line bg-chalk p-7 text-ink-soft">
        New dates are coming soon. Check back shortly.
      </p>
    );

  /** Extras for the grown-ups, once per family (e.g. a second parent coworking on a Flex day). */
  const familyBoxes = forFamily.map((a) => (
    <label
      key={a.key}
      className={`${isFlex ? "" : "mt-4 "}flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${stay.includes(a.key) ? "border-ink bg-paper" : "border-ink/15 hover:border-ink"}`}
    >
      <span>
        <span className="block text-[0.95rem]">
          {a.prompt ? `${a.prompt} +${usd(a.priceCents)}` : `Staying? ${a.label} +${usd(a.priceCents)}`}
        </span>
        <span className="text-[0.78rem] text-ink-soft">{a.note ?? `${a.time}, once per session for your family`}</span>
      </span>
      <input
        type="checkbox"
        checked={stay.includes(a.key)}
        onChange={() => setStay((s) => (s.includes(a.key) ? s.filter((k) => k !== a.key) : [...s, a.key]))}
        className="h-5 w-5 shrink-0 accent-[var(--color-blue)]"
      />
    </label>
  ));

  return (
    <div className="border border-line bg-chalk">
      {/* Who's coming */}
      <div id={`${kind}-who`} className="border-b border-line p-5 sm:p-7">
        <p className="eyebrow text-[0.62rem] text-ink-soft">
          1 · Who’s coming?
        </p>
        {byName ? (
          <>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {allKids.map((c) => {
                const isAdded = added.some((a) => a.id === c.id);
                const on = chosenKids.includes(c.id);
                // A child fits if they're the right age on any chosen day (or any upcoming day before
                // one is chosen): a child turning 18 months next week can book camp days after that.
                const fitDay = fitsOn(c);
                const g = fitDay ? groupOf(c, fitDay) : undefined;
                const m = ageInMonths(c.birthDate, today);
                const from = fitDay && !groupOf(c, picked[0] ?? today) && !picked.length ? fitDay : null;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggleKid(c.id)}
                      disabled={!g && !on}
                      aria-pressed={on}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                        on
                          ? "border-ink bg-paper"
                          : g
                            ? "border-ink/15 hover:border-ink"
                            : "cursor-not-allowed border-dashed border-ink/15 text-ink/40"
                      }`}
                    >
                      <span>
                        <span className="block text-[0.95rem]">{c.name}{isAdded ? <span className="ml-2 text-[0.72rem] text-blue">New</span> : null}</span>
                        <span className="text-[0.78rem] text-ink-soft">
                          {m >= 0 ? ageText(m) : "Not yet born"} ·{" "}
                          {g
                            ? isFlex && c.flexHold
                              ? `Staying with ${g.label}`
                              : `${g.cohort ? g.label : `${g.label} group`}${from ? ` from ${fmt(from, { month: "short", day: "numeric" })}` : ""}`
                            : m < Math.min(...groups.map((x) => x.minAge ?? 0))
                              ? `Joins from ${ageText(Math.min(...groups.map((x) => x.minAge ?? 0)))}`
                              : "Past this program’s ages"}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.8rem] ${on ? "border-ink bg-ink text-chalk" : "border-ink/25"}`}
                      >
                        {on ? "✓" : ""}
                      </span>
                    </button>
                    {isAdded ? (
                      <button type="button" onClick={() => removeAdded(c.id)} className="mt-1 ml-1 text-[0.75rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                        Remove {c.name.split(" ")[0]}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p
              className={`mt-2 text-[0.8rem] ${hint ? "text-oxblood" : "text-ink-soft"}`}
            >
              {hint
                ? "Choose at least one child to continue."
                : "Tap each child who’s coming."}
              {familyRate && !hint
                ? " Siblings on the same evening get the family rate."
                : ""}{" "}
            </p>
            {adding ? (
              <div className="mt-4 rounded-xl border border-ink/15 bg-paper p-4">
                <p className="text-[0.9rem]">Add another child</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="text-[0.78rem] text-ink-soft">
                    First name
                    <input value={draft.firstName} onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))} autoComplete="off" className="mt-1 block h-10 w-full rounded-lg border border-ink/20 bg-chalk px-3 text-[0.95rem] text-ink" />
                  </label>
                  <label className="text-[0.78rem] text-ink-soft">
                    Last name
                    <input value={draft.lastName} onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))} autoComplete="off" className="mt-1 block h-10 w-full rounded-lg border border-ink/20 bg-chalk px-3 text-[0.95rem] text-ink" />
                  </label>
                  <label className="text-[0.78rem] text-ink-soft">
                    Date of birth
                    <input type="date" max={today} value={draft.birthDate} onChange={(e) => setDraft((d) => ({ ...d, birthDate: e.target.value }))} className="mt-1 block h-10 w-full rounded-lg border border-ink/20 bg-chalk px-3 text-[0.95rem] text-ink" />
                  </label>
                </div>
                {addError ? <p className="mt-2 text-[0.8rem] text-oxblood">{addError}</p> : null}
                <div className="mt-3 flex gap-3">
                  <button type="button" onClick={addChild} className="h-10 rounded-full bg-ink px-5 text-[0.85rem] text-chalk hover:bg-blue">
                    Add child
                  </button>
                  <button type="button" onClick={() => { setAdding(false); setAddError(null); }} className="h-10 rounded-full border border-ink/20 px-5 text-[0.85rem] hover:border-ink">
                    Cancel
                  </button>
                </div>
                <p className="mt-2 text-[0.75rem] text-ink-soft">They’re added to your Family Portal when you check out.</p>
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="mt-3 text-[0.85rem] text-blue underline-offset-4 hover:underline">
                + Add another child
              </button>
            )}
          </>
        ) : (
          <>
            <ul
              className={`mt-3 grid gap-2 sm:grid-cols-2 ${groups.length === 3 ? "lg:grid-cols-3" : ""}`}
            >
              {groups.map((g) => {
                const n = counts[g.key] ?? 0;
                return (
                  <li
                    key={g.key}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${n ? "border-ink bg-paper" : "border-ink/15"}`}
                  >
                    <span>
                      <span className="block text-[0.95rem]">{g.label}</span>
                      {g.sub ? (
                        <span className="text-[0.78rem] text-ink-soft">
                          {g.sub}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="flex items-center gap-2"
                      role="group"
                      aria-label={`Children in ${g.label}`}
                    >
                      <button
                        type="button"
                        onClick={() => bump(g.key, -1)}
                        disabled={!n}
                        aria-label={`One fewer in ${g.label}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/20 text-[1rem] hover:border-ink disabled:opacity-30"
                      >
                        −
                      </button>
                      <span
                        className="w-4 text-center tabular-nums"
                        aria-live="polite"
                      >
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
            <p
              className={`mt-2 text-[0.8rem] ${hint ? "text-oxblood" : "text-ink-soft"}`}
            >
              {hint
                ? `Add at least one child to continue.`
                : groups.length > 1
                  ? `Bringing more than one? Add each child to their ${groupNoun}.`
                  : "Bringing more than one? Add each child."}
              {familyRate
                ? " Siblings on the same evening get the family rate."
                : ""}

            </p>
          </>
        )}
        {siblingPct > 0 && !familyRate ? (
          children >= 2 ? (
            <p className="mt-4 rounded-xl border border-[#2c6447]/25 bg-[#e6f0ea] px-4 py-3 text-[0.88rem] text-[#2c6447]" aria-live="polite">
              <span className="font-medium">Sibling discount applied:</span> {siblingPct}% off each additional child on the same day
              {siblingSaving > 0 ? `, so you save ${usd(siblingSaving)}` : ""}. It works with coupon codes too.
            </p>
          ) : (
            <p className="mt-3 text-[0.8rem] text-ink-soft">Bringing a sibling? Each additional child gets {siblingPct}% off, on top of any coupon code.</p>
          )
        ) : null}
        {isFlex ? null : familyBoxes}
        {isFlex ? (
          <div className="mt-6 space-y-3">
            <p className="text-[0.85rem] text-ink-soft">How long?</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Day length">
              {[
                { on: !half, label: "Full day", time: "8:30am–4:30pm", set: () => setHalf(false) },
                { on: half, label: "Half day", time: "8:30am–12:00pm", set: () => setHalf(true) },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={o.on}
                  onClick={o.set}
                  className={`rounded-full border px-4 py-2 text-[0.88rem] transition-colors ${o.on ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"}`}
                >
                  {o.label} <span className={o.on ? "text-chalk/70" : "text-ink-soft"}>{o.time}</span>
                </button>
              ))}
            </div>
            <label
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${early ? "border-ink bg-paper" : "border-ink/15 hover:border-ink"}`}
            >
              <span>
                <span className="block text-[0.95rem]">Add Early Bird +$16 per child</span>
                <span className="text-[0.78rem] text-ink-soft">8:00–8:30am, for children 12 months and older, on days it’s offered</span>
              </span>
              <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} className="h-5 w-5 accent-[var(--color-blue)]" />
            </label>
            {familyBoxes}
          </div>
        ) : null}
      </div>

      {/* Dates */}
      <div className="p-5 sm:p-7">
        <p className="eyebrow text-[0.62rem] text-ink-soft">
          2 · Choose your {unit}s
        </p>
        {waiting ? (
          <p className="mt-2 text-[0.85rem] text-ink-soft">
            Add who’s coming above to see which days have a spot open for your child’s age group.
          </p>
        ) : null}
        {!sessions && !days.length ? (
          <div className="mt-4 space-y-3" aria-busy="true">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[4.25rem] animate-pulse rounded-xl bg-sand/50"
              />
            ))}
          </div>
        ) : flow ? (
          <div className="mt-4">
            {all.filter(pickable).length > 1 ? (
              <button
                type="button"
                onClick={() => toggleMonth(all)}
                className="mb-3 text-[0.78rem] text-blue underline-offset-4 hover:underline"
              >
                {all.filter(pickable).every((d) => picked.includes(d))
                  ? "Clear"
                  : "Select all"}
              </button>
            ) : null}
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {all.map((d) => (
                <li key={d}>{tile(d, true)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {months.map(([month, list]) => {
              const can = list.filter(pickable);
              const allIn =
                can.length > 0 && can.every((d) => picked.includes(d));
              return (
                <div
                  key={month}
                  className={`grid gap-3 py-4 sm:grid-cols-[8.5rem_1fr] ${isFlex ? "sm:items-start sm:pt-9" : "sm:items-center"}`}
                >
                  <div className="flex items-baseline justify-between gap-3 sm:block">
                    <p className="font-serif text-[1.3rem] leading-tight">
                      {fmt(`${month}-01`, { month: "long" })}{" "}
                      <span className="text-[0.85rem] text-ink-soft italic">
                        {month.slice(0, 4)}
                      </span>
                    </p>
                    {can.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => toggleMonth(list)}
                        className="text-[0.78rem] text-blue underline-offset-4 hover:underline"
                      >
                        {allIn ? "Clear" : "Select all"}
                      </button>
                    ) : null}
                  </div>
                  {isFlex ? (
                    // Yalla Flex runs Monday to Friday: one row per week, each weekday in its own column.
                    <div className="space-y-2">
                      <div className="grid grid-cols-5 gap-2 text-center text-[0.62rem] tracking-[0.14em] text-ink-soft uppercase" aria-hidden>
                        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((w) => (
                          <span key={w}>{w}</span>
                        ))}
                      </div>
                      {weeksOf(list).map((week) => (
                        <ul key={week[0] ?? week.find(Boolean)} className="grid grid-cols-5 gap-2">
                          {week.map((d, i) => (
                            <li key={d ?? `gap-${i}`}>{d ? tile(d, false, true) : <span aria-hidden className="block h-[5.25rem] w-full rounded-xl border border-dashed border-ink/[0.07]" />}</li>
                          ))}
                        </ul>
                      ))}
                    </div>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {list.map((d) => (
                        <li key={d}>{tile(d, false)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
                    · {children} {children === 1 ? "child" : "children"} ·{" "}
                    {siblingSaving > 0 ? (
                      <>
                        <span className="text-ink-soft/70 line-through">{usd(total)}</span>{" "}
                        <span className="font-medium text-ink">{usd(total - siblingSaving)}</span>
                      </>
                    ) : (
                      usd(total)
                    )}
                  </span>
                ) : (
                  <span className="text-ink-soft"> · add who’s coming</span>
                )}
                {children && siblingSaving > 0 ? (
                  <span className="block text-[0.78rem] text-[#2c6447]">
                    Includes the sibling discount: −{usd(siblingSaving)} ({siblingPct}% off each additional child)
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-ink-soft">
                Tap each {unit} you’d like to reserve.
              </p>
            )}
            {tooYoungOn.length ? (
              <p className="mt-0.5 text-[0.75rem] text-oxblood">
                Not old enough yet: {tooYoungOn.slice(0, 3).join(", ")}
                {tooYoungOn.length > 3 ? ` and ${tooYoungOn.length - 3} more` : ""}
              </p>
            ) : null}
            {fullFor.length ? (
              <p className="mt-0.5 text-[0.75rem] text-oxblood">
                Full: {fullFor.slice(0, 3).join(", ")}
                {fullFor.length > 3 ? ` and ${fullFor.length - 3} more` : ""}
              </p>
            ) : null}
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
      {checkout ? (
        <Checkout
          sessions={checkout.sessions}
          guardian={ctx.guardian}
          savedChildren={ctx.savedChildren}
          includeChildren={checkout.include}
          newChildren={checkout.newChildren}
          includeExtras={checkout.includeExtras}
          wallet={ctx.wallet}
          sibling={ctx.sibling}
          spots={checkout.spots}
          onSpots={(sessionId, n) => {
            const s = checkout.sessions.find((x) => x.id === sessionId);
            if (n > 0 && s) addToCart([{ id: s.id, date: s.localDate, label: s.title || s.programName, spots: Math.min(8, n), extras: checkout.extras[s.id] ?? [] }]);
            else {
              removeFromCart([sessionId]);
              // Taken out in checkout: untick that day here too, unless another booking that day remains.
              if (s && !checkout.sessions.some((x) => x.id !== sessionId && x.localDate === s.localDate)) setPicked((p) => p.filter((d) => d !== s.localDate));
            }
            setCheckout((c) =>
              c
                ? n > 0
                  ? { ...c, spots: { ...c.spots, [sessionId]: Math.min(8, n) } }
                  : c.sessions.length > 1
                    ? { ...c, sessions: c.sessions.filter((x) => x.id !== sessionId), spots: Object.fromEntries(Object.entries(c.spots).filter(([k]) => k !== sessionId)) }
                    : null
                : c,
            );
          }}
          defaultExtras={checkout.extras}
          onClose={() => setCheckout(null)}
          onRefresh={() => setReloadKey((k) => k + 1)}
          onSignedIn={() => setFamilyKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}
