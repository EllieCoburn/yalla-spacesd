import { eq } from "drizzle-orm";
import { Card, Empty, Notice, PageHeader, Pill } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { staffUsers } from "@/lib/db/schema";
import { FLEX_GROUPS } from "@/lib/booking/flex";
import { careSentence, dayPhrase, upcomingDropIns } from "@/lib/ops/team-notices";
import { ageLabel, fmtDate, todayLA } from "@/lib/time";

export const metadata = { title: "Drop-ins" };

/**
 * Upcoming Yalla Flex drop-ins. A cohort's team sees only drop-ins to their own cohort(s); anyone who
 * can view daily rosters sees every cohort.
 */
export default async function DropIns() {
  const staff = await requirePermission("dropins.view");
  const db = getDb();
  const [me] = await db.select({ flexCohorts: staffUsers.flexCohorts }).from(staffUsers).where(eq(staffUsers.id, staff.id));
  // Anyone who can view daily rosters, and Flex & Club Yalla operations, see every cohort.
  const everyCohort = can(staff, "roster.view") || can(staff, "flexclub.view");
  const mine = me?.flexCohorts ?? [];
  const cohorts = everyCohort ? null : mine;
  const rows = await upcomingDropIns(db, { cohorts, days: 21 });
  const today = todayLA();
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const names = FLEX_GROUPS.filter((g) => mine.includes(g.key)).map((g) => g.cohort);

  return (
    <>
      <PageHeader
        title="Drop-ins"
        subtitle={everyCohort ? "Yalla Flex drop-ins to every cohort over the next three weeks." : names.length ? `Yalla Flex drop-ins to ${names.join(" and ")} over the next three weeks.` : "Yalla Flex drop-ins to your cohort."}
      />
      {!everyCohort && !mine.length ? (
        <Notice tone="warning" title="You’re not part of a cohort yet">
          Ask the leadership team to add you to your cohort. Then you’ll see its drop-ins here and get an email for each one.
        </Notice>
      ) : byDate.size ? (
        <div className="space-y-5">
          {[...byDate].map(([date, list]) => {
            const phrase = dayPhrase(date, today);
            return (
              <Card key={date} title={`${phrase.startsWith("on ") ? "" : `${phrase[0].toUpperCase()}${phrase.slice(1)} · `}${fmtDate(date, "EEEE, MMMM d")}`}>
                <ul className="divide-y divide-ink/8">
                  {list.map((r) => (
                    <li key={r.itemId} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">
                          {r.child.preferredName || r.child.firstName} {r.child.lastName}
                        </span>
                        {cohorts === null || mine.length > 1 ? <Pill tone="muted">{r.cohort.cohort}</Pill> : null}
                        {r.isNew ? <Pill tone="info">New Flex friend</Pill> : <Pill tone="positive">Returning Flex friend</Pill>}
                      </div>
                      <p className="mt-1 text-[0.85rem] text-ink-soft">
                        {r.length[2].toUpperCase()}
                        {r.length.slice(3)} · {ageLabel(r.child.birthDate, date)}
                      </p>
                      <p className="mt-1 text-[0.85rem] whitespace-pre-line text-ink">{careSentence(r.child)}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty title="No drop-ins booked yet">We’ll email you as soon as a family books one.</Empty>
      )}
    </>
  );
}
