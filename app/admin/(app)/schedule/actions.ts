"use server";

import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { addBlackout, copySeries, createSeries, createSession, previewBlackout } from "@/lib/ops/schedule";
import { zonedDateTime } from "@/lib/time";

type Ctx = Parameters<Parameters<typeof adminAction>[1]>[0];

/** <input type="datetime-local"> is Los Angeles wall time. */
function laDateTime(v: string): Date | null {
  if (!v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) throw new OpsError("invalid", "Use a valid date and time.");
  return zonedDateTime(m[1], m[2]);
}

function common(ctx: Ctx) {
  const capacity = ctx.num("capacity");
  if (capacity == null || !Number.isInteger(capacity)) throw new OpsError("invalid", "Enter a whole-number capacity.");
  const hard = ctx.num("hardCapacity");
  return {
    programId: ctx.str("programId"),
    title: ctx.str("title") || null,
    capacity,
    hardCapacity: hard,
    locationId: ctx.str("locationId") || null,
    cohortId: ctx.str("cohortId") || null,
    capacityPoolId: ctx.str("capacityPoolId") || null,
    priceCents: ctx.cents("priceCents"),
    bookingOpensAt: laDateTime(ctx.str("bookingOpensAt")),
    bookingClosesAt: laDateTime(ctx.str("bookingClosesAt")),
  };
}

function blocks(ctx: Ctx) {
  const starts = ctx.all("startTime");
  const ends = ctx.all("endTime");
  const out = starts.map((s, i) => ({ start: s.trim(), end: (ends[i] ?? "").trim() })).filter((b) => b.start || b.end);
  if (!out.length) throw new OpsError("invalid", "Add at least one time block.");
  return out;
}

export const createSeriesAction = adminAction("schedule.manage", async (ctx) => {
  if (!ctx.str("programId")) throw new OpsError("invalid", "Choose a program.");
  const weekdays = ctx.all("weekdays").map(Number);
  const base = common(ctx);
  let total = 0;
  let closed = 0;
  // Each time block becomes its own series so it can be edited independently later.
  for (const b of blocks(ctx)) {
    const r = await createSeries(ctx.db, ctx.actor, {
      ...base,
      weekdays,
      startTime: b.start,
      endTime: b.end,
      startsOn: ctx.str("startsOn"),
      endsOn: ctx.str("endsOn"),
      bookAsSeries: ctx.bool("bookAsSeries"),
    });
    total += r.count;
    closed += r.closed;
  }
  return `Added ${total} session${total === 1 ? "" : "s"}${closed ? ` (${closed} on blackout dates were created as closed)` : ""}.`;
});

export const createSessionAction = adminAction("schedule.manage", async (ctx) => {
  if (!ctx.str("programId")) throw new OpsError("invalid", "Choose a program.");
  const base = common(ctx);
  let n = 0;
  for (const b of blocks(ctx)) {
    await createSession(ctx.db, ctx.actor, { ...base, localDate: ctx.str("localDate"), startTime: b.start, endTime: b.end });
    n++;
  }
  return `Added ${n} session${n === 1 ? "" : "s"}.`;
});

export const copySeriesAction = adminAction("schedule.manage", async ({ db, actor, str }) => {
  const r = await copySeries(db, actor, str("seriesId"), str("startsOn"), str("endsOn"));
  return `Copied schedule: ${r.count} session${r.count === 1 ? "" : "s"} added${r.closed ? `, ${r.closed} closed for blackout dates` : ""}.`;
});

/** Two-step: the first submit previews; confirming applies. */
export const blackoutAction = adminAction("schedule.manage", async ({ db, actor, str, bool }) => {
  const input = { startsOn: str("startsOn"), endsOn: str("endsOn") || str("startsOn"), reason: str("reason"), programId: str("programId") || null, locationId: str("locationId") || null };
  if (!input.startsOn) throw new OpsError("invalid", "Choose the first closed date.");
  if (!input.reason) throw new OpsError("invalid", "Name the closure (e.g. Thanksgiving).");
  // Confirmation only counts for the exact range that was previewed.
  const key = `${input.startsOn}|${input.endsOn}|${input.programId ?? ""}|${input.locationId ?? ""}`;
  if (!bool("confirmAffected") || str("previewKey") !== key) {
    const affected = await previewBlackout(db, input);
    const withBookings = affected.filter((a) => a.booked > 0);
    if (affected.length) throw new OpsError("confirm_required", `This closes ${affected.length} session${affected.length === 1 ? "" : "s"}${withBookings.length ? `, ${withBookings.length} with bookings` : ""}. Review below and confirm.`, { affected, previewKey: key });
  }
  const r = await addBlackout(db, actor, { ...input, confirmAffected: true });
  return `Closure added. ${r.closed} session${r.closed === 1 ? "" : "s"} closed${r.withBookings.length ? ` — ${r.withBookings.length} have bookings to follow up (bookings and payments were not changed)` : ""}.`;
});
