"use server";

import { redirect } from "next/navigation";
import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { applySessionChange, duplicateSession, previewSessionChange, type EditScope, type SessionChanges } from "@/lib/ops/schedule";
import { fmtDate } from "@/lib/time";

const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/** Only fields that actually differ from the anchor session count as changes. */
async function changesFor(db: DB, sessionId: string, str: (k: string) => string, num: (k: string) => number | null, cents: (k: string) => number | null) {
  const [cur] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!cur) throw new OpsError("not_found", "Session not found.");
  const c = changesFrom(str, num, cents, false);
  if (c.startTime === hhmm(cur.startsAt)) delete c.startTime;
  if (c.endTime === hhmm(cur.endsAt)) delete c.endTime;
  if (c.capacity === cur.capacity) delete c.capacity;
  if (c.hardCapacity !== undefined && c.hardCapacity === cur.hardCapacity) delete c.hardCapacity;
  if (c.reservedSpots === cur.reservedSpots) delete c.reservedSpots;
  if (c.priceCents !== undefined && c.priceCents === cur.priceCents) delete c.priceCents;
  if (c.status === cur.status) delete c.status;
  if (!Object.keys(c).length) throw new OpsError("invalid", "Nothing has changed yet. Edit a field first.");
  return c;
}

function changesFrom(str: (k: string) => string, num: (k: string) => number | null, cents: (k: string) => number | null, requireOne = true): SessionChanges {
  const c: SessionChanges = {};
  if (str("startTime")) c.startTime = str("startTime");
  if (str("endTime")) c.endTime = str("endTime");
  if (str("capacity")) c.capacity = num("capacity")!;
  if (str("hardCapacityMode") === "clear") c.hardCapacity = null;
  else if (str("hardCapacity")) c.hardCapacity = num("hardCapacity");
  if (str("reservedSpots")) c.reservedSpots = num("reservedSpots")!;
  if (str("priceMode") === "clear") c.priceCents = null;
  else if (str("price")) c.priceCents = cents("price");
  if (str("status")) c.status = str("status") as SessionChanges["status"];
  if (str("notes")) c.notes = str("notes");
  for (const [k, v] of Object.entries(c)) if (typeof v === "number" && (!Number.isFinite(v) || v < 0)) throw new OpsError("invalid", `Check the value for ${k}.`);
  if (requireOne && !Object.keys(c).length) throw new OpsError("invalid", "Change at least one field.");
  return c;
}

export const previewChangeAction = adminAction("schedule.manage", async ({ db, str, num, cents }) => {
  const scope = (str("scope") || "this") as EditScope;
  const changes = await changesFor(db, str("sessionId"), str, num, cents);
  const p = await previewSessionChange(db, str("sessionId"), scope, changes);
  return {
    data: {
      scope,
      changes: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v == null ? "" : String(v)])),
      clears: { hardCapacity: changes.hardCapacity === null, price: changes.priceCents === null },
      sessions: p.sessions.map((s) => ({ date: fmtDate(s.localDate, "EEE d MMM yyyy"), booked: s.booked, capacity: s.capacity })),
      affected: p.affected.map((a) => ({ reference: a.reference, bookingId: a.bookingId, family: a.familyName, children: a.children, date: fmtDate(a.sessionDate, "EEE d MMM") })),
      blockers: p.blockers,
      consequences: p.consequences,
    },
  };
});

export const applyChangeAction = adminAction("schedule.manage", async ({ db, actor, str, num, cents, bool }) => {
  const scope = (str("scope") || "this") as EditScope;
  const changes = await changesFor(db, str("sessionId"), str, num, cents);
  const p = await applySessionChange(db, actor, { sessionId: str("sessionId"), scope, changes, notifyFamilies: bool("notify"), confirmAffected: bool("confirmAffected") });
  return `Updated ${p.sessions.length} session(s).${p.affected.length ? ` ${p.affected.length} booking(s) affected${bool("notify") ? "; families notified (captured in test mode)" : "; families were not notified"}.` : ""}`;
});

export const duplicateAction = adminAction("schedule.manage", async ({ db, actor, str }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str("toDate"))) throw new OpsError("invalid", "Choose a date.");
  const s = await duplicateSession(db, actor, str("sessionId"), str("toDate"));
  redirect(`/admin/sessions/${s.id}?duplicated=1`);
});
