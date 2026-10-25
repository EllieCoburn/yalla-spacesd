"use client";

import { useActionState, useState } from "react";
import { enterPortal } from "@/app/prospective/actions";
import { Mark } from "@/components/brand/Mark";
import { Field } from "@/components/site/TourForm";

export function CodeForm() {
  const [state, action, pending] = useActionState(enterPortal, undefined);
  return (
    <form action={action} className="space-y-6">
      <label className="block">
        <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Access code</span>
        <input
          name="code"
          required
          autoComplete="off"
          autoCapitalize="none"
          className="w-full border-0 border-b border-ink/20 bg-transparent px-0 py-3 text-[1.1rem] tracking-[0.08em] focus:border-blue focus:ring-0 focus:outline-none"
        />
      </label>
      {state?.error ? (
        <p role="alert" className="text-[0.85rem] text-oxblood">
          {state.error}
        </p>
      ) : null}
      <button
        disabled={pending}
        className="h-14 w-full rounded-full bg-ink text-[0.95rem] text-chalk transition-colors duration-500 hover:bg-blue disabled:opacity-50"
      >
        {pending ? "Opening…" : "Enter the portal"}
      </button>
    </form>
  );
}

export function RequestAccessForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div className="py-10 text-center">
        <Mark name="arch" className="mx-auto h-12 w-auto text-blue" />
        <p className="display mt-6 text-[1.9rem]">Thank you.</p>
        <p className="mx-auto mt-3 max-w-sm text-ink-soft">We’ll be in touch personally with current rates and your access code.</p>
        <p className="mt-6 text-[0.75rem] text-oxblood">Preview: requests aren’t sent anywhere yet.</p>
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
      <Field name="interest">What are you interested in?</Field>
      <button className="inline-flex h-14 w-full items-center justify-center rounded-full border border-ink/25 text-[0.95rem] transition-colors duration-500 hover:border-ink hover:bg-ink hover:text-chalk sm:w-auto sm:px-10">
        Request access
      </button>
    </form>
  );
}
