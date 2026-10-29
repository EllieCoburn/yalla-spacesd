/**
 * Book a Space settings: house hours, what "half day", "full day" and "week" mean, the
 * complimentary-time policy, and cancellation rules. Stored in the settings table so staff can
 * change them in Admin → Workspaces → Setup without a code change.
 *
 * Every default here that is a business decision Yalla hasn't confirmed yet is listed in
 * PROVISIONAL, so the admin screen can flag it.
 */
import { eq } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export type BookingType = "complimentary" | "half_day" | "full_day" | "week" | "hourly";
export type PaidBookingType = Exclude<BookingType, "complimentary">;
export type Category = "private_office" | "phone_booth" | "private_desk";

export const CATEGORY_LABEL: Record<Category, string> = { private_office: "Private Office", phone_booth: "Phone Booth", private_desk: "Private Desk" };
export const CATEGORY_PLURAL: Record<Category, string> = { private_office: "Private Offices", phone_booth: "Phone Booth", private_desk: "Private Desks" };
export const BOOKING_TYPE_LABEL: Record<BookingType, string> = { complimentary: "Complimentary", half_day: "Half day", full_day: "Full day", week: "Week", hourly: "By the hour" };
export const RATE_UNIT: Record<PaidBookingType, string> = { half_day: "half-day", full_day: "day", week: "week", hourly: "hour" };

export type Window = { start: string; end: string };

export type SpaceConfig = {
  /** House opening hours by weekday (0 = Sunday). A missing weekday is closed. */
  hours: Record<string, [string, string]>;
  /** Start times line up to this many minutes. */
  slotMinutes: number;
  halfDay: { morning: Window | null; afternoon: Window | null };
  fullDay: Window;
  /** calendar = Monday to Friday of the chosen week; rolling = this many operating days from the chosen date. */
  week: { mode: "calendar" | "rolling"; days: number };
  complimentary: {
    dailyMinutes: number;
    /** true = one daily allowance across every complimentary workspace; false = a separate allowance per workspace. */
    shared: boolean;
    /** Who gets it without a staff exception. */
    eligibility: "active_membership" | "all_families" | "manual";
    durations: number[];
  };
  hourly: { durations: number[] };
  cancellation: {
    /** Complimentary reservations can be cancelled or moved until this many minutes before they start. */
    complimentaryCutoffMinutes: number;
    /** contact = families ask Yalla; cancel = families can cancel online and Yalla decides any refund or credit. */
    paidFamilyCancel: "contact" | "cancel";
    paidCutoffHours: number;
    /** What staff are prompted to do when a paid reservation is cancelled. Nothing is refunded automatically. */
    paidRefund: "staff_decides" | "credit" | "none";
  };
};

export const DEFAULT_SPACE_CONFIG: SpaceConfig = {
  hours: { "1": ["08:30", "16:30"], "2": ["08:30", "16:30"], "3": ["08:30", "16:30"], "4": ["08:30", "16:30"], "5": ["08:30", "16:30"] },
  slotMinutes: 15,
  // Matches Yalla's existing half-day definition (8:30am – 12:00pm). No afternoon half day until Yalla sets one.
  halfDay: { morning: { start: "08:30", end: "12:00" }, afternoon: null },
  fullDay: { start: "08:30", end: "16:30" },
  week: { mode: "calendar", days: 5 },
  complimentary: { dailyMinutes: 60, shared: true, eligibility: "active_membership", durations: [15, 30, 45, 60] },
  hourly: { durations: [30, 60, 90, 120] },
  cancellation: { complimentaryCutoffMinutes: 0, paidFamilyCancel: "contact", paidCutoffHours: 24, paidRefund: "staff_decides" },
};

/** Defaults that are placeholders until Yalla confirms them (shown as "needs your decision"). */
export const PROVISIONAL: { key: string; label: string }[] = [
  { key: "halfDay", label: "Half-day times: morning is 8:30am – 12:00pm (Yalla’s existing half day); no afternoon half day is offered until you set one." },
  { key: "week", label: "A week is Monday to Friday of the chosen week. Weeks that include a closure can’t be booked online." },
  { key: "eligibility", label: "Complimentary time goes to families with an active Club Yalla membership on that day." },
  { key: "cancellation", label: "Complimentary reservations can be cancelled or moved until they start. Paid reservations are changed or cancelled by contacting Yalla; staff decide any refund or credit." },
];

