/**
 * Yalla Play Passes: page copy. Prices and monthly allocations come from the database (Admin →
 * Play Passes); the defaults below are only used when no database is connected.
 */
import type { MarkName } from "@/components/brand/marks";

export const PLAN_DEFAULTS = [
  { tier: "play", name: "Play", priceCents: 12000, allocationCents: 13500, minExperiences: 2 },
  { tier: "gather", name: "Gather", priceCents: 18000, allocationCents: 20000, minExperiences: 3 },
  { tier: "belong", name: "Belong", priceCents: 24000, allocationCents: 27000, minExperiences: 4 },
];

/** A motif and a soft background for each card; all three are meant to feel equally welcoming. */
export const PLAN_LOOK: Record<string, { mark: MarkName; bg: string }> = {
  play: { mark: "sun", bg: "bg-mist" },
  gather: { mark: "arch", bg: "bg-sand" },
  belong: { mark: "palm", bg: "bg-paper" },
};

export const WALLET_EXPLAINER =
  "Your Play Pass balance works like a spending wallet. Use it toward eligible Yalla experiences, share it between your children, and book whatever fits your family’s schedule.";

/**
 * The recurring-billing summary families agree to before paying (membership.TERMS_VERSION).
 * Plain statements of how the pass works; Yalla should review this wording before launch.
 */
export const billingTerms = (p: { name: string; price: string; allocation: string; today: string; firstBalance: string; renewal: string }) => [
  `Today you’ll pay ${p.today} and ${p.firstBalance} will be added to your Play Pass.`,
  `From ${p.renewal}, your ${p.name} Play Pass renews automatically on the 1st of every month: ${p.price} is charged to your saved card and ${p.allocation} is added to your balance.`,
  "You can change your pass or stop renewals anytime in the Family Portal. Changes apply from your next renewal; stopping renewals doesn’t remove balance you’ve already paid for.",
];
