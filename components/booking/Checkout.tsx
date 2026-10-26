"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { agreementsAction, submitBookingAction } from "@/app/(site)/book/actions";
import { Mark } from "@/components/brand/Mark";
import type { Agreement, PublicSession } from "@/lib/ops/public-booking";
import { ageInMonths, fmtDate, fmtTime } from "@/lib/time";
import { usd } from "./format";
import { FAMILY_RATE, familyRateKey, familyRateTotal } from "@/lib/booking/family-rate";

export type SavedChild = { id: string; firstName: string; lastName: string; preferredName: string | null; birthDate: string };
export type SignedInGuardian = { firstName: string; lastName: string; email: string };

type ChildDraft = { key: string; existingId: string | null; firstName: string; lastName: string; birthDate: string; allergies: string; include: boolean };

const steps = ["Children", "Your details", "Review & agree"] as const;
const input = "w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";

export function Checkout({
  sessions,
  guardian,
  savedChildren,
  onClose,
  onRefresh,
}: {
  sessions: PublicSession[];
  guardian: SignedInGuardian | null;
  savedChildren: SavedChild[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [step, setStep] = useState(0);
  const [kids, setKids] = useState<ChildDraft[]>(() =>
    savedChildren.length
      ? savedChildren.map((c) => ({ key: c.id, existingId: c.id, firstName: c.preferredName || c.firstName, lastName: c.lastName, birthDate: c.birthDate, allergies: "", include: false }))
      : [{ key: "new-1", existingId: null, firstName: "", lastName: "", birthDate: "", allergies: "", include: true }],
  );
  const [assign, setAssign] = useState<Record<string, string[]>>({});
  const [adult, setAdult] = useState({ firstName: guardian?.firstName ?? "", lastName: guardian?.lastName ?? "", email: guardian?.email ?? "", phone: "" });
  const [agreements, setAgreements] = useState<Agreement[] | null>(null);
  const [signatures, setSignatures] = useState<Record<string, { text: string; consent: boolean }>>({});
  const [error, setError] = useState<{ text: string; devLink?: string } | null>(null);
  const [pending, start] = useTransition();

  const sorted = useMemo(() => [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [sessions]);
  const chosen = kids.filter((k) => k.include && k.firstName.trim() && /^\d{4}-\d{2}-\d{2}$/.test(k.birthDate));

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
    return (s.ages.min == null || m >= s.ages.min) && (s.ages.max == null || m <= s.ages.max);
  };
  const isOn = (sid: string, key: string) => (assign[sid] ?? chosen.map((c) => c.key)).includes(key);
  const lines = sorted.map((s) => ({ sessionId: s.id, childKeys: chosen.filter((c) => isOn(s.id, c.key) && eligible(s, c)).map((c) => c.key) })).filter((l) => l.childKeys.length);
  // After Hours siblings on the same evening are capped at the family rate, matching the invoice.
  const evenings = new Map<string, number[]>();
  const total = sorted.reduce((sum, s) => {
    const n = lines.find((l) => l.sessionId === s.id)?.childKeys.length ?? 0;
    if (s.kind === FAMILY_RATE.kind && s.bookingUnit === "per_child" && n) {
      const k = familyRateKey(s.programId, s.localDate);
      evenings.set(k, [...(evenings.get(k) ?? []), ...Array<number>(n).fill(s.priceCents ?? 0)]);
      return sum;
    }
    return sum + (s.priceCents ?? 0) * (s.bookingUnit === "per_child" ? n : n ? 1 : 0);
  }, 0) + [...evenings.values()].reduce((sum, prices) => sum + familyRateTotal(prices), 0);
  const familySaving = [...evenings.values()].reduce((sum, prices) => sum + prices.reduce((a, b) => a + b, 0) - familyRateTotal(prices), 0);
  const sigKey = (a: Agreement) => `${a.templateId}:${a.childKey ?? "family"}`;

  // Load the agreements that must be signed before booking.
  useEffect(() => {
    if (step !== 2) return;
    setAgreements(null);
    agreementsAction({ sessionIds: lines.map((l) => l.sessionId), children: chosen.map((c) => ({ key: c.key, existingId: c.existingId, firstName: c.firstName })) }).then(setAgreements);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const agreementsDone = (agreements ?? []).every((a) => {
    if (!a.completableOnline) return false;
    const s = signatures[sigKey(a)];
    return s?.consent && (!a.requiresSignature || s.text.trim().length > 1);
  });

  const canNext =
    step === 0
      ? chosen.length > 0
      : step === 1
        ? !!guardian || (adult.firstName.trim() !== "" && adult.lastName.trim() !== "" && /\S+@\S+\.\S+/.test(adult.email))
        : lines.length > 0 && agreements !== null && agreementsDone;

  function submit() {
    setError(null);
    start(async () => {
      const res = await submitBookingAction({
        guardian: adult,
        children: chosen.map((c) => ({ key: c.key, existingId: c.existingId, firstName: c.firstName, lastName: c.lastName || adult.lastName, birthDate: c.birthDate, allergies: c.allergies })),
        lines,
        signatures: (agreements ?? []).map((a) => ({ templateId: a.templateId, childKey: a.childKey, signatureText: signatures[sigKey(a)]?.text, consent: !!signatures[sigKey(a)]?.consent })),
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
    <div className="fixed inset-0 z-[55] flex justify-end" role="dialog" aria-modal="true" aria-label="Book care">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full flex-col bg-chalk shadow-2xl sm:max-w-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-5 sm:px-10">
          <div className="flex items-center gap-3">
            <Mark name="wordmark" className="h-6 w-auto text-blue" />
            <span className="eyebrow text-[0.58rem] text-ink-soft">Book care</span>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-sand" aria-label="Close checkout">
            <svg viewBox="0 0 12 12" className="h-3 w-3" stroke="currentColor" strokeWidth="1.3">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2 px-6 pt-6 sm:px-10">
          {steps.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-[2px] transition-colors duration-500 ${i <= step ? "bg-blue" : "bg-line"}`} />
              <p className={`eyebrow mt-2 hidden text-[0.55rem] sm:block ${i === step ? "text-ink" : "text-ink-soft/60"}`}>{s}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10">
          {error ? (
            <div role="alert" className="mb-6 border-l-2 border-oxblood/50 pl-4 text-[0.92rem] text-oxblood">
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
              <p className="mt-2 text-ink-soft">{savedChildren.length ? "Choose from your children, or add another." : "Add each child you’re booking for."}</p>
              <div className="mt-8 space-y-4">
                {kids.map((c, i) =>
                  c.existingId ? (
                    <label key={c.key} className={`flex cursor-pointer items-center justify-between border p-5 transition-colors ${c.include ? "border-blue bg-blue/[0.05]" : "border-line bg-paper"}`}>
                      <span>
                        <span className="display block text-[1.3rem]">{c.firstName}</span>
                        <span className="text-[0.82rem] text-ink-soft">Born {fmtDate(c.birthDate, "d MMMM yyyy")}</span>
                      </span>
                      <input type="checkbox" checked={c.include} onChange={(e) => setKids((ks) => ks.map((x) => (x.key === c.key ? { ...x, include: e.target.checked } : x)))} className="h-5 w-5" />
                    </label>
                  ) : (
                    <div key={c.key} className="border border-line bg-paper p-6">
                      <div className="flex items-center justify-between">
                        <p className="eyebrow text-[0.6rem] text-ink-soft">{savedChildren.length ? "New child" : `Child ${i + 1}`}</p>
                        {kids.filter((k) => !k.existingId).length > 1 || savedChildren.length ? (
                          <button onClick={() => setKids((ks) => ks.filter((x) => x.key !== c.key))} className="text-[0.75rem] text-ink-soft hover:text-ink">
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
                            <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">{l}</span>
                            <input type={t} value={c[k]} onChange={(e) => setKids((ks) => ks.map((x) => (x.key === c.key ? { ...x, [k]: e.target.value } : x)))} className={input} />
                          </label>
                        ))}
                      </div>
                    </div>
                  ),
                )}
                <button
                  onClick={() => setKids((ks) => [...ks, { key: `new-${Date.now()}`, existingId: null, firstName: "", lastName: "", birthDate: "", allergies: "", include: true }])}
                  className="text-[0.9rem] text-blue underline-offset-4 hover:underline"
                >
                  + Add {savedChildren.length ? "a new child" : "another child"}
                </button>
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
                    We’ll set up your Family Portal so you can manage bookings any time. Already with Yalla?{" "}
                    <Link href="/portal?next=/book" className="text-ink underline underline-offset-4">
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
                        <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">{l}</span>
                        <input type={t} autoComplete={ac} value={adult[k]} onChange={(e) => setAdult((g) => ({ ...g, [k]: e.target.value }))} className={input} />
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <h2 className="display text-[2rem]">Review</h2>
              <p className="mt-2 text-ink-soft">Choose who’s attending each session.</p>
              <ul className="mt-8 divide-y divide-line border-y border-line">
                {sorted.map((s) => (
                  <li key={s.id} className="py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="display text-[1.25rem]">{s.title}</p>
                      <span className="font-serif text-[0.95rem]">{s.kind === FAMILY_RATE.kind ? `${usd(s.priceCents)} per child · family rate applies` : usd(s.priceCents)}</span>
                    </div>
                    <p className="text-[0.82rem] text-ink-soft">
                      {fmtDate(s.localDate, "EEEE d MMMM")} · {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
                    </p>
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
                                return { ...a, [s.id]: on ? cur.filter((k) => k !== c.key) : [...cur, c.key] };
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
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex items-baseline justify-between">
                <span className="text-ink-soft">Total</span>
                <span className="display text-[1.6rem]">{usd(total)}</span>
              </div>
              {familySaving > 0 ? (
                <p className="mt-1 text-right text-[0.8rem] text-blue">
                  After Hours family rate: {usd(FAMILY_RATE.familyCents)} for up to {FAMILY_RATE.childrenIncluded} children, +{usd(FAMILY_RATE.extraChildCents)} each additional child
                </p>
              ) : null}
              <p className="mt-2 text-[0.78rem] text-ink-soft">Spots are held for you while you pay. Payment is confirmed securely by our payment provider.</p>

              <div className="mt-10">
                {agreements === null ? (
                  <p className="text-[0.88rem] text-ink-soft">Checking required agreements…</p>
                ) : agreements.length === 0 ? null : (
                  <div className="space-y-6">
                    <h3 className="display text-[1.5rem]">Agreements</h3>
                    <p className="text-[0.82rem] text-ink-soft">These are required before booking. Your typed name is your electronic signature.</p>
                    {agreements.map((a) => {
                      const k = sigKey(a);
                      const s = signatures[k] ?? { text: "", consent: false };
                      const forChild = a.childKey ? chosen.find((c) => c.key === a.childKey)?.firstName : null;
                      return (
                        <div key={k} className="border border-line bg-paper p-5">
                          <p className="display text-[1.15rem]">
                            {a.title}
                            {forChild ? <span className="text-ink-soft"> · for {forChild}</span> : null}
                          </p>
                          <p className="eyebrow mt-1 text-[0.55rem] text-ink-soft">Version {a.version}</p>
                          {a.completableOnline ? (
                            <>
                              <div className="mt-3 max-h-40 overflow-y-auto border border-line bg-chalk p-3 text-[0.82rem] whitespace-pre-wrap text-ink-soft">{a.body}</div>
                              {a.requiresSignature ? (
                                <label className="mt-4 block">
                                  <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Type your full name to sign</span>
                                  <input value={s.text} onChange={(e) => {
                                      const text = e.target.value;
                                      setSignatures((x) => ({ ...x, [k]: { consent: x[k]?.consent ?? false, text } }));
                                    }} className={input} />
                                </label>
                              ) : null}
                              <label className="mt-3 flex items-start gap-2.5 text-[0.85rem]">
                                <input type="checkbox" checked={s.consent} onChange={(e) => {
                                    const consent = e.target.checked;
                                    setSignatures((x) => ({ ...x, [k]: { text: x[k]?.text ?? "", consent } }));
                                  }} className="mt-1 h-4 w-4" />
                                {a.requiresSignature ? "I’ve read this and agree to sign electronically." : "I confirm this information."}
                              </label>
                            </>
                          ) : (
                            <p className="mt-3 text-[0.85rem] text-oxblood">This needs a document from you. Please contact Yalla before booking.</p>
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
          <button onClick={() => (step === 0 ? onClose() : setStep(step - 1))} className="h-12 px-2 text-[0.9rem] text-ink-soft hover:text-ink">
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
            {pending ? "Holding your spots…" : step === steps.length - 1 ? (total > 0 ? `Continue to payment` : "Confirm booking") : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
