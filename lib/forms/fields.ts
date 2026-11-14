/**
 * Questions on an online form. A form version stores its fields (form_versions.fields); answers are
 * saved with the submission, alongside the exact text and fields that were signed.
 *
 * Signatures and initials are drawn with a finger or cursor and stored as small PNG images
 * (data URLs). The typed full name and the drawn signature together make the e-signature.
 */

/** Show a question only when an earlier answer matches (or when any of several do). */
export type ShowIf = { field: string; equals: string } | { anyOf: { field: string; equals: string }[] };

export type FormField =
  | { id: string; type: "heading"; text: string }
  /** Information shown on the form (FAQ formatting: paragraphs, "- " lists, [links](…), **bold**). */
  | { id: string; type: "info"; text: string; showIf?: ShowIf }
  | { id: string; type: "choice"; label: string; options: { value: string; label: string }[]; required?: boolean; showIf?: ShowIf }
  | { id: string; type: "text" | "textarea"; label: string; placeholder?: string; required?: boolean; showIf?: ShowIf }
  /** A statement the signer agrees to by ticking. */
  | { id: string; type: "agree"; label: string; required?: boolean; showIf?: ShowIf }
  /** A statement the signer initials (drawn). */
  | { id: string; type: "initials"; label: string; required?: boolean; showIf?: ShowIf }
  /** The drawn signature. Forms that require a signature have exactly one. */
  | { id: string; type: "signature"; label: string };

export type Answers = Record<string, string>;

const matches = (c: ShowIf, answers: Answers): boolean => ("anyOf" in c ? c.anyOf.some((x) => answers[x.field] === x.equals) : answers[c.field] === c.equals);
export const isShown = (f: FormField, answers: Answers) => !("showIf" in f) || !f.showIf || matches(f.showIf, answers);

const DRAWING = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
/** About 150 KB of image data: plenty for a signature, small enough to store with the record. */
const MAX_DRAWING = 200_000;

/**
 * Check answers against the fields. Returns the cleaned answers (hidden fields dropped) or the
 * first problem, worded for families.
 */
export function validateAnswers(fields: FormField[], raw: Answers): { ok: true; answers: Answers } | { ok: false; error: string } {
  const answers: Answers = {};
  for (const f of fields) {
    if (f.type === "heading" || f.type === "info") continue;
    if (!isShown(f, raw)) continue;
    const v = (raw[f.id] ?? "").trim();
    const required = f.type === "signature" || ("required" in f && f.required);
    if (!v) {
      if (required)
        return {
          ok: false,
          error:
            f.type === "signature"
              ? "Please sign in the signature box."
              : f.type === "initials"
                ? `Please add your initials: “${f.label}”`
                : f.type === "agree"
                  ? `Please confirm: “${f.label}”`
                  : `Please answer: “${f.label}”`,
        };
      continue;
    }
    if (f.type === "choice" && !f.options.some((o) => o.value === v)) return { ok: false, error: `Please choose an answer for “${f.label}”.` };
    if (f.type === "agree" && v !== "yes") return { ok: false, error: `Please confirm: “${f.label}”` };
    if ((f.type === "signature" || f.type === "initials") && (!DRAWING.test(v) || v.length > MAX_DRAWING)) return { ok: false, error: "That signature couldn’t be saved. Please clear it and sign again." };
    if ((f.type === "text" || f.type === "textarea") && v.length > 2000) return { ok: false, error: `Please shorten your answer to “${f.label}”.` };
    answers[f.id] = v;
  }
  return { ok: true, answers };
}

/** Human-readable answers for staff (drawings shown separately). */
export function describeAnswer(f: FormField, value: string | undefined) {
  if (!value) return "—";
  if (f.type === "choice") return f.options.find((o) => o.value === value)?.label ?? value;
  if (f.type === "agree") return "Confirmed";
  return value;
}
