import { addDaysISO, weekdayOf } from "@/lib/time";

/** A month's grid, Sunday to Saturday, from the Sunday on or before the 1st to the Saturday on or after the last day. */
export function monthGrid(month: string) {
  const first = `${month}-01`;
  const next = addDaysISO(first, 32).slice(0, 7);
  const last = addDaysISO(`${next}-01`, -1);
  return {
    first,
    last,
    start: addDaysISO(first, -weekdayOf(first)),
    end: addDaysISO(last, 6 - weekdayOf(last)),
    prev: addDaysISO(first, -1).slice(0, 7),
    next,
  };
}
