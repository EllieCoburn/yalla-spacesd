import { fmtDate, todayLA } from "@/lib/time";

/** How long a signed agreement covers a family, said plainly (and flagged when it's running out). */
export function validity(input: { expiresOn: string | null; frequency: string; signed: boolean }, today = todayLA()): { text: string; tone: "ok" | "soon" | "expired" | "muted" } {
  if (!input.signed) return { text: "Not signed", tone: "expired" };
  if (input.frequency === "per_booking") return { text: "Covers this booking", tone: "ok" };
  if (!input.expiresOn) return { text: "Doesn’t expire", tone: "muted" };
  const days = Math.round((Date.parse(`${input.expiresOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: `Expired ${fmtDate(input.expiresOn, "MMM d, yyyy")}`, tone: "expired" };
  if (days <= 30) return { text: `Expires ${fmtDate(input.expiresOn, "MMM d, yyyy")} · in ${days} ${days === 1 ? "day" : "days"}`, tone: "soon" };
  return { text: `Valid until ${fmtDate(input.expiresOn, "MMM d, yyyy")}`, tone: "ok" };
}

export const VALIDITY_CLASS = { ok: "text-[#2f6b3f]", soon: "text-[#9a5b00] font-medium", expired: "text-oxblood font-medium", muted: "text-ink-soft" } as const;
