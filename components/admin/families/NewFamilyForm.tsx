"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/admin/action";
import { btn, inputCls } from "@/components/admin/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className={btn.primary} disabled={pending}>
      {pending ? "Creating…" : "Create family"}
    </button>
  );
}

function F({ label, name, v, ...rest }: { label: string; name: string; v: Record<string, string> } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[0.8rem] font-medium text-ink">
        {label}
        {rest.required ? <span className="text-[#8a2333]"> *</span> : null}
      </span>
      <input name={name} defaultValue={v[name] ?? ""} key={v[name] ?? ""} className={inputCls} {...rest} />
    </label>
  );
}

export function NewFamilyForm({ action }: { action: (prev: ActionState, form: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, undefined);
  const v = state && !state.ok ? (state.values ?? {}) : {};
  const dupFamily = (state?.data as { familyId?: string } | undefined)?.familyId;
  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Guardian first name" name="firstName" v={v} required autoComplete="off" />
        <F label="Guardian last name" name="lastName" v={v} required autoComplete="off" />
        <F label="Email" name="email" type="email" v={v} required autoComplete="off" />
        <F label="Mobile" name="phone" type="tel" v={v} autoComplete="off" />
        <F label="Relationship to the children" name="relationship" v={v} placeholder="Parent" />
        <F label="Family name (shown in the directory)" name="name" v={v} placeholder="Defaults to “[Last name] family”" />
      </div>
      <label className="flex items-start gap-2.5 text-[0.85rem]">
        <input type="checkbox" name="marketingOptIn" defaultChecked={v.marketingOptIn === "on"} className="mt-0.5 h-4 w-4 rounded border-ink/30" />
        <span>
          Opted in to marketing emails
          <span className="block text-[0.75rem] text-ink-soft">Service messages (confirmations, receipts, reminders) are sent regardless.</span>
        </span>
      </label>
      <p className="rounded-lg bg-mist/50 px-3 py-2 text-[0.8rem] text-ink-soft">
        The first guardian becomes the primary contact with billing and sensitive-information access. Add more guardians on the family page — each gets their own login and their own access settings.
      </p>
      {state && !state.ok ? (
        <div role="alert" className="rounded-lg bg-[#f6e3e5] px-3 py-2 text-[0.85rem] text-[#8a2333] ring-1 ring-[#8a2333]/20 ring-inset">
          {state.error}
          {dupFamily ? (
            <>
              {" "}
              <Link href={`/admin/families/${dupFamily}`} className="font-medium underline">
                Open the existing family →
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
      <Submit />
    </form>
  );
}
