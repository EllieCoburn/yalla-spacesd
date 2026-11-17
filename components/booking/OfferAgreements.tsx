"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AgreementFields } from "@/components/booking/AgreementFields";
import { acceptOfferWithAgreementsAction, type OfferState } from "@/app/(site)/book/actions";
import type { Answers, FormField } from "@/lib/forms/fields";

export type OfferAgreement = {
  templateId: string;
  title: string;
  body: string;
  version: number;
  childId: string | null;
  childName: string | null;
  completableOnline: boolean;
  fields: FormField[] | null;
  perBooking: boolean;
  validForMonths: number | null;
};

const input = "w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";
const keyOf = (a: OfferAgreement) => `${a.templateId}:${a.childId ?? ""}`;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="h-12 rounded-full bg-ink px-7 text-[0.9rem] text-chalk hover:bg-blue disabled:opacity-50">
      {pending ? "Saving…" : "Sign and continue to payment"}
    </button>
  );
}

/**
 * A waitlist offer that still needs agreements signed (e.g. the Camp Yalla agreement for this purchase):
 * the same agreement form as checkout, then on to payment.
 */
export function OfferAgreements({ reference, k, agreements, signedIn = false }: { reference: string; k: string; agreements: OfferAgreement[]; signedIn?: boolean }) {
  const [state, action] = useActionState<OfferState, FormData>(acceptOfferWithAgreementsAction, undefined);
  const [answers, setAnswers] = useState<Record<string, Answers>>({});
  const [sigs, setSigs] = useState<Record<string, { text: string; consent: boolean }>>({});
  const online = agreements.filter((a) => a.completableOnline);
  const payload = JSON.stringify(
    online.map((a) => ({ templateId: a.templateId, childId: a.childId, answers: answers[keyOf(a)] ?? {}, signatureText: sigs[keyOf(a)]?.text ?? "", consent: !!sigs[keyOf(a)]?.consent })),
  );
  return (
    <form action={action} className="mx-auto mt-10 max-w-xl space-y-6 text-left">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="k" value={k} />
      <input type="hidden" name="signatures" value={payload} />
      <div>
        <h2 className="display text-[1.5rem]">Agreements</h2>
        <p className="mt-1 text-[0.85rem] text-ink-soft">Please review and sign before paying.</p>
      </div>
      {agreements.map((a) => {
        const key = keyOf(a);
        const s = sigs[key] ?? { text: "", consent: false };
        return (
          <div key={key} className="border border-line bg-paper p-5">
            <p className="display text-[1.15rem]">
              {a.title}
              {a.childName ? <span className="text-ink-soft"> · for {a.childName}</span> : null}
            </p>
            <p className="eyebrow mt-1 text-[0.55rem] text-ink-soft">Version {a.version}</p>
            {!a.completableOnline ? (
              <p className="mt-3 text-[0.88rem] text-oxblood">Please get in touch with Yalla to complete this before paying.</p>
            ) : (
              <>
                {a.fields ? (
                  <AgreementFields fields={a.fields} answers={answers[key] ?? {}} onAnswer={(id, v) => setAnswers((x) => ({ ...x, [key]: { ...(x[key] ?? {}), [id]: v } }))} links={signedIn} />
                ) : (
                  <div className="mt-3 max-h-40 overflow-y-auto border border-line bg-chalk p-3 text-[0.82rem] whitespace-pre-wrap text-ink-soft">{a.body}</div>
                )}
                <label className="mt-4 block">
                  <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Type your full name to sign</span>
                  <input value={s.text} onChange={(e) => setSigs((x) => ({ ...x, [key]: { consent: s.consent, text: e.target.value } }))} className={input} />
                </label>
                <label className="mt-3 flex items-start gap-2.5 text-[0.85rem]">
                  <input type="checkbox" checked={s.consent} onChange={(e) => setSigs((x) => ({ ...x, [key]: { text: s.text, consent: e.target.checked } }))} className="mt-1 h-4 w-4" />I agree that my drawn signature, initials and typed name are my electronic signature on this agreement.
                </label>
              </>
            )}
          </div>
        );
      })}
      {state?.error ? <p className="text-[0.88rem] text-oxblood">{state.error}</p> : null}
      <div className="flex justify-center">
        <Submit />
      </div>
    </form>
  );
}
