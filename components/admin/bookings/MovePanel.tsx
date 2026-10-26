"use client";

import { useActionState } from "react";
import { ActionForm, Checkbox } from "@/components/admin/forms";
import { btn, inputCls, Notice } from "@/components/admin/ui";
import type { ActionState } from "@/lib/admin/action";

type Target = { id: string; label: string; remaining: number };
type Preview = { targetSessionId: string; label: string; remaining: number; problems: string[]; current: number; next: number | null; difference: number; note: string };

const money = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;

/** Two-step move: preview the target (capacity, eligibility, money) and then confirm. */
export function MovePanel({
  itemId,
  targets,
  preview,
  move,
  showMoney,
}: {
  itemId: string;
  targets: Target[];
  preview: (prev: ActionState, form: FormData) => Promise<ActionState>;
  move: (prev: ActionState, form: FormData) => Promise<ActionState>;
  showMoney: boolean;
}) {
  const [state, previewAction, pending] = useActionState(preview, undefined);
  const p = state?.ok ? (state.data as Preview) : null;
  return (
    <div className="space-y-3">
      <form action={previewAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="itemId" value={itemId} />
        <label className="flex min-w-[15rem] flex-1 flex-col gap-1 text-[0.78rem] font-medium text-ink">
          Move to
          <select name="targetSessionId" required className={inputCls} defaultValue={p?.targetSessionId ?? ""}>
            <option value="" disabled>
              Choose a session…
            </option>
            {targets.map((t) => (
              <option key={t.id} value={t.id} disabled={t.remaining <= 0}>
                {t.label} — {t.remaining <= 0 ? "full" : `${t.remaining} left`}
              </option>
            ))}
          </select>
        </label>
        <button className={btn.secondary} disabled={pending}>
          {pending ? "Checking…" : "Preview move"}
        </button>
      </form>
      {state && !state.ok ? <Notice tone="critical">{state.error}</Notice> : null}
      {p ? (
        <div className="rounded-lg border border-ink/12 bg-mist/30 p-4 text-[0.85rem]">
          <p className="font-medium text-ink">{p.label}</p>
          {p.problems.length ? (
            <ul className="mt-2 list-disc pl-4 text-[#8a2333]">
              {p.problems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <>
              {showMoney ? (
                <p className="mt-1 text-ink-soft">
                  Current price {money(p.current)} → new price {p.next == null ? "not set" : money(p.next)}.
                </p>
              ) : null}
              <p className="mt-1 text-ink">{showMoney ? p.note : p.difference > 0 ? "The new session costs more; an invoice for the difference will be created." : "No new charge will be created."}</p>
              <div className="mt-3">
                <ActionForm action={move} submit={{ label: "Confirm move", pending: "Moving…" }}>
                  <input type="hidden" name="itemId" value={itemId} />
                  <input type="hidden" name="targetSessionId" value={p.targetSessionId} />
                  <Checkbox name="notify" label="Email the family about the change" defaultChecked />
                </ActionForm>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
