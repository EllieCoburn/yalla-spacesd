import { Pill } from "@/components/admin/ui";
import { PAYMENT_STATE, type PaymentState } from "@/lib/admin/queries/bookings";

export function PaymentPill({ state }: { state: PaymentState }) {
  const s = PAYMENT_STATE[state];
  return (
    <Pill tone={s.tone} icon={s.icon}>
      {s.label}
    </Pill>
  );
}

export function PaperworkPill({ state }: { state: "complete" | "issues" | null }) {
  if (!state) return <span className="text-ink-soft">—</span>;
  return state === "complete" ? (
    <Pill tone="positive" icon="check">
      Forms complete
    </Pill>
  ) : (
    <Pill tone="critical" icon="alert">
      Forms needed
    </Pill>
  );
}

/** Small uppercase caption used to label separate status dimensions. */
export function StatusLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[0.66rem] font-medium tracking-[0.08em] text-ink-soft uppercase">{children}</span>;
}
