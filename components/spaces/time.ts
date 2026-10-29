/** Browser-safe time helpers for Book a Space. Everything is shown in Yalla's time zone. */
export const TZ = "America/Los_Angeles";

const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" });

/** Minutes after local midnight (Los Angeles) for an instant. */
export function laMinutes(iso: string | Date): number {
  const p = partsFmt.formatToParts(typeof iso === "string" ? new Date(iso) : iso);
  const h = Number(p.find((x) => x.type === "hour")!.value);
  const m = Number(p.find((x) => x.type === "minute")!.value);
  return h * 60 + m;
}

export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 10:30am, 1pm. */
export function fmtMin(m: number, opts: { compact?: boolean } = {}) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (opts.compact && mm === 0) return `${h12}${suffix}`;
  return `${h12}:${String(mm).padStart(2, "0")}${suffix}`;
}

export function fmtRange(a: number, b: number) {
  return `${fmtMin(a)} – ${fmtMin(b)}`;
}

/** "Thursday, November 5" from YYYY-MM-DD (date-only, no time zone shifts). */
export function fmtDay(date: string, style: "long" | "short" | "weekday" | "num" | "month" = "long") {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const o: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", month: "long", day: "numeric" }
      : style === "short"
        ? { weekday: "short", month: "short", day: "numeric" }
        : style === "weekday"
          ? { weekday: "short" }
          : style === "month"
            ? { month: "short" }
            : { day: "numeric" };
  return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(dt);
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}

export const weekday = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
};

export function fmtDuration(min: number) {
  if (min < 60) return `${min} minutes`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} minutes` : ""}`;
}

export const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
