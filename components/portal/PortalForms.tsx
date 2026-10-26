"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cancelItemAction, requestLinkAction, signFormAction, updateCareAction, type PortalState } from "@/app/(site)/portal/actions";

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
          ["careNotes", "Care notes (naps, comfort, routines)"],
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
