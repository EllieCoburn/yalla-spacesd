import type { PublicSession } from "@/lib/ops/public-booking";

export const usd = (c: number | null) => (c == null ? "Price on request" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0 })}`);

export function stateLabel(s: PublicSession): { text: string; tone: "ok" | "low" | "muted"; selectable: boolean } {
  const st = s.state;
  if (st.state === "available") return { text: st.remaining == null ? "Available" : `${st.remaining} spaces`, tone: "ok", selectable: true };
  if (st.state === "limited") return { text: st.showCount ? `Only ${st.remaining} left` : "Limited availability", tone: "low", selectable: true };
  if (st.state === "full") return { text: "Fully booked", tone: "muted", selectable: false };
  if (st.state === "closed") return { text: st.reason, tone: "muted", selectable: false };
  return { text: "Not offered", tone: "muted", selectable: false };
}
