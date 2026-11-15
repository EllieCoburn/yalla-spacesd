"use client";

import { useState } from "react";
import { AgreementFields } from "@/components/booking/AgreementFields";
import type { Answers, FormField } from "@/lib/forms/fields";

/** Staff preview of an agreement exactly as it appears in the checkout drawer. Nothing is saved. */
export function CheckoutAgreementPreview({ title, version, fields, validForMonths, perChild }: { title: string; version: number; fields: FormField[]; validForMonths: number | null; perChild: boolean }) {
  const [answers, setAnswers] = useState<Answers>({});
  return (
    <div className="mx-auto w-full bg-chalk px-6 py-8 shadow-2xl sm:max-w-xl">
      <p className="text-[0.82rem] text-ink-soft">These are required before booking. Once signed, they stay on file, so you won’t be asked again until they expire.</p>
      <div className="mt-4 border border-line bg-paper p-5">
        <p className="display text-[1.15rem]">
          {title}
          {perChild ? <span className="text-ink-soft"> · for Sam</span> : null}
        </p>
        <p className="eyebrow mt-1 text-[0.55rem] text-ink-soft">Version {version}</p>
        {validForMonths ? <p className="mt-1 text-[0.78rem] text-ink-soft">Signed once and kept on file for {validForMonths === 12 ? "one year" : `${validForMonths} months`}.</p> : null}
        <AgreementFields fields={fields} answers={answers} onAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />
        <label className="mt-4 block">
          <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Type your full name to sign</span>
          <input className="w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none" />
        </label>
        <label className="mt-3 flex items-start gap-2.5 text-[0.85rem]">
          <input type="checkbox" className="mt-1 h-4 w-4" />
          I agree that my drawn signature, initials and typed name are my electronic signature on this agreement.
        </label>
      </div>
    </div>
  );
}
