"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { cancelPassAction, changeTierAction, pausePassAction, startGuestPlayPassAction, startPlayPassAction, undoCancelAction, undoPauseAction, type PassState } from "@/app/(site)/play-passes/actions";

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
        <span>I agree to these monthly billing terms and authorize Yalla to charge my saved card on the 1st of each month until my membership ends (30 days’ notice to cancel).</span>
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

/** New to Yalla: who's joining, then the billing terms, then secure payment. */
export function GuestPass({ tier, terms, label }: { tier: string; terms: string[]; label: string }) {
  const [state, action] = useActionState(startGuestPlayPassAction, undefined);
  const [ok, setOk] = useState(false);
  const [rows, setRows] = useState([0]);
  const lab = "eyebrow text-[0.6rem] text-ink-soft";
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tier" value={tier} />
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={lab}>Your first name</span>
          <input name="firstName" required autoComplete="given-name" className={field} />
        </label>
        <label className="block">
          <span className={lab}>Last name</span>
          <input name="lastName" required autoComplete="family-name" className={field} />
        </label>
        <label className="block">
          <span className={lab}>Email</span>
          <input type="email" name="email" required autoComplete="email" className={field} />
        </label>
        <label className="block">
          <span className={lab}>Mobile</span>
          <input type="tel" name="phone" required autoComplete="tel" className={field} />
        </label>
      </div>
      <fieldset className="border-t border-line pt-5">
        <legend className="display pr-3 text-[1.3rem]">Your children</legend>
        <div className="mt-3 space-y-4">
          {rows.map((r, i) => (
            <div key={r} className="grid grid-cols-2 items-end gap-4 sm:grid-cols-[1fr_1fr_9.5rem_auto]">
              <label className="block">
                <span className={lab}>Child’s first name</span>
                <input name="childFirstName" required={i === 0} autoComplete="off" className={field} />
              </label>
              <label className="block">
                <span className={lab}>Last name</span>
                <input name="childLastName" required={i === 0} autoComplete="off" className={field} />
              </label>
              <label className="block">
                <span className={lab}>Date of birth</span>
                <input type="date" name="childBirthDate" required={i === 0} max={new Date().toISOString().slice(0, 10)} className={field} />
              </label>
              {rows.length > 1 ? (
                <button type="button" onClick={() => setRows((x) => x.filter((k) => k !== r))} className="pb-3 text-left text-[0.8rem] text-ink-soft hover:text-ink">
                  Remove
                </button>
              ) : (
                <span className="hidden sm:block" />
              )}
            </div>
          ))}
        </div>
        {rows.length < 6 ? (
          <button type="button" onClick={() => setRows((x) => [...x, Math.max(...x) + 1])} className="mt-3 text-[0.88rem] text-blue underline-offset-4 hover:underline">
            + Add another child
          </button>
        ) : null}
      </fieldset>
      <div className="border-t border-line pt-5">
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
          <span>I agree to these monthly billing terms and authorize Yalla to charge my saved card on the 1st of each month until my membership ends (30 days’ notice to cancel).</span>
        </label>
      </div>
      <Submit pending="Opening secure payment…" disabled={!ok}>
        {label}
      </Submit>
      <p className="text-center text-[0.78rem] text-ink-soft">Your Family Portal opens as soon as your payment goes through. Payment is handled securely by Stripe.</p>
      <Note state={state} />
    </form>
  );
}

/** A one-button action (cancel with notice, undo a cancellation, undo a pause), with a confirmation. */
export function PassButton({ kind, label, confirmText }: { kind: "cancel" | "undoCancel" | "undoPause"; label: string; confirmText?: string }) {
  const fn = kind === "cancel" ? cancelPassAction : kind === "undoCancel" ? undoCancelAction : undoPauseAction;
  const [state, action] = useActionState(fn, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
    >
      <Submit pending="Saving…" variant="outline">
        {label}
      </Submit>
      <Note state={state} />
    </form>
  );
}

export type TierOption = { tier: string; label: string; detail: string; kind: "upgrade" | "downgrade" | "current" };

export function ChangePlanForm({ options, current }: { options: TierOption[]; current: string }) {
  const [state, action] = useActionState(changeTierAction, undefined);
  const [tier, setTier] = useState(current);
  const chosen = options.find((o) => o.tier === tier);
  return (
    <form action={action}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Choose your Play Pass">
        {options.map((o) => (
          <label key={o.tier} className={`cursor-pointer rounded-full border px-4 py-2 text-[0.85rem] ${tier === o.tier ? "border-ink bg-ink text-chalk" : "border-ink/20 hover:border-ink"}`}>
            <input type="radio" name="tier" value={o.tier} checked={tier === o.tier} onChange={() => setTier(o.tier)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
      {chosen && chosen.tier !== current ? <p className="mt-3 text-[0.85rem] text-ink-soft">{chosen.detail}</p> : null}
      <div className="mt-4">
        <Submit pending="Saving…" variant="outline" disabled={tier === current}>
          {chosen?.kind === "upgrade" ? "Upgrade now" : chosen?.kind === "downgrade" ? "Give notice to downgrade" : "Save"}
        </Submit>
      </div>
      <Note state={state} />
    </form>
  );
}

export function PauseForm({ earliest, maxDays }: { earliest: string; maxDays: number }) {
  const [state, action] = useActionState(pausePassAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-[0.85rem]">
        <span className="text-ink-soft">First day of your pause</span>
        <input type="date" name="startOn" min={earliest} defaultValue={earliest} required className={field} />
      </label>
      <label className="block text-[0.85rem]">
        <span className="text-ink-soft">How many days (up to {maxDays})</span>
        <input type="number" name="days" min={1} max={maxDays} defaultValue={maxDays} required className={field} />
      </label>
      <Submit pending="Saving…" variant="outline">
        Schedule pause
      </Submit>
      <Note state={state} />
    </form>
  );
}