const KEY = "spaces.config";
const DECIDED_KEY = "spaces.decided";

function merge(stored: Partial<SpaceConfig> | null | undefined): SpaceConfig {
  const d = DEFAULT_SPACE_CONFIG;
  const s = stored ?? {};
  return {
    ...d,
    ...s,
    halfDay: { ...d.halfDay, ...s.halfDay },
    fullDay: { ...d.fullDay, ...s.fullDay },
    week: { ...d.week, ...s.week },
    complimentary: { ...d.complimentary, ...s.complimentary },
    hourly: { ...d.hourly, ...s.hourly },
    cancellation: { ...d.cancellation, ...s.cancellation },
    hours: s.hours ?? d.hours,
  };
}

export async function getSpaceConfig(db: Executor): Promise<SpaceConfig> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  return merge(row?.value as Partial<SpaceConfig> | undefined);
}

/** Whether Yalla has saved the settings at least once (until then the defaults are provisional). */
export async function spaceConfigDecided(db: Executor): Promise<boolean> {
  const [row] = await db.select().from(settings).where(eq(settings.key, DECIDED_KEY));
  return row?.value === true;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function checkWindow(w: Window | null, label: string) {
  if (!w) return;
  if (!HHMM.test(w.start) || !HHMM.test(w.end) || toMinutes(w.end) <= toMinutes(w.start)) throw new OpsError("invalid", `${label} needs a start time before its end time.`);
}

export function validateSpaceConfig(c: SpaceConfig) {
  for (const [day, [open, close]] of Object.entries(c.hours)) {
    if (!/^[0-6]$/.test(day)) throw new OpsError("invalid", "Opening hours use weekdays 0–6.");
    checkWindow({ start: open, end: close }, "Opening hours");
  }
  checkWindow(c.halfDay.morning, "The morning half day");
  checkWindow(c.halfDay.afternoon, "The afternoon half day");
  checkWindow(c.fullDay, "The full day");
  if (![5, 10, 15, 30, 60].includes(c.slotMinutes)) throw new OpsError("invalid", "Start times can line up to 5, 10, 15, 30 or 60 minutes.");
  if (c.week.days < 1 || c.week.days > 7) throw new OpsError("invalid", "A week covers 1 to 7 operating days.");
  if (c.complimentary.dailyMinutes < 0 || c.complimentary.dailyMinutes > 480) throw new OpsError("invalid", "Daily complimentary minutes must be between 0 and 480.");
  if (!c.complimentary.durations.length || c.complimentary.durations.some((m) => m <= 0 || m % 5 !== 0)) throw new OpsError("invalid", "Complimentary durations must be positive multiples of 5 minutes.");
  if (c.hourly.durations.some((m) => m <= 0 || m % 5 !== 0)) throw new OpsError("invalid", "Hourly durations must be positive multiples of 5 minutes.");
  if (c.cancellation.complimentaryCutoffMinutes < 0 || c.cancellation.paidCutoffHours < 0) throw new OpsError("invalid", "Cancellation cutoffs can’t be negative.");
}

export async function saveSpaceConfig(db: Executor, actor: Actor, next: SpaceConfig) {
  validateSpaceConfig(next);
  const before = await getSpaceConfig(db);
  await db
    .insert(settings)
    .values({ key: KEY, value: next, updatedBy: actor.name })
    .onConflictDoUpdate({ target: settings.key, set: { value: next, updatedBy: actor.name, updatedAt: new Date() } });
  await db
    .insert(settings)
    .values({ key: DECIDED_KEY, value: true, updatedBy: actor.name })
    .onConflictDoUpdate({ target: settings.key, set: { value: true, updatedBy: actor.name, updatedAt: new Date() } });
  await audit(db, actor, { action: "spaces.config_update", entityType: "settings", entityId: KEY, summary: "Updated Book a Space settings", changes: { before, after: next } });
}
