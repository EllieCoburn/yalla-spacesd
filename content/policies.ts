/**
 * Yalla's formal policies: the one place each policy's wording lives. FAQ answers and the
 * Policies & Terms page render these; nothing else should restate them.
 *
 * Only policies Yalla has approved belong here. Do not add or reword policy language without Yalla.
 */

export type Policy = {
  id: string;
  title: string;
  /** Approved: shown on the site. */
  approved: boolean;
  sections: { heading?: string; paragraphs: string[] }[];
};

export const POLICIES: Policy[] = [
  {
    id: "cancellation-refund",
    title: "Cancellation & refund policy",
    approved: true,
    sections: [
      {
        paragraphs: [
          "We understand that plans change! When you cancel a reservation or service, the amount paid will be returned to your family’s Yalla Wallet as a credit that can be applied toward future bookings and services for up to 24 months. Yalla does not issue cash refunds for any services.",
        ],
      },
      {
        heading: "Club Yalla Memberships",
        paragraphs: [
          "Club Yalla memberships require 30 days’ written notice to cancel. Notice can be submitted through your Family Portal or by email. Your membership will remain active throughout the 30-day notice period.",
        ],
      },
      {
        heading: "Play Pass Memberships",
        paragraphs: ["Play Pass memberships also require 30 days’ notice to cancel. Cancellations can be managed directly through the Yalla app."],
      },
      {
        heading: "Final Membership Payments",
        paragraphs: [
          "For both Club Yalla and Play Pass memberships, regular billing will continue throughout the 30-day notice period. If your cancellation takes effect partway through a month, a final prorated payment will be charged on the first of that month, covering only the days leading up to your membership’s cancellation date.",
        ],
      },
    ],
  },
];

export const policyById = (id: string) => POLICIES.find((p) => p.id === id && p.approved) ?? null;
export const policyHref = (id: string) => `/policies#${id}`;
