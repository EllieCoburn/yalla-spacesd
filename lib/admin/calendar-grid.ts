import { addDaysISO, weekdayOf } from "@/lib/time";

/** A month's grid, Monday to Sunday, from the Monday on or before the 1st to the Sunday on or after the last day. */
export function monthGrid(month: string) {
  const first = `${month}-01`;
  const next = addDaysISO(first, 32).slice(0, 7);
  const last = addDaysISO(`${next}-01`, -1);
  return {
    first,
    last,
    start: addDaysISO(first, -((weekdayOf(first) + 6) % 7)),
    end: addDaysISO(last, (7 - weekdayOf(last)) % 7),
    prev: addDaysISO(first, -1).slice(0, 7),
    next,
  };
}
