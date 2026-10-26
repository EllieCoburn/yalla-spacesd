"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/admin/action";
import { btn, inputCls } from "@/components/admin/ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={btn.primary} disabled={pending}>
      {pending ? "Working…" : label}
    </button>
  );
}

/** Invite form that can show the invitation link during local test-mode development. */
export function InviteForm({ action, roles }: { action: (p: ActionState, f: FormData) => Promise<ActionState>; roles: { key: string; name: string }[] }) {
  const [state, formAction] = useActionState(action, undefined);
  const v = state && !state.ok ? (state.values ?? {}) : {};
  const link = (state?.data as { link?: string } | undefined)?.link;
  return (
    <form action={formAction} className="space-y-3" key={state?.ok ? state.at : "form"}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="block text-[0.8rem] font-medium">Name</span>
          <input name="name" required defaultValue={v.name} className={inputCls} />
        </label>
        <label className="space-y-1.5">
          <span className="block text-[0.8rem] font-medium">Email</span>
          <input name="email" type="email" required defaultValue={v.email} className={inputCls} />
        </label>
        <label className="space-y-1.5">
          <span className="block text-[0.8rem] font-medium">Role</span>
          <select name="roleKey" defaultValue={v.roleKey ?? "educator"} className={inputCls}>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state ? (
        <div role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-[0.85rem] ${state.ok ? "bg-[#e6f0ea] text-[#2c6447]" : "bg-[#f6e3e5] text-[#8a2333]"}`}>
          {state.ok ? state.message : state.error}
          {link ? (
            <p className="mt-1 text-[0.75rem] break-all">
              Local development only — invitation link:{" "}
              <a className="underline" href={link}>
                {link}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
      <Submit label="Send invitation" />
    </form>
  );
}

export function SmallAction({ action, fields, label, variant = "secondary", confirmText }: { action: (p: ActionState, f: FormData) => Promise<ActionState>; fields: Record<string, string>; label: string; variant?: "secondary" | "danger" | "ghost"; confirmText?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  const link = (state?.data as { link?: string } | undefined)?.link;
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <Submit2 label={label} variant={variant} />
      {state ? <span className={`text-[0.75rem] ${state.ok ? "text-[#2c6447]" : "text-[#8a2333]"}`}>{state.ok ? state.message : state.error}</span> : null}
      {link ? (
        <a className="text-[0.72rem] break-all text-blue underline" href={link}>
          Invitation link (local only)
        </a>
      ) : null}
    </form>
  );
}

function Submit2({ label, variant }: { label: string; variant: "secondary" | "danger" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${btn[variant]} h-8 px-3 text-[0.8rem]`} disabled={pending}>
      {pending ? "…" : label}
    </button>
  );
}
