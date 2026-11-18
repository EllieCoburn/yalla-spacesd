"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { KioskFamily } from "@/lib/ops/checkin";
import { checkInChildren, checkOutChildren, lookupCode } from "./actions";

type Step = { kind: "code" } | { kind: "family"; fam: KioskFamily } | { kind: "pickup"; fam: KioskFamily; picks: Key[] } | { kind: "done"; text: string };
type Key = { sessionId: string; childId: string };
const key = (k: Key) => `${k.sessionId}:${k.childId}`;
const IDLE_MS = 60_000;
const DONE_MS = 6_000;

/** Enter the family code, choose children, check in or out. Resets itself after a minute idle. */
export function KioskScreen() {
  const [step, setStep] = useState<Step>({ kind: "code" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setStep({ kind: "code" });
    setCode("");
    setError(null);
    setPicked(new Set());
  }, []);

  // Back to the keypad after a minute without a tap, or a few seconds after "All set".
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (step.kind === "code" && !code) return;
    timer.current = setTimeout(reset, step.kind === "done" ? DONE_MS : IDLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [step, code, picked, reset]);

  const submitCode = (c: string) =>
    start(async () => {
      const r = await lookupCode(c);
      if (r.ok) {
        setError(null);
        setPicked(new Set());
        setStep({ kind: "family", fam: r.data });
      } else {
        setError(r.error);
        setCode("");
      }
    });

  const press = (d: string) => {
    if (pending) return;
    setError(null);
    if (d === "del") return setCode((c) => c.slice(0, -1));
    const next = (code + d).slice(0, 4);
    setCode(next);
    if (next.length === 4) submitCode(next);
  };

  if (step.kind === "done")
    return (
      <Center>
        <p className="eyebrow text-[0.7rem] text-blue">All set</p>
        <h1 className="display mt-4 text-[clamp(2.4rem,5vw,3.6rem)]">{step.text}</h1>
        <button onClick={reset} className="mt-10 h-14 rounded-full bg-ink px-10 text-chalk">
          Done
        </button>
      </Center>
    );

  if (step.kind === "pickup") {
    const names = step.fam.children.filter((c) => step.picks.some((p) => key(p) === key(c))).map((c) => c.name);
    return (
      <Center>
        <h1 className="display text-[clamp(2rem,4.5vw,3rem)]">Who is picking up {join([...new Set(names)])}?</h1>
        {error ? <p className="mt-4 text-oxblood">{error}</p> : null}
        <div className="mt-8 grid w-full max-w-xl gap-3">
          {step.fam.collectors.map((p) => (
            <button
              key={p.id}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await checkOutChildren(code, step.picks, p.id);
                  if (r.ok) setStep({ kind: "done", text: `${join(r.data)} ${r.data.length > 1 ? "are" : "is"} checked out. See you soon!` });
                  else setError(r.error);
                })
              }
              className="h-16 rounded-2xl border border-ink/15 bg-paper text-[1.15rem] transition-colors hover:border-ink disabled:opacity-50"
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="mt-6 max-w-md text-[0.9rem] text-ink-soft">Not listed? Please ask a member of Team Yalla.</p>
        <button onClick={() => setStep({ kind: "family", fam: step.fam })} className="mt-6 text-ink-soft underline underline-offset-4">
          Back
        </button>
      </Center>
    );
  }

  if (step.kind === "family") {
    const kids = step.fam.children;
    const arriving = kids.filter((k) => k.status === "expected");
    const leaving = kids.filter((k) => k.status === "checked_in");
    const chosen = kids.filter((k) => picked.has(key(k)));
    const mode = chosen.length ? (chosen.every((k) => k.status === "checked_in") ? "out" : chosen.every((k) => k.status === "expected") ? "in" : "mixed") : null;
    const toggle = (k: Key) =>
      setPicked((s) => {
        const n = new Set(s);
        if (n.has(key(k))) n.delete(key(k));
        else n.add(key(k));
        return n;
      });
    return (
      <Center>
        <p className="eyebrow text-[0.7rem] text-ink-soft">{step.fam.familyName}</p>
        <h1 className="display mt-3 text-[clamp(2rem,4.5vw,3rem)]">Who’s {arriving.length && !leaving.length ? "arriving" : !arriving.length && leaving.length ? "heading home" : "arriving or heading home"}?</h1>
        {error ? <p className="mt-4 text-oxblood">{error}</p> : null}
        <div className="mt-8 flex w-full max-w-2xl flex-wrap justify-center gap-3">
          {kids.map((k) => {
            const on = picked.has(key(k));
            const done = k.status === "checked_out" || k.status === "absent";
            return (
              <button
                key={key(k)}
                disabled={done || pending}
                onClick={() => toggle(k)}
                aria-pressed={on}
                className={`w-full rounded-2xl border p-5 text-left transition-colors disabled:opacity-40 sm:w-[calc(50%-0.375rem)] ${on ? "border-blue bg-blue/[0.07]" : "border-ink/15 bg-paper hover:border-ink"}`}
              >
                <span className="display block text-[1.6rem]">{k.name}</span>
                <span className="mt-1 block text-[0.88rem] text-ink-soft">
                  {k.what} · {k.time}
                </span>
                <span className={`mt-3 inline-block rounded-full px-3 py-1 text-[0.75rem] ${k.status === "checked_in" ? "bg-blue/10 text-blue" : "bg-ink/5 text-ink-soft"}`}>
                  {k.status === "checked_in" ? "Checked in · tap to check out" : k.status === "checked_out" ? "Checked out" : k.status === "absent" ? "Marked absent" : "Tap to check in"}
                </span>
              </button>
            );
          })}
        </div>
        {mode === "mixed" ? <p className="mt-5 text-oxblood">Please check in and check out separately.</p> : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button onClick={reset} className="h-14 rounded-full border border-ink/20 px-8">
            Cancel
          </button>
          <button
            disabled={!mode || mode === "mixed" || pending}
            onClick={() => {
              const picks = chosen.map((k) => ({ sessionId: k.sessionId, childId: k.childId }));
              if (mode === "out") return setStep({ kind: "pickup", fam: step.fam, picks });
              start(async () => {
                const r = await checkInChildren(code, picks);
                if (r.ok) setStep({ kind: "done", text: `${join(r.data)} ${r.data.length > 1 ? "are" : "is"} checked in. Have a wonderful day!` });
                else setError(r.error);
              });
            }}
            className="h-14 rounded-full bg-ink px-10 text-chalk disabled:opacity-30"
          >
            {pending ? "One moment…" : mode === "out" ? "Check out" : "Check in"}
          </button>
        </div>
      </Center>
    );
  }

  return (
    <Center>
      <h1 className="display text-[clamp(2.2rem,5vw,3.4rem)]">
        Welcome to <em>Yalla.</em>
      </h1>
      <p className="mt-3 text-[1.1rem] text-ink-soft">Enter your family’s 4-digit check-in code.</p>
      <div className="mt-8 flex gap-4" aria-live="polite" aria-label={`${code.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-5 w-5 rounded-full border-2 ${i < code.length ? "border-blue bg-blue" : "border-ink/25"}`} />
        ))}
      </div>
      <p className="mt-4 h-6 text-oxblood">{error ?? (pending ? "Checking…" : "")}</p>
      <div className="mt-4 grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((d, i) =>
          d ? (
            <button
              key={i}
              onClick={() => press(d)}
              disabled={pending}
              aria-label={d === "del" ? "Delete" : d}
              className="h-20 w-20 rounded-full border border-ink/15 bg-paper text-[1.8rem] transition-colors active:bg-mist disabled:opacity-50 sm:h-24 sm:w-24"
            >
              {d === "del" ? "⌫" : d}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <p className="mt-8 max-w-sm text-center text-[0.9rem] text-ink-soft">Your code is in your Family Portal and in your reminder email. Yalla Flex and Club Yalla families check in with Brightwheel.</p>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-10 text-center">{children}</div>;
}

const join = (n: string[]) => (n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);
