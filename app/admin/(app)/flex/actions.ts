"use server";

import { adminAction } from "@/lib/admin/action";
import { OpsError } from "@/lib/audit";
import { FLEX_GROUPS } from "@/lib/booking/flex";
import { adjustFlexSpots, setWeeklyVacancies } from "@/lib/ops/flex";

/** Release (+1) or take back (−1) a spot for one day and age group. */
export const flexSpotAction = adminAction("programs.manage", async ({ db, actor, str }) => {
  const delta = Number(str("delta"));
  if (delta !== 1 && delta !== -1) throw new OpsError("invalid", "Choose add or remove.");
  const s = await adjustFlexSpots(db, actor, str("sessionId"), delta);
  return { message: s.capacity ? `${s.capacity} open` : "Full", data: { capacity: s.capacity } };
});

/** Save the standing weekly vacancies (Monday–Friday for each age group). */
export const flexWeeklyAction = adminAction("programs.manage", async ({ db, actor, num }) => {
  const next = Object.fromEntries(FLEX_GROUPS.map((g) => [g.key, [0, 1, 2, 3, 4].map((d) => num(`${g.key}_${d}`) ?? 0)]));
  const { changed } = await setWeeklyVacancies(db, actor, next);
  return `Saved. ${changed ? `${changed} upcoming day${changed === 1 ? "" : "s"} updated.` : "No upcoming days needed changing."}`;
});
