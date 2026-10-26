"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { blackoutAction } from "@/app/admin/(app)/schedule/actions";
import { btn, inputCls } from "@/components/admin/ui";

type Affected = { id: string; program: string; localDate: string; booked: number };

function Submit({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={danger ? btn.danger : btn.primary} disabled={pending}>
      {pending ? "Working…" : label}
    </button>
  );
}

/** Two-step closure: preview the sessions (and booked families) it affects, then confirm. */
export function BlackoutForm({ programs, locations }: { programs: { id: string; name: string }[]; locations: { id: string; name: string }[] }) {
  const [state, action] = useActionState(blackoutAction, undefined);
  const [formKey, setFormKey] = useState(0);
  const data = state && !state.ok ? (state.data as { affected?: Affected[]; previewKey?: string } | undefined) : undefined;
  const preview = data?.affected;
  const v = (k: string) => (state && !state.ok ? (state.values?.[k] ?? "") : "");
  useEffect(() => {
    if (state?.ok) setFormKey((k) => k + 1);
  }, [state?.at, state?.ok]);
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <form action={action} key={formKey} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-[0.8rem] font-medium text-ink">
          <span className="block">
            First closed date <span className="text-[#8a2333]">*</span>
          </span>
          <input type="date" name="startsOn" required defaultValue={v("startsOn")} key={`s${v("startsOn")}`} className={inputCls} />
        </label>
        <label className="space-y-1.5 text-[0.8rem] font-medium text-ink">
          <span className="block">Last closed date</span>
          <input type="date" name="endsOn" defaultValue={v("endsOn")} key={`e${v("endsOn")}`} className={inputCls} />
        </label>
      </div>
      <label className="block space-y-1.5 text-[0.8rem] font-medium text-ink">
        <span className="block">
          Reason <span className="text-[#8a2333]">*</span>
        </span>
        <input name="reason" required placeholder="e.g. Thanksgiving" defaultValue={v("reason")} key={`r${v("reason")}`} className={inputCls} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-[0.8rem] font-medium text-ink">
          <span className="block">Applies to</span>
          <select name="programId" defaultValue={v("programId")} key={`p${v("programId")}`} className={inputCls}>
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {locations.length > 1 ? (
          <label className="space-y-1.5 text-[0.8rem] font-medium text-ink">
            <span className="block">Location</span>
            <select name="locationId" defaultValue={v("locationId")} className={inputCls}>
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {state && !state.ok ? (
        <div role="alert" className="rounded-lg bg-[#f8eedd] px-3 py-2 text-[0.85rem] text-[#8a5212] ring-1 ring-[#8a5212]/20 ring-inset">
          {state.error}
        </div>
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="rounded-lg bg-[#e6f0ea] px-3 py-2 text-[0.85rem] text-[#2c6447]">
          {state.message}
        </p>
      ) : null}

      {preview ? (
        <div className="rounded-lg border border-ink/12 bg-white">
          <p className="border-b border-ink/8 px-4 py-2 text-[0.78rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Sessions that will close</p>
          <ul className="max-h-64 divide-y divide-ink/6 overflow-y-auto">
            {preview.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[0.85rem]">
                <a href={`/admin/sessions/${a.id}`} className="text-ink hover:text-blue">
                  {fmt(a.localDate)} · {a.program}
                </a>
                {a.booked > 0 ? <span className="text-[#8a2333]">⚠ {a.booked} booked</span> : <span className="text-ink-soft">No bookings</span>}
              </li>
            ))}
          </ul>
          <p className="border-t border-ink/8 px-4 py-2 text-[0.78rem] text-ink-soft">
            Bookings, charges and notifications are not changed automatically. Booked families appear for follow-up. If you change the dates or program, you’ll see a fresh preview.
          </p>
          <input type="hidden" name="confirmAffected" value="on" />
          <input type="hidden" name="previewKey" value={data?.previewKey ?? ""} />
        </div>
      ) : null}

      <Submit label={preview ? "Confirm closure" : "Preview closure"} danger={!!preview} />
    </form>
  );
}
