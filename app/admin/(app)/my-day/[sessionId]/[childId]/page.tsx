import { redirect } from "next/navigation";
import { ActionForm } from "@/components/admin/forms";
import { Card, DL, Notice, PageHeader, Pill } from "@/components/admin/ui";
import { FeedComposer } from "@/components/feed/FeedComposer";
import { FeedTimeline } from "@/components/feed/FeedTimeline";
import { OpsError } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { AMOUNTS, MEALS, POTTY, childAccess, childProfile, feedFor, feedWindow, nowHHMM } from "@/lib/ops/day-feed";
import { fmtDate, fmtTime } from "@/lib/time";
import { addFeedEntryAction, endNapAction, removeFeedEntryAction } from "../../actions";

export const metadata = { title: "Child’s day" };

export default async function ChildDayPage({ params }: { params: Promise<{ sessionId: string; childId: string }> }) {
  const staff = await requireStaff();
  const { sessionId, childId } = await params;
  const db = getDb();
  // The whole page is gated: only this session's team, only between 6pm the evening before and 11:59pm on the day.
  const access = await childAccess(db, staff, sessionId, childId).catch((e) => {
    if (e instanceof OpsError) return null;
    throw e;
  });
  if (!access) redirect("/admin/my-day");
  const { session } = access;
  const [p, entries] = await Promise.all([childProfile(db, childId), feedFor(db, childId, session.localDate)]);
  const c = p.child;
  const closes = feedWindow(session.localDate).closes;
  const restricted = p.pickups.filter((x) => x.restricted);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/my-day", label: "Day feed" }}
        title={c.name}
        subtitle={`${c.preferredName ? `Goes by ${c.preferredName} · ` : ""}Born ${fmtDate(c.birthDate, "MMM d, yyyy")} · ${c.age} · ${session.title ?? "Session"} ${fmtTime(session.startsAt)}–${fmtTime(session.endsAt)}, ${fmtDate(session.localDate, "EEE d MMM")}`}
      />
      {!can(staff, "feed.manage") ? (
        <p className="-mt-3 mb-5 text-[0.8rem] text-ink-soft">This profile closes at {fmtTime(new Date(closes.getTime() - 60_000))} on {fmtDate(session.localDate, "EEE d MMM")}.</p>
      ) : null}
      {restricted.length ? (
        <div className="mb-5">
          <Notice tone="critical" title="Do not release to">
            {restricted.map((r) => `${r.name}${r.note ? ` (${r.note})` : ""}`).join(", ")}
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title={`Add to ${c.firstName}’s day`}>
            <FeedComposer action={addFeedEntryAction} sessionId={sessionId} childId={childId} childName={c.firstName} now={nowHHMM()} meals={MEALS} amounts={AMOUNTS} potty={POTTY} />
          </Card>
          <Card title={`${c.firstName}’s day`}>
            <FeedTimeline
              entries={entries}
              photoBase="/admin/feed-photo/"
              empty="Nothing posted yet. Photos, food, naps, potty and messages appear here and on the family’s portal."
              actions={(e) =>
                e.authorGuardianId ? null : (
                  <div className="flex flex-wrap items-center gap-3">
                    {e.kind === "nap" && !e.data?.endedAt ? (
                      <ActionForm action={endNapAction} className="flex items-center gap-2" submit={{ label: "Woke up now", variant: "secondary" }}>
                        <input type="hidden" name="entryId" value={e.id} />
                      </ActionForm>
                    ) : null}
                    <ActionForm action={removeFeedEntryAction} className="inline" submit={{ label: "Remove", variant: "ghost" }} confirm={{ title: "Remove this from the feed?", body: "The family won’t see it anymore.", confirmLabel: "Remove", danger: true }}>
                      <input type="hidden" name="entryId" value={e.id} />
                    </ActionForm>
                  </div>
                )
              }
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Care">
            <div className="space-y-3 text-[0.92rem]">
              <div>
                <p className="text-[0.75rem] tracking-[0.04em] text-ink-soft uppercase">Allergies</p>
                {c.allergies?.trim() ? <p className="mt-0.5 rounded-md bg-[#f6e3e5] px-2.5 py-1.5 font-medium text-[#8a2333]">{c.allergies}</p> : <p className="text-ink-soft">None reported</p>}
              </div>
              <div>
                <p className="text-[0.75rem] tracking-[0.04em] text-ink-soft uppercase">Medications</p>
                <p className={c.medications?.trim() ? "text-ink" : "text-ink-soft"}>{c.medications?.trim() || "None reported"}</p>
              </div>
              {c.careNotes?.trim() ? (
                <div>
                  <p className="text-[0.75rem] tracking-[0.04em] text-ink-soft uppercase">Care notes from the family</p>
                  <p className="whitespace-pre-line text-ink">{c.careNotes}</p>
                </div>
              ) : null}
            </div>
          </Card>
          <Card title="Parents">
            <ul className="space-y-2.5">
              {p.parents.map((g) => (
                <li key={g.id} className="flex items-baseline justify-between gap-3 text-[0.92rem]">
                  <span>
                    {g.name}
                    {g.relationship ? <span className="text-ink-soft"> · {g.relationship}</span> : null}
                  </span>
                  {g.phone ? (
                    <a href={`tel:${g.phone.replace(/[^\d+]/g, "")}`} className="text-blue tabular-nums">
                      {g.phone}
                    </a>
                  ) : (
                    <span className="text-ink-soft">No phone</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          {p.pickups.filter((x) => !x.restricted).length || p.emergency.length ? (
            <Card title="Pickup and emergency contacts">
              <DL
                cols={1}
                items={[
                  ...p.pickups.filter((x) => !x.restricted).map((x) => ({ label: `May collect · ${x.relationship ?? ""}`.replace(/ · $/, ""), value: `${x.name}${x.phone ? ` · ${x.phone}` : ""}` })),
                  ...p.emergency.map((x) => ({ label: `Emergency · ${x.relationship ?? ""}`.replace(/ · $/, ""), value: `${x.name}${x.phone ? ` · ${x.phone}` : ""}` })),
                ]}
              />
            </Card>
          ) : null}
          {c.allergies?.trim() ? (
            <div>
              <Pill tone="critical">Check allergies before any food</Pill>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
