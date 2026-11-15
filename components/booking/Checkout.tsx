"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  agreementsAction,
  submitBookingAction,
} from "@/app/(site)/book/actions";
import { Mark } from "@/components/brand/Mark";
import { Markup } from "@/components/faq/FaqAnswer";
import { SignaturePad } from "@/components/forms/SignaturePad";
import { isShown, validateAnswers, type Answers } from "@/lib/forms/fields";
import type { Agreement, PublicSession } from "@/lib/ops/public-booking";
import { ageInMonths, fmtDate, fmtTime } from "@/lib/time";
import { usd } from "./format";
import {
  FAMILY_RATE,
  familyRateKey,
  familyRateTotal,
} from "@/lib/booking/family-rate";
import { addonsFor, sessionAddonsCents } from "@/lib/booking/addons";

export type SavedChild = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  birthDate: string;
};
export type SignedInGuardian = {
  firstName: string;
  lastName: string;
  email: string;
};

type ChildDraft = {
  key: string;
  existingId: string | null;
  firstName: string;
  lastName: string;
  birthDate: string;
  allergies: string;
  include: boolean;
};

const steps = ["Children", "Your details", "Review & agree"] as const;
const input =
  "w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";

/** Two sessions that happen at the same time on the same day. */
function overlaps(a: PublicSession, b: PublicSession) {
  return a.localDate === b.localDate && a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/** How many different children the chosen spots need: the most spots at any one time. */
function childrenNeeded(sessions: PublicSession[], spots: Record<string, number>) {
  const fixed = sessions.filter((s) => (spots[s.id] ?? 1) > 0);
  return fixed.reduce((most, s) => Math.max(most, fixed.filter((o) => overlaps(o, s)).reduce((t, o) => t + (spots[o.id] ?? 1), 0)), 0);
}

export function Checkout({
  sessions,
  guardian,
  savedChildren,
  includeChildren = [],
  includeExtras = [],
  wallet = null,
  sibling = { percent: 0, withPass: false },
  spots = {},
  onSpots,
  defaultExtras = {},
  onClose,
  onRefresh,
}: {
  sessions: PublicSession[];
  guardian: SignedInGuardian | null;
  savedChildren: SavedChild[];
  /** Saved children to start ticked (chosen by name on a program page). */
  includeChildren?: string[];
  /** Per-family extras chosen on a program page (e.g. coworking), on until changed here. */
  includeExtras?: string[];
  /** The signed-in family's Yalla Wallet: Play Pass balance and Yalla credits (null when not signed in). */
  wallet?: { passCents: number; creditCents: number } | null;
  /** The sibling discount (Settings → Billing), mirrored here so the total matches the invoice. */
  sibling?: { percent: number; withPass: boolean };
  /** Spots per session: one child each. 0 = an age group of a Happening, matched to children by age. */
  spots?: Record<string, number>;
  /** Change a session's spots from checkout (0 removes it from the selection). */
  onSpots?: (sessionId: string, n: number) => void;
  /** Extras chosen per session before checkout (e.g. Yalla Flex half day, Early Bird). */
  defaultExtras?: Record<string, string[]>;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [step, setStep] = useState(0);
  const [kids, setKids] = useState<ChildDraft[]>(() =>
    savedChildren.length
      ? savedChildren.map((c) => ({
          key: c.id,
          existingId: c.id,
          firstName: c.preferredName || c.firstName,
          lastName: c.lastName,
          birthDate: c.birthDate,
          allergies: "",
          include: includeChildren.includes(c.id),
        }))
      : Array.from({ length: Math.max(1, childrenNeeded(sessions, spots)) }, (_, i) => ({
          key: `new-${i + 1}`,
          existingId: null,
          firstName: "",
          lastName: "",
          birthDate: "",
          allergies: "",
          include: true,
        })),
  );
  /** Which child fills each spot, per session (fixed-spot sessions only). */
  const [slots, setSlots] = useState<Record<string, string[]>>({});
  const [assign, setAssign] = useState<Record<string, string[]>>({});
  const [adult, setAdult] = useState({
    firstName: guardian?.firstName ?? "",
    lastName: guardian?.lastName ?? "",
    email: guardian?.email ?? "",
    phone: "",
  });
  const [agreements, setAgreements] = useState<Agreement[] | null>(null);
  const [signatures, setSignatures] = useState<
    Record<string, { text: string; consent: boolean }>
  >({});
  const [error, setError] = useState<{ text: string; devLink?: string } | null>(
    null,
  );
  const [pending, start] = useTransition();
  /** Optional extras chosen per session and child, e.g. Camp Yalla Early Bird. */
  const [extras, setExtras] = useState<
    Record<string, Record<string, string[]>>
  >({});

  /** Whether an extra can be added for this child on this day (age limit, seats opened by staff). */
  const addonOk = (s: PublicSession, a: ReturnType<typeof addonsFor>[number], key: string) => {
    if (a.limitedSeats && !s.earlyBirdOpen) return false;
    if (a.minAgeMonths != null) {
      const k = kids.find((x) => x.key === key);
      if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(k.birthDate) || ageInMonths(k.birthDate, s.localDate) < a.minAgeMonths) return false;
    }
    return true;
  };
  /** A child's extras for a session; extras chosen before checkout apply until changed here. */
  const extrasOf = (e: typeof extras, s: PublicSession, key: string) =>
    (
      e[s.id]?.[key] ??
      addonsFor(s.kind, s.programSlug)
        .filter((a) => includeExtras.includes(a.key) || (defaultExtras[s.id] ?? []).includes(a.key))
        .filter((a) => a.perFamily || a.dayLength || a.limitedSeats || a.minAgeMonths != null)
        .map((a) => a.key)
    ).filter((k) => {
      const a = addonsFor(s.kind, s.programSlug).find((x) => x.key === k);
      return !a || addonOk(s, a, key);
    });
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [sessions],
  );
  const chosen = kids.filter(
    (k) =>
      k.include &&
      k.firstName.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(k.birthDate),
  );
  const spotsOf = (sid: string) => spots[sid] ?? 1;
  const fixed = sorted.filter((s) => spotsOf(s.id) > 0);
  const needed = childrenNeeded(sessions, spots);
  // A new child's form that's been started must be finished (name and date of birth).
  const unfinished = kids.some(
    (k) => !k.existingId && k.include && (k.firstName.trim() || k.lastName.trim() || k.birthDate) && !(k.firstName.trim() && /^\d{4}-\d{2}-\d{2}$/.test(k.birthDate)),
  );

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const eligible = (s: PublicSession, k: ChildDraft) => {
    const m = ageInMonths(k.birthDate, s.localDate);
    return (
      (s.ages.min == null || m >= s.ages.min) &&
      (s.ages.max == null || m <= s.ages.max)
    );
  };
  const isOn = (sid: string, key: string) =>
    spotsOf(sid) > 0
      ? (slots[sid] ?? []).includes(key)
      : (assign[sid] ?? chosen.map((c) => c.key)).includes(key);
  // A Happening with several age groups arrives as one session per group: show only the groups
  // a chosen child fits, and say which chosen sessions none of the children can attend.
  const fits = (s: PublicSession) => chosen.some((c) => eligible(s, c));
  const shownSessions = sorted.filter((s) => spotsOf(s.id) > 0 || fits(s));
  const skipped = [
    ...new Map(
      sorted
        .filter((s) => spotsOf(s.id) === 0)
        .filter((s) => !sorted.some((o) => o.programId === s.programId && o.startsAt === s.startsAt && fits(o)))
        .map((s) => [`${s.programId}|${s.startsAt}`, s]),
    ).values(),
  ];
  const lines = sorted
    .map((s) => {
      const childKeys = chosen
        .filter((c) => isOn(s.id, c.key) && eligible(s, c))
        .map((c) => c.key);
      return {
        sessionId: s.id,
        childKeys,
        addons: Object.fromEntries(
          childKeys.map((k) => [k, extrasOf(extras, s, k)]),
        ),
      };
    })
    .filter((l) => l.childKeys.length);
  const addonTotal = sorted.reduce((sum, s) => {
    const l = lines.find((x) => x.sessionId === s.id);
    return (
      sum +
      (l
        ? sessionAddonsCents(
            s.kind,
            s.programSlug,
            l.childKeys.map((k) => l.addons[k] ?? []),
          )
        : 0)
    );
  }, 0);
  const toggleExtra = (sid: string, key: string, addon: string) =>
    setExtras((e) => {
      // Start from what's shown (including choices carried over from the program page).
      const sess = sorted.find((x) => x.id === sid);
      const cur = e[sid]?.[key] ?? (sess ? extrasOf(e, sess, key) : []);
      return {
        ...e,
        [sid]: {
          ...e[sid],
          [key]: cur.includes(addon)
            ? cur.filter((x) => x !== addon)
            : [...cur, addon],
        },
      };
    });
  /** One child's price for a session: a Yalla Flex half day uses the half-day rate. */
  const unitPrice = (s: PublicSession, key: string) =>
    s.halfPriceCents != null && extrasOf(extras, s, key).some((k) => addonsFor(s.kind, s.programSlug).some((a) => a.key === k && a.dayLength === "half"))
      ? s.halfPriceCents
      : (s.priceCents ?? 0);
  const childrenTotal = (s: PublicSession) => (lines.find((l) => l.sessionId === s.id)?.childKeys ?? []).reduce((t, k) => t + unitPrice(s, k), 0);
  // After Hours siblings on the same evening are capped at the family rate, matching the invoice.
  const evenings = new Map<string, number[]>();
  // The same sum over Play Pass–eligible sessions only (an estimate; the server decides the real amount).
  const eligibleEvenings = new Map<string, number[]>();
  const eligibleTotal =
    sorted.reduce((sum, s) => {
      const l = lines.find((x) => x.sessionId === s.id);
      const n = l?.childKeys.length ?? 0;
      if (!s.playPassEligible || !n) return sum;
      const extrasCents = sessionAddonsCents(s.kind, s.programSlug, l!.childKeys.map((k) => l!.addons[k] ?? []));
      if (s.kind === FAMILY_RATE.kind && s.bookingUnit === "per_child") {
        const k = familyRateKey(s.programId, s.localDate);
        eligibleEvenings.set(k, [...(eligibleEvenings.get(k) ?? []), ...Array<number>(n).fill(s.priceCents ?? 0)]);
        return sum + extrasCents;
      }
      return sum + (s.bookingUnit === "per_child" ? childrenTotal(s) : (s.priceCents ?? 0)) + extrasCents;
    }, 0) + [...eligibleEvenings.values()].reduce((sum, prices) => sum + familyRateTotal(prices), 0);
  const grossTotal =
    sorted.reduce((sum, s) => {
      const n = lines.find((l) => l.sessionId === s.id)?.childKeys.length ?? 0;
      if (s.kind === FAMILY_RATE.kind && s.bookingUnit === "per_child" && n) {
        const k = familyRateKey(s.programId, s.localDate);
        evenings.set(k, [
          ...(evenings.get(k) ?? []),
          ...Array<number>(n).fill(s.priceCents ?? 0),
        ]);
        return sum;
      }
      return sum + (s.bookingUnit === "per_child" ? childrenTotal(s) : n ? (s.priceCents ?? 0) : 0);
    }, 0) +
    [...evenings.values()].reduce(
      (sum, prices) => sum + familyRateTotal(prices),
      0,
    ) +
    addonTotal;
  const familySaving = [...evenings.values()].reduce(
    (sum, prices) =>
      sum + prices.reduce((a, b) => a + b, 0) - familyRateTotal(prices),
    0,
  );
  // Sibling discount: each additional child at the same program on the same day (across age
  // groups), the highest price paying in full. Mirrors the invoice; the server has the final say.
  const siblingByDay = new Map<string, { prices: number[]; eligible: boolean }>();
  if (sibling.percent > 0)
    for (const s of sorted) {
      const n = lines.find((l) => l.sessionId === s.id)?.childKeys.length ?? 0;
      if (!n || s.bookingUnit !== "per_child" || s.kind === FAMILY_RATE.kind || !s.priceCents) continue;
      if (!sibling.withPass && (wallet?.passCents ?? 0) > 0 && s.playPassEligible) continue;
      const k = `${s.programId}|${s.localDate}`;
      const g = siblingByDay.get(k) ?? { prices: [], eligible: !!s.playPassEligible };
      g.prices.push(...(lines.find((l) => l.sessionId === s.id)?.childKeys ?? []).map((k) => unitPrice(s, k)));
      siblingByDay.set(k, g);
    }
  let siblingSaving = 0;
  let siblingSavingEligible = 0;
  for (const g of siblingByDay.values()) {
    const off = [...g.prices].sort((a, b) => b - a).slice(1).reduce((sum, p) => sum + Math.round((p * sibling.percent) / 100), 0);
    siblingSaving += off;
    if (g.eligible) siblingSavingEligible += off;
  }
  const total = grossTotal - siblingSaving;
  // Play Pass balance covers eligible experiences; Yalla credits cover anything left.
  const passUse = Math.min(wallet?.passCents ?? 0, Math.max(0, eligibleTotal - siblingSavingEligible), total);
  const fromPass = passUse + Math.min(wallet?.creditCents ?? 0, total - passUse);
  const walletCents = wallet ? wallet.passCents + wallet.creditCents : null;
  const sigKey = (a: Agreement) => `${a.templateId}:${a.childKey ?? "family"}`;

  // Load the agreements that must be signed before booking.
  useEffect(() => {
    if (step !== 2) return;
    let current = true;
    setAgreements(null);
    agreementsAction({
      sessionIds: lines.map((l) => l.sessionId),
      children: chosen.map((c) => ({
        key: c.key,
        existingId: c.existingId,
        firstName: c.firstName,
        birthDate: c.birthDate,
      })),
    }).then((list) => {
      if (current) setAgreements(list);
    });
    return () => {
      current = false;
    };
    // Refetch once each spot has its child (spots are filled just after this step opens).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, JSON.stringify(lines.map((l) => [l.sessionId, l.childKeys]))]);

  // Online agreements (questions, initials, drawn signature): answers per agreement and child.
  const [formAnswers, setFormAnswers] = useState<Record<string, Answers>>({});
  const setAnswer = (k: string, id: string, v: string) => setFormAnswers((x) => ({ ...x, [k]: { ...(x[k] ?? {}), [id]: v } }));
  const agreementsDone = (agreements ?? []).every((a) => {
    if (!a.completableOnline) return false;
    const s = signatures[sigKey(a)];
    if (a.fields && !validateAnswers(a.fields, formAnswers[sigKey(a)] ?? {}).ok) return false;
    return s?.consent && (!a.requiresSignature || s.text.trim().length > 1);
  });
  /** The first thing still missing on an online agreement, worded for families. */
  const agreementProblem = (a: Agreement) => {
    if (!a.fields) return null;
    const r = validateAnswers(a.fields, formAnswers[sigKey(a)] ?? {});
    return r.ok ? null : r.error;
  };

  // Fill each spot with a child who fits its age group and isn't already somewhere else at that time.
  useEffect(() => {
    if (step !== 2) return;
    setSlots((prev) => {
      const next: Record<string, string[]> = {};
      const busy = (key: string, s: PublicSession, self: number) =>
        fixed.some((o) => overlaps(o, s) && (next[o.id] ?? []).some((k, i) => k === key && !(o.id === s.id && i === self)));
      for (const s of fixed) {
        const n = spotsOf(s.id);
        const arr = (prev[s.id] ?? []).slice(0, n).map((k) => (chosen.some((c) => c.key === k && eligible(s, c)) ? k : ""));
        while (arr.length < n) arr.push("");
        next[s.id] = arr;
      }
      for (const s of fixed) {
        const arr = next[s.id];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] && arr.indexOf(arr[i]) === i && !busy(arr[i], s, i)) continue;
          arr[i] = "";
          arr[i] = chosen.find((c) => eligible(s, c) && !arr.includes(c.key) && !busy(c.key, s, i))?.key ?? "";
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, JSON.stringify(spots), chosen.length]);

  const slotProblem = (() => {
    for (const s of fixed) {
      const arr = slots[s.id] ?? [];
      const label = `${s.title} on ${fmtDate(s.localDate, "EEE d MMM")}`;
      if (!chosen.some((c) => eligible(s, c))) return `None of the children you added are in the age group for ${label}. Remove that spot, or go back and add the child it’s for.`;
      if (arr.length < spotsOf(s.id) || arr.some((k) => !k)) return `Choose a child for each spot. ${label} still has an empty spot. Added one by mistake? Remove it.`;
      if (new Set(arr).size !== arr.length) return `Each spot needs a different child (${label}).`;
    }
    for (const a of fixed)
      for (const b of fixed)
        if (a.id < b.id && overlaps(a, b)) {
          const both = (slots[a.id] ?? []).find((k) => k && (slots[b.id] ?? []).includes(k));
          if (both) return `${chosen.find((c) => c.key === both)?.firstName ?? "A child"} can’t be in two places at once on ${fmtDate(a.localDate, "EEE d MMM")}. Choose a different child for one of those spots.`;
        }
    return null;
  })();

  // Each chosen spot needs enough children who fit its age group on the day, checked as soon as
  // birth dates are entered, with the exact birth-date range for that session.
  const fmtBorn = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const bornRange = (sess: PublicSession) => {
    const [y, m, d] = sess.localDate.split("-").map(Number);
    const latest = sess.ages.min != null ? new Date(Date.UTC(y, m - 1 - sess.ages.min, d)) : null;
    const earliest = sess.ages.max != null ? new Date(Date.UTC(y, m - 1 - (sess.ages.max + 1), d + 1)) : null;
    if (latest && earliest) return `born between ${fmtBorn(earliest)} and ${fmtBorn(latest)}`;
    if (latest) return `born on or before ${fmtBorn(latest)}`;
    if (earliest) return `born on or after ${fmtBorn(earliest)}`;
    return null;
  };
  const ageProblem = (() => {
    if (!chosen.length) return null;
    for (const sess of fixed) {
      const fit = chosen.filter((c) => eligible(sess, c)).length;
      if (fit >= spotsOf(sess.id)) continue;
      const range = bornRange(sess);
      const label = `${sess.title} on ${fmtDate(sess.localDate, "EEE d MMM")}`;
      const who = chosen.length === 1 ? `${chosen[0].firstName} isn’t in the age group for ${label}.` : `Not enough of the children you added are in the age group for ${label}.`;
      return `${who}${range ? ` To attend, a child must be ${range}.` : ""} Check the date of birth, or go back and choose the right age group.`;
    }
    return null;
  })();

  const canNext =
    step === 0
      ? chosen.length > 0 && chosen.length >= needed && !unfinished && !ageProblem
      : step === 1
        ? !!guardian ||
          (adult.firstName.trim() !== "" &&
            adult.lastName.trim() !== "" &&
            /\S+@\S+\.\S+/.test(adult.email))
        : lines.length > 0 && !slotProblem && agreements !== null && agreementsDone;

  function submit() {
    setError(null);
    start(async () => {
      const res = await submitBookingAction({
        guardian: adult,
        children: chosen.map((c) => ({
          key: c.key,
          existingId: c.existingId,
          firstName: c.firstName,
          lastName: c.lastName || adult.lastName,
          birthDate: c.birthDate,
          allergies: c.allergies,
        })),
        lines,
        signatures: (agreements ?? []).map((a) => ({
          templateId: a.templateId,
          childKey: a.childKey,
          signatureText: signatures[sigKey(a)]?.text,
          consent: !!signatures[sigKey(a)]?.consent,
          answers: a.fields ? formAnswers[sigKey(a)] : undefined,
        })),
      });
      if (res.ok) {
        window.location.href = res.url;
        return;
      }
      setError({ text: res.error, devLink: res.devLink });
      if (res.agreements) setAgreements(res.agreements);
      if (res.code === "capacity" || res.code === "closed") onRefresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Book care"
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div className="relative flex h-full w-full flex-col bg-chalk shadow-2xl sm:max-w-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-5 sm:px-10">
          <div className="flex items-center gap-3">
            <Mark name="wordmark" className="h-6 w-auto text-blue" />
            <span className="eyebrow text-[0.58rem] text-ink-soft">
              Book care
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-sand"
            aria-label="Close checkout"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2 px-6 pt-6 sm:px-10">
          {steps.map((s, i) => (
            <div key={s} className="flex-1">
              <div
                className={`h-[2px] transition-colors duration-500 ${i <= step ? "bg-blue" : "bg-line"}`}
              />
              <p
                className={`eyebrow mt-2 hidden text-[0.55rem] sm:block ${i === step ? "text-ink" : "text-ink-soft/60"}`}
              >
                {s}
              </p>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10">
          {error ? (
            <div
              role="alert"
              className="mb-6 border-l-2 border-oxblood/50 pl-4 text-[0.92rem] text-oxblood"
            >
              {error.text}
              {error.devLink ? (
                <p className="mt-2 text-[0.75rem] break-all text-ink-soft">
                  Local preview — the email was captured, not sent:{" "}
                  <a href={error.devLink} className="underline">
                    open sign-in link
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 0 ? (
            <div>
              <h2 className="display text-[2rem]">Who’s coming?</h2>
              <p className="mt-2 text-ink-soft">
                {savedChildren.length
                  ? "Choose from your children, or add another."
                  : "Add each child you’re booking for."}
              </p>
              <div className="mt-8 space-y-4">
                {kids.map((c, i) =>
                  c.existingId ? (
                    <label
                      key={c.key}
                      className={`flex cursor-pointer items-center justify-between border p-5 transition-colors ${c.include ? "border-blue bg-blue/[0.05]" : "border-line bg-paper"}`}
                    >
                      <span>
                        <span className="display block text-[1.3rem]">
                          {c.firstName}
                        </span>
                        <span className="text-[0.82rem] text-ink-soft">
                          Born {fmtDate(c.birthDate, "d MMMM yyyy")}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={c.include}
                        onChange={(e) =>
                          setKids((ks) =>
                            ks.map((x) =>
                              x.key === c.key
                                ? { ...x, include: e.target.checked }
                                : x,
                            ),
                          )
                        }
                        className="h-5 w-5"
                      />
                    </label>
                  ) : (
                    <div
                      key={c.key}
                      className="border border-line bg-paper p-6"
                    >
                      <div className="flex items-center justify-between">
                        <p className="eyebrow text-[0.6rem] text-ink-soft">
                          {savedChildren.length
                            ? "New child"
                            : `Child ${i + 1}`}
                        </p>
                        {kids.filter((k) => !k.existingId).length > 1 ||
                        savedChildren.length ? (
                          <button
                            onClick={() =>
                              setKids((ks) => ks.filter((x) => x.key !== c.key))
                            }
                            className="text-[0.75rem] text-ink-soft hover:text-ink"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-5 sm:grid-cols-2">
                        {(
                          [
                            ["firstName", "First name", "text"],
                            ["lastName", "Last name", "text"],
                            ["birthDate", "Date of birth", "date"],
                            ["allergies", "Allergies (optional)", "text"],
                          ] as const
                        ).map(([k, l, t]) => (
                          <label key={k} className="block">
                            <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">
                              {l}
                            </span>
                            <input
                              type={t}
                              value={c[k]}
                              onChange={(e) =>
                                setKids((ks) =>
                                  ks.map((x) =>
                                    x.key === c.key
                                      ? { ...x, [k]: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                              className={input}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ),
                )}
                <button
                  onClick={() =>
                    setKids((ks) => [
                      ...ks,
                      {
                        key: `new-${Date.now()}`,
                        existingId: null,
                        firstName: "",
                        lastName: "",
                        birthDate: "",
                        allergies: "",
                        include: true,
                      },
                    ])
                  }
                  className="text-[0.9rem] text-blue underline-offset-4 hover:underline"
                >
                  + Add {savedChildren.length ? "a new child" : "another child"}
                </button>
                {needed > 1 && chosen.length < needed ? (
                  <p className="border-l-2 border-blue/40 pl-3 text-[0.88rem] text-ink-soft">
                    You’ve chosen {needed} spots at the same time, so {savedChildren.length ? "choose or add" : "add the name and date of birth for"} {needed} children
                    {chosen.length ? ` (${needed - chosen.length} more to go)` : ""}. Added a spot by mistake?{" "}
                    <button onClick={onClose} className="text-blue underline underline-offset-4">
                      Go back to your selection
                    </button>{" "}
                    and remove it.
                  </p>
                ) : null}
                {ageProblem && !unfinished && chosen.length >= needed ? (
                  <p role="alert" className="border-l-2 border-oxblood/50 pl-3 text-[0.88rem] text-oxblood">
                    {ageProblem}{" "}
                    <button onClick={onClose} className="underline underline-offset-4">
                      Go back to your selection
                    </button>
                  </p>
                ) : null}
                {unfinished ? (
                  <p className="border-l-2 border-oxblood/40 pl-3 text-[0.88rem] text-oxblood">Add a first name and date of birth for each child, or remove the extra form.</p>
                ) : null}
              </div>
            </div>
          ) : step === 1 ? (
            <div>
              <h2 className="display text-[2rem]">Your details</h2>
              {guardian ? (
                <p className="mt-4 text-ink-soft">
                  Booking as{" "}
                  <span className="text-ink">
                    {guardian.firstName} {guardian.lastName}
                  </span>{" "}
                  ({guardian.email}).
                </p>
              ) : (
                <>
                  <p className="mt-2 text-ink-soft">
                    We’ll set up your Family Portal so you can manage bookings
                    any time. Already with Yalla?{" "}
                    <Link
                      href="/portal?next=/book"
                      className="text-ink underline underline-offset-4"
                    >
                      Sign in
                    </Link>
                    .
                  </p>
                  <div className="mt-8 grid gap-6 sm:grid-cols-2">
                    {(
                      [
                        ["firstName", "First name", "text", "given-name"],
                        ["lastName", "Last name", "text", "family-name"],
                        ["email", "Email", "email", "email"],
                        ["phone", "Mobile (optional)", "tel", "tel"],
                      ] as const
                    ).map(([k, l, t, ac]) => (
                      <label key={k} className="block">
                        <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">
                          {l}
                        </span>
                        <input
                          type={t}
                          autoComplete={ac}
                          value={adult[k]}
                          onChange={(e) =>
                            setAdult((g) => ({ ...g, [k]: e.target.value }))
                          }
                          className={input}
                        />
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <h2 className="display text-[2rem]">Review</h2>
              <p className="mt-2 text-ink-soft">
                Choose which child each spot is for.
              </p>
              {skipped.length ? (
                <p className="mt-4 border-l-2 border-oxblood/40 pl-3 text-[0.85rem] text-oxblood">
                  Not included, as none of the children you chose are in its age range:{" "}
                  {skipped.map((s) => `${s.title.split(" · ")[0]} on ${fmtDate(s.localDate, "EEE d MMM")}`).join(", ")}.
                </p>
              ) : null}
              <ul className="mt-8 divide-y divide-line border-y border-line">
                {shownSessions.map((s) => (
                  <li key={s.id} className="py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="display text-[1.25rem]">{s.title}</p>
                      <span className="font-serif text-[0.95rem]">
                        {s.kind === FAMILY_RATE.kind
                          ? `${usd(s.priceCents)} per child · family rate applies`
                          : s.halfPriceCents != null
                            ? `${usd(s.priceCents)} full day · ${usd(s.halfPriceCents)} half day`
                            : `${usd(s.priceCents)}${spotsOf(s.id) > 1 ? ` × ${spotsOf(s.id)}` : ""}`}
                      </span>
                    </div>
                    <p className="text-[0.82rem] text-ink-soft">
                      {fmtDate(s.localDate, "EEEE d MMMM")} ·{" "}
                      {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
                    </p>
                    {spotsOf(s.id) > 0 ? (
                      <div className="mt-3 space-y-2">
                        {Array.from({ length: spotsOf(s.id) }, (_, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="w-14 shrink-0 text-[0.75rem] tracking-[0.12em] text-ink-soft uppercase">Spot {i + 1}</span>
                            <select
                              aria-label={`Child for spot ${i + 1}, ${s.title}`}
                              value={slots[s.id]?.[i] ?? ""}
                              onChange={(e) =>
                                setSlots((sl) => {
                                  const arr = [...(sl[s.id] ?? Array<string>(spotsOf(s.id)).fill(""))];
                                  arr[i] = e.target.value;
                                  return { ...sl, [s.id]: arr };
                                })
                              }
                              className={`h-10 min-w-0 flex-1 rounded-full border bg-paper px-4 text-[0.88rem] ${slots[s.id]?.[i] ? "border-ink/25" : "border-oxblood/50"}`}
                            >
                              <option value="">Choose a child</option>
                              {chosen
                                .filter((c) => eligible(s, c))
                                .map((c) => (
                                  <option key={c.key} value={c.key}>
                                    {c.firstName}
                                  </option>
                                ))}
                            </select>
                            {onSpots ? (
                              <button
                                onClick={() => {
                                  setSlots((sl) => ({ ...sl, [s.id]: (sl[s.id] ?? []).filter((_, j) => j !== i) }));
                                  onSpots(s.id, spotsOf(s.id) - 1);
                                }}
                                className="text-[0.75rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {chosen.map((c) => {
                        const ok = eligible(s, c);
                        const on = ok && isOn(s.id, c.key);
                        return (
                          <button
                            key={c.key}
                            disabled={!ok}
                            aria-pressed={on}
                            onClick={() =>
                              setAssign((a) => {
                                const cur = a[s.id] ?? chosen.map((x) => x.key);
                                return {
                                  ...a,
                                  [s.id]: on
                                    ? cur.filter((k) => k !== c.key)
                                    : [...cur, c.key],
                                };
                              })
                            }
                            className={`rounded-full border px-3.5 py-1.5 text-[0.8rem] transition-all ${on ? "border-ink bg-ink text-chalk" : "border-ink/20"} ${!ok ? "cursor-not-allowed opacity-40" : ""}`}
                          >
                            {c.firstName}
                            {!ok ? " · outside age range" : ""}
                          </button>
                        );
                      })}
                    </div>
                    )}
                    {(() => {
                      // Extras for the grown-up (e.g. coworking): one choice per session,
                      // kept on every child coming so it survives changes to who's coming.
                      const forFamily = addonsFor(s.kind, s.programSlug).filter((a) => a.perFamily);
                      const coming = chosen.filter((c) => eligible(s, c) && isOn(s.id, c.key));
                      if (!forFamily.length || !coming.length) return null;
                      return (
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.82rem]">
                          <span className="text-ink-soft">Staying?</span>
                          {forFamily.map((a) => {
                            const on = coming.some((c) => extrasOf(extras, s, c.key).includes(a.key));
                            return (
                              <label key={a.key} className="inline-flex cursor-pointer items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() =>
                                    setExtras((e) => ({
                                      ...e,
                                      [s.id]: Object.fromEntries(
                                        coming.map((c) => {
                                          const cur = extrasOf(e, s, c.key).filter((k) => k !== a.key);
                                          return [c.key, on ? cur : [...cur, a.key]];
                                        }),
                                      ),
                                    }))
                                  }
                                  className="h-4 w-4 accent-[var(--color-blue)]"
                                />
                                {a.label} <span className="text-ink-soft">({a.time})</span> +{usd(a.priceCents)}
                              </label>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {addonsFor(s.kind, s.programSlug).filter((a) => !a.perFamily).length
                      ? chosen
                          .filter((c) => eligible(s, c) && isOn(s.id, c.key))
                          .map((c) => (
                            <div
                              key={c.key}
                              className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.82rem]"
                            >
                              {addonsFor(s.kind, s.programSlug).some((a) => a.dayLength) ? (
                                <>
                                  <span className="text-ink-soft">{c.firstName}:</span>
                                  {[null, ...addonsFor(s.kind, s.programSlug).filter((a) => a.dayLength)].map((a) => {
                                    const half = extrasOf(extras, s, c.key).includes(a?.key ?? "__none");
                                    const anyHalf = addonsFor(s.kind, s.programSlug).some((x) => x.dayLength && extrasOf(extras, s, c.key).includes(x.key));
                                    const on = a ? half : !anyHalf;
                                    return (
                                      <button
                                        key={a?.key ?? "full"}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => {
                                          if (on) return;
                                          if (a) toggleExtra(s.id, c.key, a.key);
                                          else for (const x of addonsFor(s.kind, s.programSlug).filter((y) => y.dayLength && extrasOf(extras, s, c.key).includes(y.key))) toggleExtra(s.id, c.key, x.key);
                                        }}
                                        className={`rounded-full border px-3.5 py-1.5 transition-all ${on ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"}`}
                                      >
                                        {a ? a.label : "Full day"} <span className={on ? "text-chalk/70" : "text-ink-soft"}>{a ? a.time : "8:30am – 4:30pm"}</span> · {usd(a ? (s.halfPriceCents ?? s.priceCents) : s.priceCents)}
                                      </button>
                                    );
                                  })}
                                </>
                              ) : (
                              <span className="text-ink-soft">
                                Extras for {c.firstName}:
                              </span>
                              )}
                              {addonsFor(s.kind, s.programSlug).filter((a) => !a.perFamily && !a.dayLength && addonOk(s, a, c.key)).map((a) => (
                                <label
                                  key={a.key}
                                  className="inline-flex cursor-pointer items-center gap-2"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(
                                      extrasOf(extras, s, c.key)
                                    ).includes(a.key)}
                                    onChange={() =>
                                      toggleExtra(s.id, c.key, a.key)
                                    }
                                    className="h-4 w-4 accent-[var(--color-blue)]"
                                  />
                                  {a.label}{" "}
                                  <span className="text-ink-soft">
                                    ({a.time})
                                  </span>{" "}
                                  +{usd(a.priceCents)}
                                </label>
                              ))}
                            </div>
                          ))
                      : null}
                  </li>
                ))}
              </ul>

              {slotProblem ? (
                <p role="alert" className="mt-5 border-l-2 border-oxblood/50 pl-3 text-[0.88rem] text-oxblood">
                  {slotProblem}
                </p>
              ) : null}
              {siblingSaving > 0 ? (
                <dl className="mt-6 space-y-1.5 text-[0.95rem]">
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Before discount</dt>
                    <dd>{usd(grossTotal)}</dd>
                  </div>
                  <div className="flex justify-between text-blue">
                    <dt>Sibling discount ({sibling.percent}% off each additional child)</dt>
                    <dd>−{usd(siblingSaving)}</dd>
                  </div>
                </dl>
              ) : null}
              {fromPass > 0 ? (
                <dl className="mt-6 space-y-1.5 text-[0.95rem]">
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Booking subtotal</dt>
                    <dd>{usd(total)}</dd>
                  </div>
                  <div className="flex justify-between text-blue">
                    <dt>Applied from Yalla Wallet</dt>
                    <dd>−{usd(fromPass)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-line pt-3">
                    <dt className="text-ink-soft">Due today</dt>
                    <dd className="display text-[1.6rem]">{usd(total - fromPass)}</dd>
                  </div>
                  <div className="flex justify-between text-[0.82rem] text-ink-soft">
                    <dt>Remaining in your Yalla Wallet</dt>
                    <dd>{usd((walletCents ?? 0) - fromPass)}</dd>
                  </div>
                </dl>
              ) : (
                <>
                  <div className="mt-6 flex items-baseline justify-between">
                    <span className="text-ink-soft">Total due today</span>
                    <span className="display text-[1.6rem]">{usd(total)}</span>
                  </div>
                  {eligibleTotal > 0 && walletCents == null ? (
                    <p className="mt-2 text-right text-[0.8rem] text-ink-soft">
                      Make more room for play with a monthly{" "}
                      <Link href="/play-passes" className="text-blue underline underline-offset-4">
                        Play Pass
                      </Link>
                      .
                    </p>
                  ) : null}
                </>
              )}
              {familySaving > 0 ? (
                <p className="mt-1 text-right text-[0.8rem] text-blue">
                  After Hours family rate: {usd(FAMILY_RATE.familyCents)} for up
                  to {FAMILY_RATE.childrenIncluded} children, +
                  {usd(FAMILY_RATE.extraChildCents)} each additional child
                </p>
              ) : null}
              <p className="mt-2 text-[0.78rem] text-ink-soft">
                Spots are held for you while you pay. Payment is confirmed
                securely by our payment provider.
              </p>

              <div className="mt-10">
                {agreements === null ? (
                  <p className="text-[0.88rem] text-ink-soft">
                    Checking required agreements…
                  </p>
                ) : agreements.length === 0 ? null : (
                  <div className="space-y-6">
                    <h3 className="display text-[1.5rem]">Agreements</h3>
                    <p className="text-[0.82rem] text-ink-soft">
                      These are required before booking. Once signed, they stay on file, so you won’t be asked again until they expire.
                    </p>
                    {agreements.map((a) => {
                      const k = sigKey(a);
                      const s = signatures[k] ?? { text: "", consent: false };
                      const forChild = a.childKey
                        ? chosen.find((c) => c.key === a.childKey)?.firstName
                        : null;
                      return (
                        <div
                          key={k}
                          className="border border-line bg-paper p-5"
                        >
                          <p className="display text-[1.15rem]">
                            {a.title}
                            {forChild ? (
                              <span className="text-ink-soft">
                                {" "}
                                · for {forChild}
                              </span>
                            ) : null}
                          </p>
                          <p className="eyebrow mt-1 text-[0.55rem] text-ink-soft">
                            Version {a.version}
                          </p>
                          {a.validForMonths ? (
                            <p className="mt-1 text-[0.78rem] text-ink-soft">Signed once and kept on file for {a.validForMonths === 12 ? "one year" : `${a.validForMonths} months`}.</p>
                          ) : null}
                          {a.completableOnline && a.fields ? (
                            <>
                              <div className="mt-4 max-h-[32rem] space-y-4 overflow-y-auto border border-line bg-chalk p-4 text-[0.86rem] leading-relaxed text-ink-soft">
                                {a.fields
                                  .filter((f) => f.type !== "signature" && isShown(f, formAnswers[k] ?? {}))
                                  .map((f) => {
                                    const v = formAnswers[k]?.[f.id] ?? "";
                                    if (f.type === "heading") return <p key={f.id} className="pt-2 font-serif text-[1.08rem] text-ink">{f.text}</p>;
                                    if (f.type === "info") return <div key={f.id} className="space-y-2.5"><Markup text={f.text} /></div>;
                                    if (f.type === "initials")
                                      return (
                                        <div key={f.id} className={`rounded-lg border p-3 ${v ? "border-ink/15 bg-paper" : "border-blue/50 bg-blue/[0.04]"}`}>
                                          <p className="text-[0.86rem] text-ink">{f.label}</p>
                                          <div className="mt-2">
                                            <SignaturePad kind="initials" label="Your initials" value={v} onChange={(x) => setAnswer(k, f.id, x)} />
                                          </div>
                                        </div>
                                      );
                                    if (f.type === "text" || f.type === "textarea")
                                      return (
                                        <label key={f.id} className="block">
                                          <span className="text-[0.86rem] text-ink">{f.label}</span>
                                          <input value={v} onChange={(e) => setAnswer(k, f.id, e.target.value)} className={input} />
                                        </label>
                                      );
                                    if (f.type === "agree")
                                      return (
                                        <label key={f.id} className="flex items-start gap-2.5 text-[0.86rem] text-ink">
                                          <input type="checkbox" checked={v === "yes"} onChange={(e) => setAnswer(k, f.id, e.target.checked ? "yes" : "")} className="mt-1 h-4 w-4" />
                                          <span>{f.label}</span>
                                        </label>
                                      );
                                    if (f.type === "choice")
                                      return (
                                        <fieldset key={f.id}>
                                          <legend className="text-[0.86rem] text-ink">{f.label}</legend>
                                          <div className="mt-2 space-y-1.5">
                                            {f.options.map((o) => (
                                              <label key={o.value} className="flex items-start gap-2 text-[0.86rem]">
                                                <input type="radio" checked={v === o.value} onChange={() => setAnswer(k, f.id, o.value)} className="mt-1" />
                                                <span>{o.label}</span>
                                              </label>
                                            ))}
                                          </div>
                                        </fieldset>
                                      );
                                    return null;
                                  })}
                              </div>
                              {a.fields
                                .filter((f) => f.type === "signature")
                                .map((f) => (
                                  <div key={f.id} className="mt-4">
                                    <SignaturePad label={f.type === "signature" ? f.label : "Signature"} value={formAnswers[k]?.[f.id] ?? ""} onChange={(x) => setAnswer(k, f.id, x)} />
                                  </div>
                                ))}
                              <label className="mt-4 block">
                                <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Type your full name to sign</span>
                                <input
                                  value={s.text}
                                  onChange={(e) => {
                                    const text = e.target.value;
                                    setSignatures((x) => ({ ...x, [k]: { consent: x[k]?.consent ?? false, text } }));
                                  }}
                                  className={input}
                                />
                              </label>
                              <label className="mt-3 flex items-start gap-2.5 text-[0.85rem]">
                                <input
                                  type="checkbox"
                                  checked={s.consent}
                                  onChange={(e) => {
                                    const consent = e.target.checked;
                                    setSignatures((x) => ({ ...x, [k]: { text: x[k]?.text ?? "", consent } }));
                                  }}
                                  className="mt-1 h-4 w-4"
                                />
                                I agree that my drawn signature, initials and typed name are my electronic signature on this agreement.
                              </label>
                              {agreementProblem(a) && (Object.keys(formAnswers[k] ?? {}).length > 0 || s.consent) ? (
                                <p className="mt-2 text-[0.8rem] text-oxblood">{agreementProblem(a)}</p>
                              ) : null}
                            </>
                          ) : a.completableOnline ? (
                            <>
                              <div className="mt-3 max-h-40 overflow-y-auto border border-line bg-chalk p-3 text-[0.82rem] whitespace-pre-wrap text-ink-soft">
                                {a.body}
                              </div>
                              {a.requiresSignature ? (
                                <label className="mt-4 block">
                                  <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">
                                    Type your full name to sign
                                  </span>
                                  <input
                                    value={s.text}
                                    onChange={(e) => {
                                      const text = e.target.value;
                                      setSignatures((x) => ({
                                        ...x,
                                        [k]: {
                                          consent: x[k]?.consent ?? false,
                                          text,
                                        },
                                      }));
                                    }}
                                    className={input}
                                  />
                                </label>
                              ) : null}
                              <label className="mt-3 flex items-start gap-2.5 text-[0.85rem]">
                                <input
                                  type="checkbox"
                                  checked={s.consent}
                                  onChange={(e) => {
                                    const consent = e.target.checked;
                                    setSignatures((x) => ({
                                      ...x,
                                      [k]: { text: x[k]?.text ?? "", consent },
                                    }));
                                  }}
                                  className="mt-1 h-4 w-4"
                                />
                                {a.requiresSignature
                                  ? "I’ve read this and agree to sign electronically."
                                  : "I confirm this information."}
                              </label>
                            </>
                          ) : (
                            <p className="mt-3 text-[0.85rem] text-oxblood">
                              This needs a document from you. Please contact
                              Yalla before booking.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-10">
          <button
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            className="h-12 px-2 text-[0.9rem] text-ink-soft hover:text-ink"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>
          <button
            disabled={!canNext || pending}
            onClick={() => {
              setError(null);
              if (step < steps.length - 1) setStep(step + 1);
              else submit();
            }}
            className="h-12 rounded-full bg-ink px-8 text-[0.9rem] text-chalk transition-colors duration-500 hover:bg-blue disabled:cursor-not-allowed disabled:opacity-30"
          >
            {pending
              ? "Holding your spots…"
              : step === steps.length - 1
                ? total - fromPass > 0
                  ? `Continue to payment`
                  : "Confirm booking"
                : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
