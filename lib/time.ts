/**
 * Operating-time helpers. Yalla runs on America/Los_Angeles; all instants are stored in UTC and
 * wall-clock times are converted with the IANA zone so daylight saving time is handled correctly.
 */
import { TZDate, tz } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export const YALLA_TZ = "America/Los_Angeles";
export const inLA = tz(YALLA_TZ);

/** "2026-11-02" + "09:00" (LA wall time) → UTC Date. */
export function zonedDateTime(localDate: string, hhmm: string, zone = YALLA_TZ): Date {
  const [y, m, d] = localDate.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, zone).getTime());
}

/** Today's date in Los Angeles as YYYY-MM-DD. */
export function todayLA(now = new Date()): string {
  return format(now, "yyyy-MM-dd", { in: inLA });
}

export function localDateOf(instant: Date): string {
  return format(instant, "yyyy-MM-dd", { in: inLA });
}

export function fmtTime(instant: Date | string): string {
  return format(typeof instant === "string" ? new Date(instant) : instant, "h:mmaaa", { in: inLA });
}

export function fmtDateTime(instant: Date | string): string {
  return format(typeof instant === "string" ? new Date(instant) : instant, "EEE d MMM yyyy, h:mmaaa", { in: inLA });
}

export function fmtDate(localDate: string, pattern = "EEE d MMM yyyy"): string {
  return format(parseISO(localDate), pattern);
}

export function weekdayOf(localDate: string): number {
  return parseISO(localDate).getDay();
}

export function addDaysISO(localDate: string, n: number): string {
  return format(addDays(parseISO(localDate), n), "yyyy-MM-dd");
}

export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

/** Every local date from start to end inclusive. */
export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

/** Whole months of age on a given local date. */
export function ageInMonths(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  return (y - by) * 12 + (m - bm) - (d < bd ? 1 : 0);
}

export function ageLabel(birthDate: string, onDate: string): string {
  const months = ageInMonths(birthDate, onDate);
  if (months < 0) return "Not yet born";
  if (months < 24) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years} yr ${rem} mo` : `${years} yr`;
}
