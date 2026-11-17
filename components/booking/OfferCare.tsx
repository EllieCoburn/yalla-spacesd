"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { saveOfferCareAction } from "@/app/(site)/book/actions";

const input = "w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || disabled} className="h-12 rounded-full bg-ink px-7 text-[0.9rem] text-chalk hover:bg-blue disabled:opacity-50">
      {pending ? "Saving…" : "Continue"}
    </button>
  );
}

/** Before paying for a waitlist offer: each child's known allergies and medications. */
export function OfferCare({ reference, k, kids }: { reference: string; k: string; kids: { childId: string; name: string }[] }) {
  const [a, setA] = useState<Record<string, string>>({});
  const rows = (name: string) =>
    [
      { kind: "allergies", q: `Does ${name} have any known allergies?`, detail: "Which allergies, and how do they react?" },
      { kind: "medications", q: `Does ${name} take any medications?`, detail: "Which medications, and anything our team should know" },
    ] as const;
  const done = kids.every((c) => rows(c.name).every((r) => a[`${r.kind}Answer-${c.childId}`] === "no" || (a[`${r.kind}Answer-${c.childId}`] === "yes" && (a[`${r.kind}-${c.childId}`] ?? "").trim())));
  return (
    <form action={saveOfferCareAction} className="mx-auto mt-10 max-w-xl space-y-6 text-left">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="k" value={k} />
      <div>
        <h2 className="display text-[1.5rem]">Allergies and medications</h2>
        <p className="mt-1 text-[0.85rem] text-ink-soft">So our team can care for {kids.length > 1 ? "your children" : kids[0].name}, please answer these before paying.</p>
      </div>
      {kids.map((c) => (
        <div key={c.childId} className="space-y-4 border border-line bg-paper p-5">
          <input type="hidden" name="childId" value={c.childId} />
          <p className="display text-[1.15rem]">{c.name}</p>
          {rows(c.name).map((r) => {
            const yn = `${r.kind}Answer-${c.childId}`;
            const text = `${r.kind}-${c.childId}`;
            return (
              <fieldset key={r.kind}>
                <legend className="text-[0.92rem] text-ink">{r.q}</legend>
                <div className="mt-2 flex gap-5">
                  {(["no", "yes"] as const).map((v) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 text-[0.92rem]">
                      <input type="radio" name={yn} value={v} checked={a[yn] === v} onChange={() => setA((x) => ({ ...x, [yn]: v }))} className="h-4 w-4 accent-[var(--color-blue)]" />
                      {v === "no" ? "No" : "Yes"}
                    </label>
                  ))}
                </div>
                {a[yn] === "yes" ? (
                  <label className="mt-3 block">
                    <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">{r.detail}</span>
                    <textarea name={text} value={a[text] ?? ""} onChange={(e) => setA((x) => ({ ...x, [text]: e.target.value }))} rows={2} maxLength={1000} className={input} />
                  </label>
                ) : null}
              </fieldset>
            );
          })}
        </div>
      ))}
      <div className="flex justify-center">
        <Submit disabled={!done} />
      </div>
    </form>
  );
}
