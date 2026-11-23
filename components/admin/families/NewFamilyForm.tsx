"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FLEX_GROUPS } from "@/lib/booking/flex";
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

type ChildRow = { firstName: string; lastName: string; birthDate: string; flexHold: string };

export function NewFamilyForm({ action }: { action: (prev: ActionState, form: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, undefined);
  const v = state && !state.ok ? (state.values ?? {}) : {};
  const data = state?.data as { familyId?: string; children?: ChildRow[] } | undefined;
  const dupFamily = data?.familyId;
  // Children are kept across a failed submit (the server hands back what was typed).
  const kept = state && !state.ok ? data?.children : undefined;
  const [rows, setRows] = useState(1);
  const count = Math.max(rows, kept?.length ?? 0);
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
      {/* Children, with an optional Yalla Flex cohort hold, added in the same step. */}
      <fieldset className="space-y-3 rounded-xl border border-ink/10 p-4">
        <legend className="px-1 text-[0.85rem] font-medium text-ink">Children</legend>
        <p className="text-[0.78rem] text-ink-soft">
          Optional. Leave a row empty to skip it. Choose a Yalla Flex cohort hold for a longtime drop-in child who should stay with a younger cohort, whatever their age, until you release them.
        </p>
        {Array.from({ length: count }, (_, i) => {
          const k = kept?.[i];
          const kk = `${state?.at ?? 0}-${i}`;
          return (
            <div key={i} className="grid gap-3 rounded-lg bg-mist/30 p-3 sm:grid-cols-[1fr_1fr_10rem_1.2fr]">
              <label className="block space-y-1">
                <span className="text-[0.75rem] font-medium text-ink">First name</span>
                <input name="childFirst" defaultValue={k?.firstName ?? ""} key={`f${kk}`} className={inputCls} autoComplete="off" />
              </label>
              <label className="block space-y-1">
                <span className="text-[0.75rem] font-medium text-ink">Last name</span>
                <input name="childLast" defaultValue={k?.lastName ?? ""} key={`l${kk}`} placeholder="Same as guardian" className={inputCls} autoComplete="off" />
              </label>
              <label className="block space-y-1">
                <span className="text-[0.75rem] font-medium text-ink">Date of birth</span>
                <input name="childBirth" type="date" defaultValue={k?.birthDate ?? ""} key={`b${kk}`} className={inputCls} />
              </label>
              <label className="block space-y-1">
                <span className="text-[0.75rem] font-medium text-ink">Yalla Flex cohort</span>
                <select name="childHold" defaultValue={k?.flexHold ?? ""} key={`h${kk}`} className={inputCls}>
                  <option value="">Books by age</option>
                  {FLEX_GROUPS.map((g) => (
                    <option key={g.key} value={g.key}>
                      Hold in {g.cohort}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
        <button type="button" onClick={() => setRows(count + 1)} className="text-[0.82rem] text-blue hover:underline">
          + Add another child
        </button>
      </fieldset>

      <label className="flex items-start gap-2.5 text-[0.85rem]">
        <input type="checkbox" name="marketingOptIn" defaultChecked={v.marketingOptIn === "on"} className="mt-0.5 h-4 w-4 rounded border-ink/30" />
        <span>
          Opted in to marketing emails
          <span className="block text-[0.75rem] text-ink-soft">Service messages (confirmations, receipts, reminders) are sent regardless.</span>
        </span>
      </label>
      <label className="flex items-start gap-2.5 text-[0.85rem]">
        <input type="checkbox" name="invite" defaultChecked={v.invite === "on"} className="mt-0.5 h-4 w-4 rounded border-ink/30" />
        <span>
          Email them an invitation to the Family Portal now
          <span className="block text-[0.75rem] text-ink-soft">
            Sent after the children above are saved, so it tells them about any Flex cohort hold. Otherwise they’re invited when you confirm a booking for them, or anytime from their family page.
          </span>
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
