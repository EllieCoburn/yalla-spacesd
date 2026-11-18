/**
 * Promo codes at checkout: the rules shared by the booking page (an estimate) and the invoice
 * (the real amount). A code comes from Admin → Billing → Discounts.
 *
 * - A percent code takes that share off each matching session price, after any sibling discount.
 * - A fixed code takes its amount off once per booking, never more than the matching sessions cost.
 * - Extras (Early Bird, late stay, coworking) and After Hours family-rate evenings are not discounted.
 */

export type PromoRule = {
  code: string;
  name: string;
  kind: "percent" | "fixed";
  /** Percent (1–100) or cents. */
  value: number;
  programId: string | null;
  programKind: string | null;
};

/** Codes are stored upper-case; families can type them any way. */
export function normalizeCode(raw: string | null | undefined) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function promoMatches(rule: Pick<PromoRule, "programId" | "programKind">, program: { id: string; kind: string }) {
  if (rule.programId) return rule.programId === program.id;
  if (rule.programKind) return rule.programKind === program.kind;
  return true;
}

/** What a code takes off, given the matching session prices (each already net of sibling discount). */
export function promoSavings(rule: Pick<PromoRule, "kind" | "value">, prices: number[]): number[] {
  if (rule.kind === "percent") return prices.map((p) => Math.round((Math.max(0, p) * rule.value) / 100));
  // Fixed: spread across the sessions in order until it runs out.
  let left = rule.value;
  return prices.map((p) => {
    const off = Math.min(Math.max(0, p), left);
    left -= off;
    return off;
  });
}

export function promoLabel(rule: Pick<PromoRule, "kind" | "value" | "code">) {
  return `${rule.code} · ${rule.kind === "percent" ? `${rule.value}% off` : `$${(rule.value / 100).toFixed(2).replace(/\.00$/, "")} off`}`;
}
