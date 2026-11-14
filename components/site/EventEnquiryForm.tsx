"use client";

import { useActionState } from "react";
import { Mark } from "@/components/brand/Mark";
import { submitEnquiryAction, type EnquiryState } from "@/app/(site)/enquiry-actions";
import { Field, SendButton } from "./TourForm";

export function EventEnquiryForm() {
  const [state, action] = useActionState<EnquiryState, FormData>(submitEnquiryAction, undefined);

  if (state?.ok) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center text-center">
        <Mark name="sun" className="h-12 w-12 text-blue" />
        <h3 className="display mt-8 text-[2.2rem]">Thank you.</h3>
        <p className="mt-4 max-w-sm text-ink-soft">We’ll be in touch to talk through your event.</p>
      </div>
    );
  }

  return (
    <form action={action} className="relative space-y-7">
      <input type="hidden" name="kind" value="event" />
      <input type="text" name="yx_hp" tabIndex={-1} autoComplete="new-password" data-1p-ignore data-lpignore="true" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
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
      {state?.error ? (
        <p role="alert" className="text-[0.9rem] text-oxblood">
          {state.error}
        </p>
      ) : null}
      <SendButton className="inline-flex h-14 w-full items-center justify-center rounded-full bg-ink text-[0.95rem] tracking-[0.04em] text-chalk transition-colors duration-500 hover:bg-blue sm:w-auto sm:px-10">Send enquiry</SendButton>
    </form>
  );
}
