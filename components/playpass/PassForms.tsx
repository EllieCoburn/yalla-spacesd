"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { changePlanAction, createAccountAction, setRenewalAction, startPlayPassAction, type PassState } from "@/app/(site)/play-passes/actions";

const field = "mt-1.5 w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";

function Submit({ children, pending, disabled, variant = "solid" }: { children: React.ReactNode; pending: string; disabled?: boolean; variant?: "solid" | "outline" }) {
  const { pending: busy } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={`inline-flex h-12 items-center justify-center rounded-full px-7 text-[0.9rem] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === "solid" ? "w-full bg-ink text-chalk hover:bg-blue" : "border border-ink/25 hover:border-ink"
      }`}
    >
      {busy ? pending : children}
    </button>
  );
}

function Note({ state }: { state: PassState }) {
  if (!state) return null;
  return (
    <div role="status" className={`mt-4 text-[0.88rem] ${state.error ? "text-oxblood" : "text-ink-soft"}`}>
      {state.error ?? state.message}
      {state.devLink ? (
        <a href={state.devLink} className="mt-2 block text-blue underline underline-offset-4">
          Open the sign-in link (test mode)
        </a>
      ) : null}
    </div>
  );
}

/** Agree to the billing terms, then go to secure payment. */
export function ConfirmPass({ tier, terms, label }: { tier: string; terms: string[]; label: string }) {
  const [state, action] = useActionState(startPlayPassAction, undefined);
  const [ok, setOk] = useState(false);
  return (
    <form action={action}>
      <input type="hidden" name="tier" value={tier} />
      <ul className="space-y-2 text-[0.92rem]">
        {terms.map((t) => (
          <li key={t} className="flex gap-3">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink/50" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
      <label className="mt-6 flex cursor-pointer items-start gap-3 text-[0.92rem]">
        <input type="checkbox" name="accept" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-blue)]" />
        <span>I agree to these monthly billing terms and authorize Yalla to charge my saved card on the 1st of each month until I stop renewing.</span>
      </label>
      <div className="mt-6">
        <Submit pending="Opening secure payment…" disabled={!ok}>
          {label}
        </Submit>
      </div>
      <p className="mt-3 text-center text-[0.78rem] text-ink-soft">Payment is handled securely by Stripe. Yalla never sees or stores your card number.</p>
      <Note state={state} />
    </form>
  );
}

export function CreateAccount({ tier }: { tier: string }) {
  const [state, action] = useActionState(createAccountAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tier" value={tier} />
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">
          First name
          <input name="firstName" required autoComplete="given-name" className={`${field} tracking-normal normal-case text-ink`} />
        </label>
        <label className="block text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">
          Last name
          <input name="lastName" required autoComplete="family-name" className={`${field} tracking-normal normal-case text-ink`} />
        </label>
      </div>
      <label className="block text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">
        Email
        <input type="email" name="email" required autoComplete="email" className={`${field} tracking-normal normal-case text-ink`} />
      </label>
      <label className="block text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">
        Phone (optional)
        <input type="tel" name="phone" autoComplete="tel" className={`${field} tracking-normal normal-case text-ink`} />
      </label>
      <Submit pending="Creating your account…">Create account and continue</Submit>
      <Note state={state} />
    </form>
  );
}

export function RenewalForm({ renew, label }: { renew: boolean; label: string }) {
  const [state, action] = useActionState(setRenewalAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="renew" value={renew ? "1" : "0"} />
      <Submit pending="Saving…" variant="outline">
        {label}
      </Submit>
      <Note state={state} />
    </form>
  );
}

export function ChangePlanForm({ options, current }: { options: { tier: string; label: string }[]; current: string }) {
  const [state, action] = useActionState(changePlanAction, undefined);
  const [tier, setTier] = useState(current);
  return (
    <form action={action}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Play Pass from your next renewal">
        {options.map((o) => (
          <label key={o.tier} className={`cursor-pointer rounded-full border px-4 py-2 text-[0.85rem] ${tier === o.tier ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"}`}>
            <input type="radio" name="tier" value={o.tier} checked={tier === o.tier} onChange={() => setTier(o.tier)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
      <div className="mt-4">
        <Submit pending="Saving…" variant="outline" disabled={tier === current}>
          Save for next renewal
        </Submit>
      </div>
      <Note state={state} />
    </form>
  );
}
