"use client";

import { Markup } from "@/components/faq/FaqAnswer";
import { SignaturePad } from "@/components/forms/SignaturePad";
import { isShown, type Answers, type FormField } from "@/lib/forms/fields";

const input =
  "w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";

/**
 * An online agreement as families see it at checkout: the text in a scroll box with initials, then the
 * drawn signature. Shared by checkout and the staff preview, so what staff review is what families sign.
 */
export function AgreementFields({ fields, answers, onAnswer, links = true }: { fields: FormField[]; answers: Answers; onAnswer: (id: string, value: string) => void; /** Family Portal links are clickable only for signed-in families. */ links?: boolean }) {
  return (
    <>
      <div className="mt-4 max-h-[32rem] space-y-4 overflow-y-auto border border-line bg-chalk p-4 text-[0.86rem] leading-relaxed text-ink-soft">
        {fields
          .filter((f) => f.type !== "signature" && isShown(f, answers))
          .map((f) => {
            const v = answers[f.id] ?? "";
            if (f.type === "heading") return <p key={f.id} className="pt-2 font-serif text-[1.08rem] text-ink">{f.text}</p>;
            if (f.type === "info") return <div key={f.id} className="space-y-2.5"><Markup text={f.text} newTab links={links} /></div>;
            if (f.type === "initials")
              return (
                <div key={f.id} className={`rounded-lg border p-3 ${v ? "border-ink/15 bg-paper" : "border-blue/50 bg-blue/[0.04]"}`}>
                  <p className="text-[0.86rem] text-ink">{f.label}</p>
                  <div className="mt-2">
                    <SignaturePad kind="initials" label="Your initials" value={v} onChange={(x) => onAnswer(f.id, x)} />
                  </div>
                </div>
              );
            if (f.type === "text" || f.type === "textarea")
              return (
                <label key={f.id} className="block">
                  <span className="text-[0.86rem] text-ink">{f.label}</span>
                  <input value={v} onChange={(e) => onAnswer(f.id, e.target.value)} className={input} />
                </label>
              );
            if (f.type === "agree")
              return (
                <label key={f.id} className="flex items-start gap-2.5 text-[0.86rem] text-ink">
                  <input type="checkbox" checked={v === "yes"} onChange={(e) => onAnswer(f.id, e.target.checked ? "yes" : "")} className="mt-1 h-4 w-4" />
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
                        <input type="radio" checked={v === o.value} onChange={() => onAnswer(f.id, o.value)} className="mt-1" />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            return null;
          })}
      </div>
      {fields
        .filter((f) => f.type === "signature")
        .map((f) => (
          <div key={f.id} className="mt-4">
            <SignaturePad label={f.type === "signature" ? f.label : "Signature"} value={answers[f.id] ?? ""} onChange={(x) => onAnswer(f.id, x)} />
          </div>
        ))}
    </>
  );
}
