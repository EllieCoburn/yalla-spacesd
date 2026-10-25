"use client";

import { useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { programs } from "@/content/programs";

const field =
  "peer w-full border-0 border-b border-ink/20 bg-transparent px-0 pt-6 pb-2.5 text-[1rem] text-ink placeholder-transparent transition-colors focus:border-blue focus:ring-0 focus:outline-none";
const label =
  "pointer-events-none absolute top-0 left-0 text-[0.7rem] tracking-[0.18em] text-ink-soft uppercase transition-all peer-placeholder-shown:top-6 peer-placeholder-shown:text-[0.95rem] peer-placeholder-shown:tracking-normal peer-placeholder-shown:normal-case peer-focus:top-0 peer-focus:text-[0.7rem] peer-focus:tracking-[0.18em] peer-focus:uppercase";

function Field({ name, children, type = "text", required }: { name: string; children: string; type?: string; required?: boolean }) {
  return (
    <label className="relative block">
      <input name={name} type={type} required={required} placeholder={children} className={field} />
      <span className={label}>
        {children}
        {required ? "" : " (optional)"}
      </span>
    </label>
  );
}

export function TourForm() {
  const [sent, setSent] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);

  if (sent) {
    return (
      <div className="flex min-h-[28rem] flex-col items-center justify-center text-center">
        <Mark name="arch" className="h-14 w-auto text-blue" />
        <h3 className="display mt-8 text-[2.2rem]">Thank you.</h3>
        <p className="mt-4 max-w-sm text-ink-soft">We’ll be in touch shortly to find a time for your visit.</p>
        <p className="mt-8 text-[0.75rem] text-oxblood">Preview: tour requests aren’t sent anywhere yet.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="space-y-7"
    >
      <div className="grid gap-7 sm:grid-cols-2">
        <Field name="name" required>
          Your name
        </Field>
        <Field name="email" type="email" required>
          Email
        </Field>
        <Field name="phone" type="tel">
          Phone
        </Field>
        <Field name="childAge">Child’s age or due date</Field>
      </div>

      <fieldset>
        <legend className="text-[0.7rem] tracking-[0.18em] text-ink-soft uppercase">I’m interested in</legend>
        <div className="mt-4 flex flex-wrap gap-2">
          {programs.map((p) => {
            const on = interests.includes(p.slug);
            return (
              <button
                type="button"
                key={p.slug}
                aria-pressed={on}
                onClick={() => setInterests((xs) => (on ? xs.filter((x) => x !== p.slug) : [...xs, p.slug]))}
                className={`rounded-full border px-4 py-2 text-[0.85rem] transition-all duration-300 ${
                  on ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink/60"
                }`}
              >
                {p.short}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field name="when">Days or times that suit you</Field>

      <label className="relative block">
        <textarea name="message" rows={3} placeholder="Anything else" className={`${field} resize-none`} />
        <span className={label}>Anything you’d like us to know (optional)</span>
      </label>

      <button type="submit" className="inline-flex h-14 w-full items-center justify-center rounded-full bg-ink text-[0.95rem] tracking-[0.04em] text-chalk transition-colors duration-500 hover:bg-blue sm:w-auto sm:px-10">
        Request a tour
      </button>
    </form>
  );
}
