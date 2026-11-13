"use client";

import { useActionState } from "react";
import { chooseOfferAction, type PortalState } from "@/app/(site)/portal/actions";

/** Two clear choices after Yalla cancels: credit plus a bonus, or a full refund. */
export function OfferChoice({ offerId, creditLabel, creditDetail, refundLabel, refundDetail }: { offerId: string; creditLabel: string; creditDetail: string; refundLabel: string; refundDetail: string }) {
  const [state, action, pending] = useActionState<PortalState, FormData>(chooseOfferAction, undefined);
  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="offerId" value={offerId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="submit"
          name="choice"
          value="credit"
          disabled={pending}
          className="border border-ink bg-ink p-5 text-left text-chalk transition-colors hover:bg-blue disabled:opacity-60"
        >
          <span className="block text-[1rem]">{creditLabel}</span>
          <span className="mt-1 block text-[0.82rem] text-chalk/80">{creditDetail}</span>
        </button>
        <button type="submit" name="choice" value="refund" disabled={pending} className="border border-ink/25 bg-chalk p-5 text-left transition-colors hover:border-ink disabled:opacity-60">
          <span className="block text-[1rem]">{refundLabel}</span>
          <span className="mt-1 block text-[0.82rem] text-ink-soft">{refundDetail}</span>
        </button>
      </div>
      {state?.error ? (
        <p role="alert" className="mt-3 text-[0.88rem] text-oxblood">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
