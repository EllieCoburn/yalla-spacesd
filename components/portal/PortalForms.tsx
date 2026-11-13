"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { cancelItemAction, createAccountAction, requestLinkAction, setPasswordAction, signFormAction, signInAction, updateCareAction, type PortalState } from "@/app/(site)/portal/actions";

const field = "w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";

function Submit({ children, variant = "solid", pending: pendingLabel }: { children: string; variant?: "solid" | "outline"; pending?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={
        variant === "solid"
          ? "h-12 rounded-full bg-ink px-7 text-[0.9rem] text-chalk transition-colors duration-500 hover:bg-blue disabled:opacity-40"
          : "h-10 rounded-full border border-ink/25 px-5 text-[0.82rem] transition-colors hover:border-ink disabled:opacity-40"
      }
    >
      {pending ? (pendingLabel ?? "One moment…") : children}
    </button>
  );
}

function Message({ state }: { state: PortalState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="text-[0.85rem] text-oxblood">
        {state.error}
      </p>
    );
  return state.message ? (
    <div role="status" className="text-[0.85rem] text-ink-soft">
      {state.message}
      {state.devLink ? (
        <p className="mt-2 text-[0.75rem] break-all">
          Local preview — the email was captured, not sent:{" "}
          <a href={state.devLink} className="text-blue underline">
            open sign-in link
          </a>
        </p>
      ) : null}
    </div>
  ) : null;
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(requestLinkAction, undefined);
  return (
    <form action={action} className="mt-10 space-y-6">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block">
        <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Email</span>
        <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" className={`${field} placeholder:text-ink/25`} />
      </label>
      <Submit pending="Sending…">Email me a sign-in link</Submit>
      <Message state={state} />
    </form>
  );
}

export function CareForm({ childId, care }: { childId: string; care: { allergies: string | null; medicalNotes: string | null; careNotes: string | null } }) {
  const [state, action] = useActionState(updateCareAction, undefined);
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="childId" value={childId} />
      {(
        [
          ["allergies", "Allergies"],
          ["medicalNotes", "Medical notes"],
          ["careNotes", "Care notes (rest, comfort, routines)"],
        ] as const
      ).map(([k, l]) => (
        <label key={k} className="block">
          <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">{l}</span>
          <textarea name={k} rows={2} defaultValue={care[k] ?? ""} className={`${field} resize-none`} />
        </label>
      ))}
      <Submit variant="outline" pending="Saving…">
        Save care information
      </Submit>
      <Message state={state} />
    </form>
  );
}

