/**
 * Optional extras families can add to a session, keyed by program slug or, failing that, by
 * program kind. Camp Yalla (9:00am – 3:00pm) offers Early Bird before camp starts and a late stay
 * after it ends, per child, per day. Immersive Play Sessions offer coworking for the grown-up who
 * stays, charged once per family per session however many children come (perFamily).
 */
export type Addon = {
  key: string;
  label: string;
  time: string;
  priceCents: number;
  perFamily?: boolean;
  /** Minutes this extra adds after the session ends (for late fees). */
  extendsEndMinutes?: number;
  /** The child's day ends this many minutes after the session starts instead (a half day). */
  endsAfterStartMinutes?: number;
  /** A choice of day length rather than an extra: priced from the program's half-day rate, shown as Full day / Half day. */
  dayLength?: "half";
  /** Only for children at least this old (months) on the day. */
  minAgeMonths?: number;
  /** Offered only on days staff open seats for it (Yalla Flex Early Bird). */
  limitedSeats?: boolean;
  /** The question families see for a per-family extra (default "Staying?"). */
  prompt?: string;
};

export const ADDONS: Record<string, Addon[]> = {
  "immersive-play": [{ key: "cowork", label: "Coworking for you", time: "9:00am – 12:00pm", priceCents: 1500, perFamily: true }],
  // Yalla Flex: a released spot can be a full day (8:30am – 4:30pm) or a half day (8:30am – 12:00pm).
  drop_in: [
    { key: "half", label: "Half day", time: "8:30am – 12:00pm", priceCents: 0, endsAfterStartMinutes: 210, dayLength: "half" },
    { key: "early", label: "Early Bird", time: "8:00 – 8:30am", priceCents: 1600, minAgeMonths: 12, limitedSeats: true },
    // One grown-up per family coworks at no charge; each day, a second one is $25 (common areas).
    { key: "adult", label: "A second grown-up coworking", time: "Coworking common areas, for the day", priceCents: 2500, perFamily: true, prompt: "Bringing another grown-up?" },
  ],
  camp: [
    { key: "early", label: "Early Bird", time: "8:00 – 9:00am", priceCents: 2000 },
    { key: "late", label: "Late stay", time: "3:00 – 4:30pm", priceCents: 3000, extendsEndMinutes: 90 },
  ],
};

export const addonsFor = (kind: string, slug?: string | null): Addon[] => (slug ? ADDONS[slug] : undefined) ?? ADDONS[kind] ?? [];

/** Keep only add-ons the program offers, once each. */
export const validAddons = (kind: string, keys: string[] | undefined, slug?: string | null) =>
  [...new Set(keys ?? [])].filter((k) => addonsFor(kind, slug).some((a) => a.key === k));

/**
 * The extras' total for one session, given each child's chosen add-ons. Per-child extras are
 * charged for every child who has them; per-family extras once if any child has them.
 */
export const sessionAddonsCents = (kind: string, slug: string | null | undefined, perChild: string[][]) =>
  addonsFor(kind, slug).reduce((sum, a) => {
    const n = perChild.filter((keys) => keys.includes(a.key)).length;
    return sum + a.priceCents * (a.perFamily ? Math.min(n, 1) : n);
  }, 0);
