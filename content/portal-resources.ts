/**
 * The Family Portal's resource hub: guides and policies families look up now and then. They sit
 * below the main portal sections (and on /portal/resources), not in the portal's top navigation.
 *
 * To add a resource, add an entry here. `href` can be a portal page, a public page or a file.
 */
export type PortalResource = { key: string; eyebrow: string; title: string; description: string; href: string; cta: string };

export const PORTAL_RESOURCES: PortalResource[] = [
  {
    key: "parking",
    eyebrow: "Getting here",
    title: "Parking guide",
    description: "Free park-and-walk lots, meters, discounted monthly spots and our driveway policy.",
    href: "/parking",
    cta: "Read the guide",
  },
  {
    key: "illness",
    eyebrow: "Health & wellness",
    title: "Illness policy",
    description: "When to keep your child home, when they can return, and our vomiting policy.",
    href: "/portal/illness-policy",
    cta: "Read the policy",
  },
  {
    key: "policies",
    eyebrow: "Policies",
    title: "Policies & Terms",
    description: "Reservations, memberships, payments, attendance and community life.",
    href: "/policies",
    cta: "Read the policies",
  },
  {
    key: "faq",
    eyebrow: "Here to help",
    title: "FAQ",
    description: "Good questions, good answers about joining, booking and making the most of Yalla.",
    href: "/faq",
    cta: "Browse the FAQ",
  },
];
