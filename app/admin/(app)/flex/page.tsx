import Link from "next/link";
import { ActionForm } from "@/components/admin/forms";
import { FlexEarlyBirdCell } from "@/components/admin/FlexEarlyBirdCell";
import { FlexSpotCell } from "@/components/admin/FlexSpotCell";
import { Card, Empty, Notice, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { FLEX_GROUPS } from "@/lib/booking/flex";
import { getDb } from "@/lib/db";
import { ensureFlexDays, flexGrid, weeklyVacancies } from "@/lib/ops/flex";
import { addDaysISO, fmtDate, todayLA, weekdayOf } from "@/lib/time";
import { flexEarlyBirdAction, flexSpotAction, flexWeeklyAction } from "./actions";

export const metadata = { title: "Yalla Flex spots" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/**
 * Yalla Flex only fills vacancies. Every age group is full on the website until a spot is
 * released here, for a standing vacancy (every week) or a single day (an absence).
 */
export default async function FlexPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const staff = await requirePermission("programs.view");
  const canEdit = can(staff, "programs.manage");
  const db = getDb();
  await ensureFlexDays(db);
  const sp = await searchParams;
  const today = todayLA();
  // Start on the Monday of the chosen week.
  const base = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) && sp.from >= today ? sp.from : today;
  const monday = addDaysISO(base, -((weekdayOf(base) + 6) % 7));
  const [grid, weekly] = await Promise.all([flexGrid(db, monday, 28), weeklyVacancies(db)]);
  const weeks = [0, 1, 2, 3].map((w) => grid.days.filter((d) => d.date >= addDaysISO(monday, w * 7) && d.date < addDaysISO(monday, w * 7 + 7) && d.date >= today));

  return (
    <>
      <PageHeader
        title="Yalla Flex spots"
        subtitle="Flex fills vacancies in the cohorts. Every age group shows as full on the website until you release a spot here. Families see only open or full, never how many."
      />
      {!grid.program ? (
        <Empty title="Yalla Flex isn’t set up yet">It’s created automatically with the next update.</Empty>
      ) : (
        <div className="space-y-6">
          <Card title="Every week">
            <p className="mb-4 text-[0.86rem] text-ink-soft">
              Standing vacancies: spots that open on the same weekday every week. Changing a number updates every upcoming day for that weekday, and keeps any spots you’ve released for single days. A spot is never taken back once it’s booked.
            </p>
            <ActionForm action={flexWeeklyAction} submit={canEdit ? { label: "Save weekly spots" } : false} className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-[34rem] text-[0.86rem]">
                  <thead>
                    <tr className="text-left text-[0.72rem] tracking-[0.08em] text-ink-soft uppercase">
                      <th className="py-2 pr-4 font-medium">Age group</th>
                      {WEEKDAYS.map((d) => (
                        <th key={d} className="px-1 py-2 text-center font-medium">
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FLEX_GROUPS.map((g) => (
                      <tr key={g.key} className="border-t border-ink/8">
                        <td className="py-2 pr-4">
                          <span className="block font-medium">{g.label}</span>
                          <span className="text-[0.75rem] text-ink-soft">{g.cohort}</span>
                        </td>
                        {WEEKDAYS.map((d, i) => (
                          <td key={d} className="px-1 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              name={`${g.key}_${i}`}
                              defaultValue={weekly[g.key]?.[i] ?? 0}
                              disabled={!canEdit}
                              aria-label={`${g.label}, ${d}: spots every week`}
                              className="h-9 w-14 rounded-lg border border-ink/15 bg-white text-center"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ActionForm>
          </Card>

          <Card
            title="Day by day"
            actions={
              <span className="flex gap-3 text-[0.84rem]">
                {monday > today ? (
                  <Link href={`/admin/flex?from=${addDaysISO(monday, -28)}`} className="text-blue hover:underline">
                    ← Earlier
                  </Link>
                ) : null}
                <Link href={`/admin/flex?from=${addDaysISO(monday, 28)}`} className="text-blue hover:underline">
                  Later →
                </Link>
              </span>
            }
          >
            <div className="mb-4">
              <Notice tone="info" title="Releasing a spot for an absence?">
                Tap + on that day and age group. It shows as open on the website straight away. Tap − to take it back (only while it isn’t booked). Then answer Early Bird for that day: tap None, or + for each Early Bird seat (8:00–8:30am, children 12 months and older). Days with open spots and no Early Bird answer are highlighted.
              </Notice>
            </div>
            <div className="space-y-8">
              {weeks.map((days, w) =>
                days.length ? (
                  <div key={w}>
                    <p className="mb-2 text-[0.78rem] tracking-[0.08em] text-ink-soft uppercase">Week of {fmtDate(addDaysISO(monday, w * 7), "d MMMM")}</p>
                    <div className="overflow-x-auto">
                      <div className="grid min-w-[54rem] grid-cols-[7rem_repeat(5,1fr)] gap-2">
                        <span />
                        {FLEX_GROUPS.map((g) => (
                          <span key={g.key} className="text-[0.75rem] font-medium">
                            {g.label}
                          </span>
                        ))}
                        <span className="text-[0.75rem] font-medium">Early Bird</span>
                        {days.map((d) => (
                          <div key={d.date} className="contents">
                            <span className="self-center text-[0.84rem]">{fmtDate(d.date, "EEE d MMM")}</span>
                            {d.groups.map((cell) => {
                              const g = FLEX_GROUPS.find((x) => x.key === cell.key)!;
                              return cell.sessionId && !cell.closed ? (
                                <FlexSpotCell
                                  key={cell.key}
                                  action={flexSpotAction}
                                  sessionId={cell.sessionId}
                                  released={cell.released}
                                  booked={cell.booked}
                                  label={`${g.label} on ${fmtDate(d.date, "EEE d MMM")}`}
                                  canEdit={canEdit}
                                />
                              ) : (
                                <span key={cell.key} className="self-center text-[0.75rem] text-ink-soft">
                                  Closed
                                </span>
                              );
                            })}
                            {d.groups.every((c) => c.closed) ? (
                              <span className="self-center text-[0.75rem] text-ink-soft">Closed</span>
                            ) : (
                              <FlexEarlyBirdCell
                                action={flexEarlyBirdAction}
                                date={d.date}
                                seats={d.earlyBird.seats}
                                booked={d.earlyBird.booked}
                                needsAnswer={d.groups.some((c) => !c.closed && c.released > c.booked)}
                                label={fmtDate(d.date, "EEE d MMM")}
                                canEdit={canEdit}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
