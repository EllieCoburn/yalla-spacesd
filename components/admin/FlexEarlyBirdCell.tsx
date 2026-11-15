"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/admin/action";

function Op({ op, label, children, disabled }: { op: "none" | "add" | "remove"; label: string; children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="op"
      value={op}
      aria-label={label}
      disabled={pending || disabled}
      className={`flex h-7 items-center justify-center rounded-full border border-ink/20 text-[0.78rem] leading-none transition-colors hover:border-ink disabled:opacity-30 ${op === "none" ? "px-2.5" : "w-7 text-[0.9rem]"}`}
    >
      {children}
    </button>
  );
}

/**
 * Early Bird (8:00–8:30am) for one Flex day. Staff answer it whenever they open spots: "None", or
 * how many seats. Days with open Flex spots but no answer are highlighted as a prompt.
 */
export function FlexEarlyBirdCell({
  action,
  date,
  seats,
  booked,
  needsAnswer,
  label,
  canEdit,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  date: string;
  seats: number | null;
  booked: number;
  needsAnswer: boolean;
  label: string;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const tone = seats == null ? (needsAnswer ? "border-[#c58a1d]/60 bg-[#f6e7c8]/60" : "border-ink/10 bg-ink/[0.03]") : seats > booked ? "border-[#6065f2]/50 bg-[#6065f2]/[0.07]" : "border-ink/10 bg-ink/[0.03]";
  return (
    <form action={formAction} className={`rounded-xl border p-2.5 text-[0.78rem] ${tone}`}>
      <input type="hidden" name="date" value={date} />
      <div className="flex items-center justify-between gap-2">
        <span>
          <span className="block font-medium">
            {seats == null ? (needsAnswer ? "Early Bird?" : "Not set") : seats === 0 ? "No Early Bird" : `${seats - booked > 0 ? `${seats - booked} open` : "Full"}`}
          </span>
          <span className="text-[0.7rem] text-ink-soft">
            {seats == null ? (needsAnswer ? "Set seats or None" : "None until set") : seats ? `${seats} seat${seats === 1 ? "" : "s"}${booked ? ` · ${booked} booked` : ""}` : "8:00–8:30am"}
          </span>
        </span>
        {canEdit ? (
          <span className="flex gap-1">
            {seats == null ? (
              <Op op="none" label={`No Early Bird, ${label}`}>
                None
              </Op>
            ) : (
              <Op op="remove" label={`One fewer Early Bird seat, ${label}`} disabled={seats <= booked || seats === 0}>
                −
              </Op>
            )}
            <Op op="add" label={`One more Early Bird seat, ${label}`}>
              +
            </Op>
          </span>
        ) : null}
      </div>
      {state && !state.ok ? <p className="mt-1 text-[0.7rem] text-[#8a2333]">{state.error}</p> : null}
    </form>
  );
}
