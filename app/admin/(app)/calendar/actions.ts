"use server";

import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { CALENDAR_PROGRAMS, calendarDay, calendarSessions, type CalendarProgram } from "@/lib/admin/queries/calendar";
import { monthGrid } from "@/lib/admin/calendar-grid";

const program = (p: string): CalendarProgram => (CALENDAR_PROGRAMS.some((x) => x.key === p) ? (p as CalendarProgram) : "camp");

/** Every session shown on a month's grid (including the edge days of the weeks around it). */
export async function loadMonth(month: string, prog: string) {
  await requirePermission("roster.view");
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  const g = monthGrid(month);
  return calendarSessions(getDb(), g.start, g.end, program(prog));
}

/** One day's sessions with who's coming. */
export async function loadDay(date: string, prog: string) {
  const staff = await requirePermission("roster.view");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return calendarDay(getDb(), date, program(prog), staff.permissions);
}
