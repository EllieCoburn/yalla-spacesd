import { Markup } from "@/components/faq/FaqAnswer";
import { isShown, type Answers, type FormField } from "@/lib/forms/fields";

const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long", timeStyle: "short" });
const isImage = (v: string | undefined) => !!v && v.startsWith("data:image/");

/**
 * A signed agreement or form exactly as it was signed: that version's full text with the family's
 * initials, choices, typed answers and drawn signature in place. Used by the Family Portal's signed
 * copies and by Admin (on screen and printed for paper records).
 */
export function SignedDocument({
  fields,
  answers,
  body,
  kind,
  signatureText,
  signerName,
  signedAt,
}: {
  fields: FormField[];
  answers: Answers;
  body: string;
  kind: string;
  signatureText: string | null;
  signerName: string | null;
  signedAt: Date;
}) {
  const a = answers;
  return (
    <div className="signed-doc space-y-5 text-[0.95rem] leading-relaxed text-ink-soft">
      {/* A form's opening text is part of what was agreed (e.g. the sunscreen standards); an agreement's is only "please read and sign". */}
      {fields.length === 0 || (kind !== "policy" && body.trim()) ? (
        <div className="space-y-3 border-b border-line pb-6">
          <Markup text={body} />
        </div>
      ) : null}
      {fields
        .filter((f) => isShown(f, a))
        .map((f) => {
          if (f.type === "heading") return <h2 key={f.id} className="pt-3 font-serif text-[1.3rem] text-ink">{f.text}</h2>;
          if (f.type === "info")
            return (
              <div key={f.id} className="space-y-3">
                <Markup text={f.text} />
              </div>
            );
          if (f.type === "initials")
            return (
              <div key={f.id} className="signed-doc-box flex items-center justify-between gap-4 rounded-lg border border-ink/10 bg-chalk p-3">
                <p className="text-[0.88rem] text-ink">{f.label}</p>
                {isImage(a[f.id]) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a[f.id]} alt="Initials" className="h-12 w-auto shrink-0" />
                ) : (
                  <span className="text-[0.8rem] text-ink-soft">Not initialed</span>
                )}
              </div>
            );
          if (f.type === "agree")
            return (
              <p key={f.id} className="flex items-start gap-2.5 text-[0.9rem] text-ink">
                <span aria-hidden className="mt-0.5">{a[f.id] === "yes" ? "☑" : "☐"}</span>
                {f.label}
              </p>
            );
          if (f.type === "choice")
            return (
              <p key={f.id} className="text-[0.9rem]">
                <span className="text-ink">{f.label}</span> {f.options.find((o) => o.value === a[f.id])?.label ?? "—"}
              </p>
            );
          if (f.type === "text" || f.type === "textarea")
            return (
              <p key={f.id} className="text-[0.9rem]">
                <span className="text-ink">
                  {f.label}
                  {/[.?!:]$/.test(f.label.trim()) ? "" : ":"}
                </span>{" "}
                {a[f.id] || "—"}
              </p>
            );
          if (f.type === "signature")
            return (
              <div key={f.id} className="border-t border-line pt-5">
                <p className="text-[0.8rem] tracking-[0.12em] text-ink-soft uppercase">{f.label}</p>
                {isImage(a[f.id]) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a[f.id]} alt="Signature" className="mt-2 h-24 w-auto" />
                ) : null}
                <p className="mt-2 text-[0.9rem] text-ink">
                  {signatureText || signerName} · {when(signedAt)}
                </p>
              </div>
            );
          return null;
        })}
    </div>
  );
}
