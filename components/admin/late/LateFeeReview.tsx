/** One late sign-out: flagged ones can be approved (invoiced, family emailed) or dismissed; charged ones waived. */
import type { ReactNode } from "react";
import { ActionForm, MoneyField, TextField } from "@/components/admin/forms";
import { Pill } from "@/components/admin/ui";
import { approveLateFeeAction, waiveLateFeeAction } from "@/app/admin/(app)/roster/actions";

type Fee = { id: string; status: string; minutesLate: number; amountCents: number; waivedBy: string | null; waivedReason: string | null };

export function LateFeeReview({ fee, who, canManage, showMoney }: { fee: Fee; who: ReactNode; canManage: boolean; showMoney: boolean }) {
  const money = `$${(fee.amountCents / 100).toFixed(2)}`;
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[0.88rem]">
        <span className="text-ink">{who}</span>
        <span className="text-ink-soft">
          · signed out {fee.minutesLate} minutes late{showMoney ? (fee.status === "flagged" ? ` · possible fee ${money}` : ` · ${money}`) : ""}
        </span>
        {fee.status === "flagged" ? (
          <Pill tone="warning">Needs review · not charged</Pill>
        ) : fee.status === "charged" ? (
          <Pill tone="critical">Charged</Pill>
        ) : (
          <Pill tone="muted">{fee.waivedReason ? `No fee · ${fee.waivedReason}` : "No fee"}</Pill>
        )}
      </div>
      {canManage && fee.status === "flagged" ? (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <ActionForm
            action={approveLateFeeAction}
            className="flex items-end gap-2"
            submit={{ label: "Charge the family", variant: "secondary" }}
            confirm={{ title: "Charge this late fee?", body: "It’s added to the family’s account and they’re emailed about it.", confirmLabel: "Charge" }}
          >
            <input type="hidden" name="feeId" value={fee.id} />
            <MoneyField name="amount" label="Amount" defaultValue={fee.amountCents} className="w-28" />
          </ActionForm>
          <ActionForm action={waiveLateFeeAction} className="flex items-end gap-2" submit={{ label: "Dismiss", variant: "ghost" }}>
            <input type="hidden" name="feeId" value={fee.id} />
            <TextField name="reason" label="Why no fee" required placeholder="Agreed extension, forgot to check out…" className="w-64" />
          </ActionForm>
        </div>
      ) : null}
      {canManage && fee.status === "charged" ? (
        <ActionForm action={waiveLateFeeAction} className="flex items-end gap-2" submit={{ label: "Waive", variant: "ghost" }}>
          <input type="hidden" name="feeId" value={fee.id} />
          <TextField name="reason" label="Reason" required className="w-64" />
        </ActionForm>
      ) : null}
    </div>
  );
}
