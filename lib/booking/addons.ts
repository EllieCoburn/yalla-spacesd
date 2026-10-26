/**
 * Optional extras families can add to a day, per child. Camp Yalla offers Early Bird drop-in
 * before camp starts and a late stay after it ends. Prices are per child, per day.
 */
export type Addon = { key: string; label: string; time: string; priceCents: number };

export const ADDONS: Record<string, Addon[]> = {
  camp: [
    { key: "early", label: "Early Bird", time: "8:00 – 9:00am", priceCents: 2000 },
    { key: "late", label: "Late stay", time: "until 4:30pm", priceCents: 3000 },
  ],
};

export const addonsFor = (kind: string): Addon[] => ADDONS[kind] ?? [];

/** Keep only add-ons the program offers, once each. */
export const validAddons = (kind: string, keys: string[] | undefined) => [...new Set(keys ?? [])].filter((k) => addonsFor(kind).some((a) => a.key === k));

export const addonsCents = (kind: string, keys: string[]) => addonsFor(kind).filter((a) => keys.includes(a.key)).reduce((sum, a) => sum + a.priceCents, 0);
