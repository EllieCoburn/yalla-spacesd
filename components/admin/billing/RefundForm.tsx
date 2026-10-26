"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { refundAction } from "@/app/admin/(app)/billing/actions";
import { btn, inputCls } from "@/components/admin/ui";

function Submit({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={danger ? btn.danger : btn.primary} disabled={pending}>
      {pending ? "Processing…" : label}
    </button>
  );
}

/**
 * Refunds need a confirmation step and, after a failure, a fresh idempotency key so a retry is a
 * new attempt (the failed attempt stays in the history).
 */
export function RefundForm({ paymentId, maxCents, label }: { paymentId: string; maxCents: number; label: string }) {
  const [state, action] = useActionState(refundAction, undefined);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [confirming, setConfirming] = useState(false);
  const [amount, setAmount] = useState((maxCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [reduce, setReduce] = useState(true);
  const lastAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state?.at || state.at === lastAt.current) return;
    lastAt.current = state.at;
    setConfirming(false);
    setKey(crypto.randomUUID());
  }, [state]);

  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        if (!confirming) {
          e.preventDefault();
          setConfirming(true);
        }
      }}
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <label className="space-y-1.5">
          <span className="block text-[0.8rem] font-medium">Amount</span>
          <span className="relative block">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft">$</span>
            <input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} pl-7 tabular-nums`} required />
          </span>
        </label>
        <label className="space-y-1.5">
          <span className="block text-[0.8rem] font-medium">Reason</span>
          <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)} required className={inputCls} placeholder="e.g. Session cancelled by Yalla" />
        </label>
      </div>
      <label className="flex items-start gap-2 text-[0.85rem]">
        <input type="checkbox" name="reduceAmountOwed" checked={reduce} onChange={(e) => setReduce(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink/30" />
        <span>
          Also reduce what the family owes by this amount
          <span className="block text-[0.75rem] text-ink-soft">Leave on for cancellations. Turn off if the family still owes the full amount (e.g. refunding an overpayment is handled separately).</span>
        </span>
      </label>
      {state && !state.ok ? (
        <p role="alert" className="rounded-lg bg-[#f6e3e5] px-3 py-2 text-[0.85rem] text-[#8a2333]">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="rounded-lg bg-[#e6f0ea] px-3 py-2 text-[0.85rem] text-[#2c6447]">
          {state.message}
        </p>
      ) : null}
      {confirming ? (
        <div role="alertdialog" aria-label="Confirm refund" className="rounded-lg border border-[#8a2333]/30 bg-[#fbf3f4] p-3">
          <p className="text-[0.88rem] font-semibold text-ink">
            Refund ${amount} to the family’s {label}?
          </p>
          <p className="mt-1 text-[0.8rem] text-ink-soft">This sends money back through the payment provider and can’t be undone.{reduce ? " The invoice will be adjusted by the same amount." : ""}</p>
          <div className="mt-3 flex gap-2">
            <Submit label="Confirm refund" danger />
            <button type="button" className={btn.ghost} onClick={() => setConfirming(false)}>
              Go back
            </button>
          </div>
        </div>
      ) : (
        <button className={btn.secondary}>Refund…</button>
      )}
    </form>
  );
}
