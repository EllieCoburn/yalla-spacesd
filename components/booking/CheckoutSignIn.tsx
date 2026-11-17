"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { checkoutEmailLinkAction, checkoutSignInAction, type CheckoutSignInState } from "@/app/(site)/book/actions";

const input = "w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";

/**
 * Sign in to the Family Portal without leaving checkout, so a returning family books with their saved
 * children, details and Yalla Wallet. `required` = this email already has a Family Portal account.
 */
export function CheckoutSignIn({ email: initialEmail = "", required = false, onSignedIn }: { email?: string; required?: boolean; onSignedIn: () => void }) {
  const [open, setOpen] = useState(required);
  const [email, setEmail] = useState(initialEmail);
  const [state, action, signingIn] = useActionState<CheckoutSignInState, FormData>(checkoutSignInAction, undefined);
  const [link, setLink] = useState<CheckoutSignInState>(undefined);
  const [sending, startSending] = useTransition();

  useEffect(() => setEmail(initialEmail), [initialEmail]);
  useEffect(() => {
    if (required) setOpen(true);
  }, [required]);
  // Once per successful sign-in (the parent's callback can change identity on every render).
  const handled = useRef<CheckoutSignInState>(undefined);
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      onSignedIn();
    }
  }, [state, onSignedIn]);

  const note = state?.error ?? state?.message ?? link?.message;
  const devLink = state?.devLink ?? link?.devLink;

  return (
    <div className={`border p-5 ${required ? "border-blue bg-blue/[0.05]" : "border-line bg-paper"}`}>
      {required ? (
        <>
          <p className="display text-[1.25rem]">Welcome back! Please sign in.</p>
          <p className="mt-1 text-[0.88rem] text-ink-soft">{email} already has a Family Portal. Sign in to book with your saved children and details. Your selection stays right here.</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.92rem]">
            <span className="text-ink">Already have a Family Portal?</span> <span className="text-ink-soft">Sign in to use your saved children and details.</span>
          </p>
          {!open ? (
            <button type="button" onClick={() => setOpen(true)} className="h-10 rounded-full border border-ink/25 px-5 text-[0.85rem] hover:border-ink">
              Sign in
            </button>
          ) : null}
        </div>
      )}
      {open ? (
        <form action={action} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Email</span>
            <input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Password</span>
            <input name="password" type="password" autoComplete="current-password" className={input} />
          </label>
          <button disabled={signingIn} className="h-11 rounded-full bg-ink px-6 text-[0.88rem] text-chalk hover:bg-blue disabled:opacity-50">
            {signingIn ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-[0.82rem] text-ink-soft sm:col-span-3">
            No password yet, or forgot it?{" "}
            <button
              type="button"
              disabled={sending || !/\S+@\S+\.\S+/.test(email)}
              onClick={() => startSending(async () => setLink(await checkoutEmailLinkAction(email, window.location.pathname + window.location.search)))}
              className="text-ink underline underline-offset-4 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Email me a sign-in link"}
            </button>
          </p>
        </form>
      ) : null}
      {note ? <p className={`mt-3 text-[0.85rem] ${state?.error ? "text-oxblood" : "text-ink-soft"}`}>{note}</p> : null}
      {devLink ? (
        <a href={devLink} className="mt-1 block text-[0.82rem] text-blue underline underline-offset-4">
          Open the sign-in link (test mode)
        </a>
      ) : null}
    </div>
  );
}
