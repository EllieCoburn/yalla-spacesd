"use client";

import { useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { Field } from "./TourForm";

const pill = (on: boolean) =>
  `rounded-full border px-4 py-2 text-[0.85rem] transition-all duration-300 ${on ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink/60"}`;

export function ApplicationForm() {
  const [sent, setSent] = useState(false);
  const [days, setDays] = useState<number | null>(null);
  const [length, setLength] = useState<"full" | "half" | "custom" | null>(null);
  const [when, setWhen] = useState<"next" | "soonest" | null>(null);
  const [onsite, setOnsite] = useState<"me" | "partner" | "both" | null>(null);
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [flex, setFlex] = useState<"set" | "some" | "any" | null>(null);
  const toggleDay = (d: string) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  if (sent) {
    return (
      <div className="flex min-h-[26rem] flex-col items-center justify-center text-center">
        <Mark name="balcony" className="h-14 w-auto text-blue" />
        <h3 className="display mt-8 text-[2.2rem]">Thank you for applying.</h3>
        <p className="mt-4 max-w-sm text-ink-soft">We’ll be in touch about cohort availability and the next steps for your family.</p>
        <p className="mt-8 text-[0.75rem] text-oxblood">Preview: applications aren’t sent anywhere yet.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="space-y-9"
    >
      <fieldset className="space-y-7">
        <legend className="eyebrow mb-2 text-ink-soft">About you</legend>
        <div className="grid gap-7 sm:grid-cols-2">
          <Field name="parentName" required>
            Your name
          </Field>
          <Field name="email" type="email" required>
            Email
          </Field>
          <Field name="phone" type="tel">
            Phone
          </Field>
          <Field name="work">What kind of work do you do?</Field>
        </div>
      </fieldset>

      <fieldset className="space-y-7">
        <legend className="eyebrow mb-2 text-ink-soft">About your child</legend>
        <div className="grid gap-7 sm:grid-cols-2">
          <Field name="childName" required>
            Child’s first name
          </Field>
          <Field name="childBirth" required>
            Date of birth or due date
          </Field>
          <Field name="start">Ideal start date</Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="eyebrow text-ink-soft">Working onsite</legend>
        <p className="mt-4 text-[0.95rem]">Which parent or guardian will be working onsite in our coworking space?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["me", "Me"],
              ["partner", "My partner or co-parent"],
              ["both", "Both of us"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className={`${pill(onsite === v)} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue`}>
              <input type="radio" name="onsite" value={v} required checked={onsite === v} onChange={() => setOnsite(v)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="eyebrow text-ink-soft">When you’d like to begin</legend>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" aria-pressed={when === "next"} onClick={() => setWhen("next")} className={pill(when === "next")}>
            Next cohort year (August) · recommended
          </button>
          <button type="button" aria-pressed={when === "soonest"} onClick={() => setWhen("soonest")} className={pill(when === "soonest")}>
            Soonest available spot
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="eyebrow text-ink-soft">The rhythm you’re hoping for</legend>
        <p className="mt-4 text-[0.85rem] text-ink-soft">Days per week</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} aria-pressed={days === n} onClick={() => setDays(n)} className={pill(days === n)}>
              {n}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[0.85rem] text-ink-soft">Preferred days</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
            <button type="button" key={d} aria-pressed={weekdays.includes(d)} onClick={() => toggleDay(d)} className={pill(weekdays.includes(d))}>
              {d}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[0.85rem] text-ink-soft">How flexible are those days?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["set", "These days are set"],
              ["some", "Somewhat flexible"],
              ["any", "Any days work"],
            ] as const
          ).map(([v, label]) => (
            <button type="button" key={v} aria-pressed={flex === v} onClick={() => setFlex(v)} className={pill(flex === v)}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[0.85rem] text-ink-soft">Day length</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" aria-pressed={length === "full"} onClick={() => setLength("full")} className={pill(length === "full")}>
            Full day · 8:30 – 4:30
          </button>
          <button type="button" aria-pressed={length === "half"} onClick={() => setLength("half")} className={pill(length === "half")}>
            Half day · 8:30 – 12:00
          </button>
          <button type="button" aria-pressed={length === "custom"} onClick={() => setLength("custom")} className={pill(length === "custom")}>
            Custom hours
          </button>
        </div>
      </fieldset>

      <Field name="message">Anything you’d like us to know</Field>

      <div className="flex justify-center pt-2">
        <button
          type="submit"
          className="inline-flex h-14 w-full items-center justify-center rounded-full bg-ink text-[0.95rem] tracking-[0.04em] text-chalk transition-colors duration-500 hover:bg-blue sm:w-auto sm:px-12"
        >
          Join Club Yalla
        </button>
      </div>
    </form>
  );
}
