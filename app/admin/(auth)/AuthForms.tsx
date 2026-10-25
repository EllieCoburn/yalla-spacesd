"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { btn, inputCls } from "@/components/admin/ui";
import { completeReset, requestReset, setupOwner, signIn, verifyMfa, type AuthState } from "./actions";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${btn.primary} h-11 w-full`} disabled={pending}>
      {pending ? "One moment…" : children}
    </button>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[0.8rem] font-medium text-ink">{label}</span>
      <input {...props} className={`${inputCls} h-11`} />
    </label>
  );
}

function Message({ state }: { state: AuthState }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-lg bg-[#f6e3e5] px-3 py-2 text-[0.85rem] text-[#8a2333]">
        {state.error}
      </p>
    );
  if (state?.message)
    return (
      <div role="status" className="rounded-lg bg-[#e6f0ea] px-3 py-2 text-[0.85rem] text-[#2c6447]">
        {state.message}
        {state.link ? (
          <p className="mt-2 break-all text-[0.75rem]">
            Local development only — the email was captured, not sent:{" "}
            <a className="underline" href={state.link}>
              open reset link
            </a>
          </p>
        ) : null}
      </div>
    );
  return null;
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" name="email" type="email" autoComplete="username" required defaultValue={state?.email} key={state?.email} autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <Message state={state} />
      <Submit>Sign in</Submit>
      <p className="text-center text-[0.82rem]">
        <Link href="/admin/forgot" className={btn.link}>
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

export function VerifyForm() {
  const [state, action] = useActionState(verifyMfa, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus />
      <Message state={state} />
      <Submit>Verify</Submit>
    </form>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState(requestReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Staff email" name="email" type="email" required autoFocus />
      <Message state={state} />
      <Submit>Send reset link</Submit>
      <p className="text-center text-[0.82rem]">
        <Link href="/admin/login" className={btn.link}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetForm({ token, invite }: { token: string; invite?: boolean }) {
  const [state, action] = useActionState(completeReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label={invite ? "Choose a password" : "New password"} name="password" type="password" autoComplete="new-password" minLength={12} required />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      <p className="text-[0.75rem] text-ink-soft">At least 12 characters. A short phrase works well.</p>
      <Message state={state} />
      <Submit>{invite ? "Set password" : "Reset password"}</Submit>
    </form>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupOwner, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Setup token (ADMIN_SETUP_TOKEN)" name="setupToken" type="password" required />
      <Field label="Your name" name="name" required />
      <Field label="Email" name="email" type="email" autoComplete="username" required />
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      <Message state={state} />
      <Submit>Create owner account</Submit>
    </form>
  );
}
