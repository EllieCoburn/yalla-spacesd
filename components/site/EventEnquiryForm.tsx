"use client";

import { useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { Field } from "./TourForm";

export function EventEnquiryForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center text-center">
        <Mark name="sun" className="h-12 w-12 text-blue" />
        <h3 className="display mt-8 text-[2.2rem]">Thank you.</h3>
        <p className="mt-4 max-w-sm text-ink-soft">We’ll be in touch to talk through your event.</p>
        <p className="mt-8 text-[0.75rem] text-oxblood">Preview: enquiries aren’t sent anywhere yet.</p>
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
        <Field name="occasion" required>
          What are you celebrating?
        </Field>
        <Field name="date">Preferred date</Field>
        <Field name="guests">Approximate number of guests</Field>
      </div>
      <Field name="message">Anything else you’d like us to know</Field>
      <button
        type="submit"
        className="inline-flex h-14 w-full items-center justify-center rounded-full bg-ink text-[0.95rem] tracking-[0.04em] text-chalk transition-colors duration-500 hover:bg-blue sm:w-auto sm:px-10"
      >
        Send enquiry
      </button>
    </form>
  );
}
