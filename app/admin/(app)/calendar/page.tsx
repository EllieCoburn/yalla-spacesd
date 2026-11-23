import { EnrollmentCalendar } from "@/components/admin/calendar/EnrollmentCalendar";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { CALENDAR_PROGRAMS, calendarDay, calendarSessions, type CalendarProgram } from "@/lib/admin/queries/calendar";
import { monthGrid } from "@/lib/admin/calendar-grid";
import { todayLA } from "@/lib/time";

export const metadata = { title: "Enrollment calendar" };

type SP = { month?: string; date?: string; program?: string };

/**
 * The enrollment calendar: who's coming and how many spots are left, by month. The first view is
 * rendered here; after that the calendar loads months and days itself, so browsing is instant.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requirePermission("roster.view");
  const sp = await searchParams;
  const db = getDb();
  const today = todayLA();
  const program = (CALENDAR_PROGRAMS.some((p) => p.key === sp.program) ? sp.program : "camp") as CalendarProgram;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : null;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : (validDate ?? today).slice(0, 7);
  const g = monthGrid(month);
  const sessions = await calendarSessions(db, g.start, g.end, program);
  const inMonth = sessions.filter((s) => s.date >= g.first && s.date <= g.last);
  const date =
    validDate ?? (today.startsWith(month) && sessions.some((s) => s.date === today) ? today : ((inMonth.find((s) => s.date >= today) ?? inMonth[0])?.date ?? null));
  const day = date ? await calendarDay(db, date, program, staff.permissions) : [];
  return <EnrollmentCalendar programs={CALENDAR_PROGRAMS} today={today} initial={{ month, program, date, sessions, day }} />;
}
