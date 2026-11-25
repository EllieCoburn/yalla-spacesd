import Link from "next/link";
import { Card, Empty, Notice, PageHeader, Pill } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { awaitingReply, myFeedSessions } from "@/lib/ops/day-feed";
import { fmtDate, fmtTime, todayLA } from "@/lib/time";

export const metadata = { title: "Day feed" };

/** The team's start page: the sessions they're on today (and tomorrow, from 6pm), with each child. */
export default async function MyDayPage() {
  const staff = await requireStaff();
  if (!can(staff, "feed.post") && !can(staff, "feed.manage")) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/forbidden?need=feed.post");
  }
  const db = getDb();
  const list = await myFeedSessions(db, staff);
  const today = todayLA();
  const replies = new Set<string>();
  for (const l of list) for (const id of await awaitingReply(db, l.children.map((c) => c.childId), l.session.localDate)) replies.add(`${l.session.localDate}:${id}`);
  return (
    <>
      <PageHeader
        title="Day feed"
        subtitle={
          can(staff, "feed.manage")
            ? "Every session today (and tomorrow’s, from 6pm). Post photos, food, naps and potty, and message parents."
            : "The children in your sessions. Each child’s profile opens at 6pm the evening before and closes at 11:59pm on the day."
        }
      />
      {list.length === 0 ? (
        <Empty title="No sessions for you right now">
          {can(staff, "feed.manage") ? "There are no sessions today." : "When you’re on the team for a session, its children appear here from 6pm the evening before."}
        </Empty>
      ) : (
        <div className="space-y-6">
          {list.map(({ session, program, children }) => (
            <Card
              key={session.id}
              title={`${session.title ?? program.name}`}
              actions={
                <span className="text-[0.82rem] text-ink-soft">
                  {session.localDate === today ? "Today" : fmtDate(session.localDate, "EEEE")} · {fmtTime(session.startsAt)}–{fmtTime(session.endsAt)}
                </span>
              }
              padded={false}
            >
              {children.length === 0 ? (
                <div className="p-5 text-[0.9rem] text-ink-soft">No children booked.</div>
              ) : (
                <ul className="divide-y divide-ink/8">
                  {children.map((c) => (
                    <li key={c.childId}>
                      <Link href={`/admin/my-day/${session.id}/${c.childId}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-ink/[0.03]">
                        <span>
                          <span className="block text-[0.95rem] font-medium text-ink">
                            {c.name}
                            {c.preferredName ? <span className="font-normal text-ink-soft"> · goes by {c.preferredName}</span> : null}
                          </span>
                          <span className="block text-[0.8rem] text-ink-soft">{c.age}</span>
                        </span>
                        <span className="flex flex-wrap items-center justify-end gap-1.5">
                          {replies.has(`${session.localDate}:${c.childId}`) ? <Pill tone="info">New message</Pill> : null}
                          {c.allergies ? <Pill tone="critical">Allergy</Pill> : null}
                          {c.medications ? <Pill tone="warning">Medication</Pill> : null}
                          <span aria-hidden className="text-ink-soft">→</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
          {!can(staff, "feed.manage") ? (
            <Notice tone="info">Profiles and messages close at 11:59pm. Anything you post stays on the family’s record.</Notice>
          ) : null}
        </div>
      )}
    </>
  );
}
