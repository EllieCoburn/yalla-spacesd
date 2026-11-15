"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/admin/action";

function Btn({ delta, label, disabled }: { delta: 1 | -1; label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="delta"
      value={delta}
      disabled={pending || disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/20 text-[0.9rem] leading-none transition-colors hover:border-ink disabled:opacity-30"
    >
      {delta > 0 ? "+" : "−"}
    </button>
  );
}

/** One Flex day and age group: how many spots are released, how many are booked, and +/−. */
export function FlexSpotCell({
  action,
  sessionId,
  released,
  booked,
  label,
  canEdit,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  sessionId: string;
  released: number;
  booked: number;
  label: string;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const open = Math.max(0, released - booked);
  return (
    <form action={formAction} className={`rounded-xl border p-2.5 text-[0.78rem] ${open > 0 ? "border-[#6065f2]/50 bg-[#6065f2]/[0.07]" : "border-ink/10 bg-ink/[0.03]"}`}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="flex items-center justify-between gap-2">
        <span>
          <span className={`block font-medium ${open > 0 ? "text-[#3d40b8]" : "text-ink-soft"}`}>{open > 0 ? `${open} open` : "Full"}</span>
          <span className="text-[0.7rem] text-ink-soft">
            {released} released{booked ? ` · ${booked} booked` : ""}
          </span>
        </span>
        {canEdit ? (
          <span className="flex gap-1">
            <Btn delta={-1} label={`Take back a spot, ${label}`} disabled={released <= booked} />
            <Btn delta={1} label={`Release a spot, ${label}`} />
          </span>
        ) : null}
      </div>
      {state && !state.ok ? <p className="mt-1 text-[0.7rem] text-[#8a2333]">{state.error}</p> : null}
    </form>
  );
}