export function CancelForm({ itemId, label }: { itemId: string; label: string }) {
  const [state, action] = useActionState(cancelItemAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Cancel ${label}? Cancelling doesn’t issue a refund automatically — Yalla will confirm any refund or credit.`)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="itemId" value={itemId} />
      <Submit variant="outline" pending="Cancelling…">
        Cancel
      </Submit>
      <Message state={state} />
    </form>
  );
}

export function SignForm({ templateId, childId, requiresSignature, body, version }: { templateId: string; childId: string | null; requiresSignature: boolean; body: string; version: number }) {
  const [state, action] = useActionState(signFormAction, undefined);
  if (state?.ok) return <p className="mt-3 text-[0.85rem] text-blue">{state.message}</p>;
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="childId" value={childId ?? ""} />
      <div className="max-h-40 overflow-y-auto border border-line bg-chalk p-3 text-[0.82rem] whitespace-pre-wrap text-ink-soft">{body}</div>
      <p className="eyebrow text-[0.55rem] text-ink-soft">Version {version}</p>
      {requiresSignature ? (
        <label className="block">
          <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Type your full name to sign</span>
          <input name="signatureText" required className={field} />
        </label>
      ) : null}
      <label className="flex items-start gap-2.5 text-[0.85rem]">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4" />
        {requiresSignature ? "I’ve read this and agree to sign electronically." : "I confirm this information."}
      </label>
      <Submit variant="outline" pending="Submitting…">
        {requiresSignature ? "Sign" : "Confirm"}
      </Submit>
      <Message state={state} />
    </form>
  );
}

const label = "block text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase";

function PasswordInput({ name, autoComplete, placeholder }: { name: string; autoComplete: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} name={name} required autoComplete={autoComplete} placeholder={placeholder} minLength={8} className={`${field} pr-14 placeholder:text-ink/25`} />
      <button type="button" onClick={() => setShow((v) => !v)} className="absolute top-1/2 right-0 -translate-y-1/2 text-[0.75rem] text-ink-soft hover:text-ink">
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

/** Email and password. */
export function PasswordSignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, undefined);
  return (
    <form action={action} className="mt-10 space-y-6">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block">
        <span className={label}>Email</span>
        <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" className={`${field} placeholder:text-ink/25`} />
      </label>
      <label className="block">
        <span className={label}>Password</span>
        <PasswordInput name="password" autoComplete="current-password" />
      </label>
      <div className="flex justify-center">
        <Submit pending="Signing in…">Sign in</Submit>
      </div>
      <Message state={state} />
    </form>
  );
}

/** A new family: the guardian, a password, and their children. */
export function CreateAccountForm({ next }: { next?: string }) {
  const [state, action] = useActionState(createAccountAction, undefined);
  const [rows, setRows] = useState([0]);
  return (
    <form action={action} className="mt-10 space-y-6">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block">
          <span className={label}>First name</span>
          <input name="firstName" required autoComplete="given-name" className={field} />
        </label>
        <label className="block">
          <span className={label}>Last name</span>
          <input name="lastName" required autoComplete="family-name" className={field} />
        </label>
      </div>
      <label className="block">
        <span className={label}>Email</span>
        <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" className={`${field} placeholder:text-ink/25`} />
      </label>
      <label className="block">
        <span className={label}>Password</span>
        <PasswordInput name="password" autoComplete="new-password" placeholder="At least 8 characters" />
      </label>

      <fieldset className="border-t border-line pt-6">
        <legend className="display pr-3 text-[1.4rem]">Your children</legend>
        <p className="mt-1 text-[0.85rem] text-ink-soft">You can add more children, and their care details, anytime in the portal.</p>
        <div className="mt-4 space-y-5">
          {rows.map((r, i) => (
            <div key={r} className="grid grid-cols-[1fr_auto] items-end gap-4 sm:grid-cols-[1fr_11rem_auto]">
              <label className="col-span-2 block sm:col-span-1">
                <span className={label}>Child’s first name</span>
                <input name="childFirstName" required={i === 0} autoComplete="off" className={field} />
              </label>
              <label className="block">
                <span className={label}>Date of birth</span>
                <input type="date" name="childBirthDate" required={i === 0} max={new Date().toISOString().slice(0, 10)} className={field} />
              </label>
              {rows.length > 1 ? (
                <button type="button" onClick={() => setRows((x) => x.filter((k) => k !== r))} className="pb-3 text-[0.8rem] text-ink-soft hover:text-ink" aria-label="Remove this child">
                  Remove
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        {rows.length < 8 ? (
          <button type="button" onClick={() => setRows((x) => [...x, Math.max(...x) + 1])} className="mt-4 text-[0.88rem] text-blue underline-offset-4 hover:underline">
            + Add another child
          </button>
        ) : null}
      </fieldset>

      <Submit pending="Creating your account…">Create account</Submit>
      <Message state={state} />
    </form>
  );
}

export function SetPasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action] = useActionState(setPasswordAction, undefined);
  return (
    <form action={action} className="space-y-6">
      <label className="block">
        <span className={label}>{hasPassword ? "New password" : "Password"}</span>
        <PasswordInput name="password" autoComplete="new-password" placeholder="At least 8 characters" />
      </label>
      <label className="block">
        <span className={label}>Confirm password</span>
        <PasswordInput name="confirm" autoComplete="new-password" />
      </label>
      <Submit pending="Saving…">{hasPassword ? "Change password" : "Set password"}</Submit>
      <Message state={state} />
    </form>
  );
}
