"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { ageInMonths, availabilityFor, type PreviewSession } from "@/lib/booking/preview";

type ChildDraft = { key: string; firstName: string; lastName: string; birthDate: string; notes: string };

const steps = ["Children", "Your details", "Review", "Payment"] as const;

const input =
  "w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";

export function Checkout({ sessions, onClose, onDone }: { sessions: PreviewSession[]; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [children, setChildren] = useState<ChildDraft[]>([{ key: "a", firstName: "", lastName: "", birthDate: "", notes: "" }]);
  const [assign, setAssign] = useState<Record<string, string[]>>({});
  const [guardian, setGuardian] = useState({ name: "", email: "", phone: "" });
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  const sorted = useMemo(() => [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [sessions]);
  const repeatable = sorted.some((s) => s.kind === "drop_in" || s.kind === "weekend");

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const validChildren = children.filter((c) => c.firstName && c.birthDate);
  const isAssigned = (sid: string, ck: string) => (assign[sid] ?? validChildren.map((c) => c.key)).includes(ck);
  const eligible = (s: PreviewSession, c: ChildDraft) => {
    const m = ageInMonths(c.birthDate, new Date(s.startsAt));
    return m >= s.ages.minMonths && m <= s.ages.maxMonths;
  };

  const lines = sorted.flatMap((s) => validChildren.filter((c) => isAssigned(s.id, c.key) && eligible(s, c)).map((c) => ({ s, c })));
  const totalLines = lines.length * (repeatWeeks ? repeatWeeks : 1);

  const canNext =
    step === 0 ? validChildren.length > 0 : step === 1 ? guardian.name.trim() !== "" && /\S+@\S+\.\S+/.test(guardian.email) : step === 2 ? lines.length > 0 : true;

  return (
    <div className="fixed inset-0 z-[55] flex justify-end" role="dialog" aria-modal="true" aria-label="Checkout">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full flex-col bg-chalk shadow-2xl sm:max-w-xl">
        {/* Header */}
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

        {!done ? (
          <div className="flex gap-2 px-6 pt-6 sm:px-10">
            {steps.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-[2px] transition-colors duration-500 ${i <= step ? "bg-blue" : "bg-line"}`} />
                <p className={`eyebrow mt-2 hidden text-[0.55rem] sm:block ${i === step ? "text-ink" : "text-ink-soft/60"}`}>{s}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10">
          {done ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Mark name="mark" className="h-28 w-auto text-blue" />
              <p className="display mt-10 text-[2.4rem]">You’re all set.</p>
              <p className="mt-3 max-w-sm text-ink-soft">
                Reference <span className="font-mono text-ink">{done}</span>. A confirmation would be sent to {guardian.email}.
              </p>
              <p className="mt-8 max-w-sm text-[0.78rem] text-oxblood">Preview: no booking was made and no payment was taken.</p>
              <div className="mt-10 flex gap-3">
                <Link href="/portal" className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[0.9rem] text-chalk">
                  View in Family Portal
                </Link>
                <button onClick={onClose} className="h-12 rounded-full border border-ink/20 px-6 text-[0.9rem]">
                  Close
                </button>
              </div>
            </div>
          ) : step === 0 ? (
            <div>
              <h2 className="display text-[2rem]">Who’s coming?</h2>
              <p className="mt-2 text-ink-soft">Add each child you’re booking for. Signed-in families will see saved profiles here.</p>
              <div className="mt-8 space-y-8">
                {children.map((c, i) => (
                  <div key={c.key} className="border border-line bg-paper p-6">
                    <div className="flex items-center justify-between">
                      <p className="eyebrow text-[0.6rem] text-ink-soft">Child {i + 1}</p>
                      {children.length > 1 ? (
                        <button onClick={() => setChildren((cs) => cs.filter((x) => x.key !== c.key))} className="text-[0.75rem] text-ink-soft hover:text-ink">
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
                          ["notes", "Allergies or notes", "text"],
                        ] as const
                      ).map(([k, l, t]) => (
                        <label key={k} className="block">
                          <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">{l}</span>
                          <input
                            type={t}
                            value={c[k]}
                            onChange={(e) => setChildren((cs) => cs.map((x) => (x.key === c.key ? { ...x, [k]: e.target.value } : x)))}
                            className={input}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setChildren((cs) => [...cs, { key: Math.random().toString(36).slice(2), firstName: "", lastName: "", birthDate: "", notes: "" }])}
                  className="text-[0.9rem] text-blue underline-offset-4 hover:underline"
                >
                  + Add another child
                </button>
              </div>
            </div>
          ) : step === 1 ? (
            <div>
              <h2 className="display text-[2rem]">Your details</h2>
              <p className="mt-2 text-ink-soft">We’ll create your Family Portal account so you can manage bookings any time.</p>
              <div className="mt-8 space-y-6">
                {(
                  [
                    ["name", "Full name", "text"],
                    ["email", "Email", "email"],
                    ["phone", "Mobile", "tel"],
                  ] as const
                ).map(([k, l, t]) => (
                  <label key={k} className="block">
                    <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">{l}</span>
                    <input type={t} value={guardian[k]} onChange={(e) => setGuardian((g) => ({ ...g, [k]: e.target.value }))} className={input} />
                  </label>
                ))}
              </div>
            </div>
          ) : step === 2 ? (
            <div>
              <h2 className="display text-[2rem]">Review</h2>
              <p className="mt-2 text-ink-soft">Choose who’s attending each session.</p>
              <ul className="mt-8 divide-y divide-line border-y border-line">
                {sorted.map((s) => {
                  const full = availabilityFor(s).state === "full";
                  return (
                    <li key={s.id} className="py-5">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="display text-[1.25rem]">{s.title}</p>
                        {full ? <span className="eyebrow text-[0.55rem] text-oxblood">Waitlist</span> : null}
                      </div>
                      <p className="text-[0.82rem] text-ink-soft">
                        {format(new Date(s.startsAt), "EEEE d MMMM · h:mmaaa")} – {format(new Date(s.endsAt), "h:mmaaa")}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {validChildren.map((c) => {
                          const ok = eligible(s, c);
                          const on = ok && isAssigned(s.id, c.key);
                          return (
                            <button
                              key={c.key}
                              disabled={!ok}
                              onClick={() =>
                                setAssign((a) => {
                                  const cur = a[s.id] ?? validChildren.map((x) => x.key);
                                  return { ...a, [s.id]: on ? cur.filter((k) => k !== c.key) : [...cur, c.key] };
                                })
                              }
                              className={`rounded-full border px-3.5 py-1.5 text-[0.8rem] transition-all ${
                                on ? "border-ink bg-ink text-chalk" : "border-ink/20"
                              } ${!ok ? "cursor-not-allowed opacity-40" : ""}`}
                            >
                              {c.firstName}
                              {!ok ? " · not eligible by age" : ""}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {repeatable ? (
                <div className="mt-8 border border-line bg-paper p-6">
                  <p className="display text-[1.2rem]">Make it a repeat booking</p>
                  <p className="mt-1 text-[0.88rem] text-ink-soft">Reserve the same day and time each week. You can change or cancel individual dates later.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[0, 4, 8, 12].map((w) => (
                      <button
                        key={w}
                        onClick={() => setRepeatWeeks(w)}
                        className={`rounded-full border px-4 py-1.5 text-[0.82rem] ${repeatWeeks === w ? "border-blue bg-blue text-chalk" : "border-ink/20"}`}
                      >
                        {w === 0 ? "Just once" : `${w} weeks`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-8 flex items-baseline justify-between">
                <span className="text-ink-soft">
                  {totalLines} child-session{totalLines === 1 ? "" : "s"}
                </span>
                <span className="font-serif italic">Rates to be confirmed</span>
              </div>
              <p className="mt-4 text-[0.78rem] text-ink-soft">Cancellation policy will appear here.</p>
            </div>
          ) : (
            <div>
              <h2 className="display text-[2rem]">Payment</h2>
              <p className="mt-2 text-ink-soft">Secure online payment.</p>
              <div className="mt-8 border border-dashed border-ink/25 bg-paper p-8 text-center">
                <Mark name="window" className="mx-auto h-10 w-auto text-blue/60" />
                <p className="mt-5 text-[0.95rem]">Secure checkout connects in the next stage.</p>
                <p className="mt-2 text-[0.82rem] text-ink-soft">In preview, you can complete the flow without paying.</p>
              </div>
            </div>
          )}
        </div>

        {!done ? (
          <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-10">
            <button onClick={() => (step === 0 ? onClose() : setStep(step - 1))} className="h-12 px-2 text-[0.9rem] text-ink-soft hover:text-ink">
              {step === 0 ? "Cancel" : "Back"}
            </button>
            <button
              disabled={!canNext}
              onClick={() => {
                if (step < steps.length - 1) setStep(step + 1);
                else {
                  setDone("YL-" + Math.random().toString(36).slice(2, 7).toUpperCase());
                  onDone();
                }
              }}
              className="h-12 rounded-full bg-ink px-8 text-[0.9rem] text-chalk transition-colors duration-500 hover:bg-blue disabled:cursor-not-allowed disabled:opacity-30"
            >
              {step === steps.length - 1 ? "Confirm booking" : "Continue"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
