"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { submitOnlineFormAction, type PortalState } from "@/app/(site)/portal/actions";
import { Markup } from "@/components/faq/FaqAnswer";
import { isShown, type Answers, type FormField } from "@/lib/forms/fields";
import { SignaturePad } from "./SignaturePad";

const input = "mt-1.5 w-full rounded-lg border border-ink/20 bg-white px-3.5 py-2.5 text-[1rem] focus:border-blue focus:ring-2 focus:ring-blue/20 focus:outline-none";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-ink px-8 text-[0.95rem] text-chalk transition-colors hover:bg-blue disabled:opacity-50 sm:w-auto">
      {pending ? "Saving…" : "Sign and submit"}
    </button>
  );
}

/** A form families complete and sign in the portal: choices, follow-ups, initials and a drawn signature. */
export function OnlineForm({ templateId, childId, fields, intro, signerName, requiresSignature }: { templateId: string; childId: string | null; fields: FormField[]; intro: ReactNode; signerName: string; requiresSignature: boolean }) {
  const [state, action] = useActionState<PortalState, FormData>(submitOnlineFormAction, undefined);
  const [answers, setAnswers] = useState<Answers>({});
  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));

  return (
    <form action={action} className="space-y-10">
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="childId" value={childId ?? ""} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      {intro}

      {fields.filter((f) => isShown(f, answers)).map((f) => {
        if (f.type === "heading") return <h2 key={f.id} className="display border-t border-line pt-8 text-[1.5rem]">{f.text}</h2>;
        if (f.type === "info")
          return (
            <div key={f.id} className="space-y-3 text-[0.98rem] text-ink-soft">
              <Markup text={f.text} />
            </div>
          );
        if (f.type === "choice")
          return (
            <fieldset key={f.id}>
              <legend className="text-[1.02rem] text-ink">
                {f.label}
                {f.required ? <span className="sr-only"> (required)</span> : null}
              </legend>
              <div className="mt-3 space-y-2">
                {f.options.map((o) => (
                  <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-[0.95rem] transition-colors ${answers[f.id] === o.value ? "border-ink bg-paper" : "border-ink/15 hover:border-ink/40"}`}>
                    <input type="radio" name={`q_${f.id}`} value={o.value} checked={answers[f.id] === o.value} onChange={() => set(f.id, o.value)} className="mt-1 h-4 w-4 accent-[var(--color-blue)]" />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        if (f.type === "text" || f.type === "textarea")
          return (
            <label key={f.id} className="block">
              <span className="text-[1.02rem] text-ink">
                {f.label}
                {!f.required ? <span className="text-ink-soft"> (optional)</span> : null}
              </span>
              {f.type === "text" ? (
                <input value={answers[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} placeholder={f.placeholder} className={input} />
              ) : (
                <textarea rows={3} value={answers[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} placeholder={f.placeholder} className={input} />
              )}
            </label>
          );
        if (f.type === "agree")
          return (
            <label key={f.id} className="flex cursor-pointer items-start gap-3 text-[0.98rem]">
              <input type="checkbox" checked={answers[f.id] === "yes"} onChange={(e) => set(f.id, e.target.checked ? "yes" : "")} className="mt-1 h-4 w-4 accent-[var(--color-blue)]" />
              <span>{f.label}</span>
            </label>
          );
        if (f.type === "initials")
          return (
            <div key={f.id} className="rounded-lg border border-line bg-paper p-5">
              <p className="text-[0.98rem] text-ink">{f.label}</p>
              <div className="mt-4">
                <SignaturePad kind="initials" label="Your initials" value={answers[f.id] ?? ""} onChange={(v) => set(f.id, v)} />
              </div>
            </div>
          );
        return null;
      })}

      {/* Signature last, with the typed name */}
      {fields
        .filter((f) => f.type === "signature")
        .map((f) => (
          <div key={f.id} className="space-y-5 border-t border-line pt-8">
            <SignaturePad label={f.type === "signature" ? f.label : "Signature"} value={answers[f.id] ?? ""} onChange={(v) => set(f.id, v)} />
            {requiresSignature ? (
              <>
                <label className="block max-w-md">
                  <span className="text-[0.92rem] text-ink">Your full name</span>
                  <input name="signatureText" required defaultValue={signerName} autoComplete="name" className={input} />
                </label>
                <label className="flex cursor-pointer items-start gap-3 text-[0.9rem] text-ink-soft">
                  <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-[var(--color-blue)]" />
                  <span>I’m this child’s parent or legal guardian, and I agree that my drawn signature and typed name are my electronic signature on this form.</span>
                </label>
              </>
            ) : null}
          </div>
        ))}

      {state?.error ? (
        <p role="alert" className="rounded-lg bg-oxblood/[0.06] px-4 py-3 text-[0.92rem] text-oxblood">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}
