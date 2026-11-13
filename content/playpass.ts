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

export const PLAY_PASS_FAQ: { q: string; a: string[] }[] = [
  {
    q: "How does billing work?",
    a: [
      "Play Passes are billed monthly on the 1st, and your new balance is added as soon as that payment goes through.",
      "If you join partway through a month, your first payment and your first balance both cover just the days left in that month. For example, a Gather Play Pass started on November 16 is $90 that day with $100 to spend, then $180 with $200 to spend from December 1. You’ll see both amounts before you confirm.",
    ],
  },
  {
    q: "What can I use my balance on?",
    a: [
      "Eligible Yalla Happenings, which are marked as accepting Play Pass when you book. Some special programs, such as camps and select workshops, have their own pricing and aren’t included.",
      "Every experience keeps its published price, per child. Your balance is simply how you pay.",
    ],
  },
  {
    q: "How do I use my balance?",
    a: [
      "Book the way you always do. When you’re signed in, your balance is applied automatically at checkout. If it covers everything, there’s nothing more to pay; if it covers part, you pay the rest by card.",
      "Your balance is shared by your whole family, so it works for any of your children.",
    ],
  },
  {
    q: "Can I change or cancel my Play Pass?",
    a: [
      "Yes, anytime, from My Play Pass in the Family Portal. Changes to a different pass take effect from your next renewal on the 1st.",
      "If you stop renewing, your Play Pass stays active through the month you’ve paid for, and any balance you have stays in your wallet.",
    ],
  },
  {
    q: "What happens to balance I don’t use?",
    a: ["Unused balance carries into the next month. We’ll always tell you ahead of time before any change to how unused balance is handled."],
  },
  {
    q: "Do I need a Play Pass to book?",
    a: ["Not at all. Everyone books from the same calendar and can pay as they go. A Play Pass just gives you more to spend for the same experiences."],
  },
];

/**
 * The recurring-billing summary families agree to before paying (membership.TERMS_VERSION).
 * Plain statements of how the pass works; Yalla should review this wording before launch.
 */
export const billingTerms = (p: { name: string; price: string; allocation: string; today: string; firstBalance: string; renewal: string }) => [
  `Today you’ll pay ${p.today} and ${p.firstBalance} will be added to your Play Pass.`,
  `From ${p.renewal}, your ${p.name} Play Pass renews automatically on the 1st of every month: ${p.price} is charged to your saved card and ${p.allocation} is added to your balance.`,
  "You can change your pass or stop renewals anytime in the Family Portal. Changes apply from your next renewal; stopping renewals doesn’t remove balance you’ve already paid for.",
];
