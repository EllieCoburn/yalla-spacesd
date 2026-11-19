import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Card, Empty, FilterBar, FilterField, inputCls, PageHeader, Pill, Stat, Tabs } from "@/components/admin/ui";
import { flexClubFamilies } from "@/lib/auth/flex-club";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { children, cohorts, families, guardians, memberships } from "@/lib/db/schema";
import { FLEX_GROUPS } from "@/lib/booking/flex";
import { WEEKDAY } from "@/lib/ops/memberships";
import { careSentence, dayPhrase, upcomingDropIns } from "@/lib/ops/team-notices";
import { ageLabel, fmtDate, todayLA } from "@/lib/time";

export const metadata = { title: "Flex & Club Yalla" };

/**
 * Yalla Flex & Club Yalla operations: who's coming to Flex, Club Yalla at a glance, and the families
 * of both. Nothing about bookings, billing or messages; family cards open read-only.
 */
export default async function FlexClubPage({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string; q?: string }> }) {
  await requirePermission("flexclub.view");
  const sp = await searchParams;
  const tab = sp.tab === "club" || sp.tab === "families" ? sp.tab : "flex";
  const days = [7, 14, 28].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const db = getDb();
  const today = todayLA();

  const [dropIns, scope, members] = await Promise.all([
    upcomingDropIns(db, { cohorts: null, days }),
    flexClubFamilies(db),
    db
      .select({ m: memberships, c: children, co: cohorts, f: families })
      .from(memberships)
      .innerJoin(children, eq(children.id, memberships.childId))
      .innerJoin(cohorts, eq(cohorts.id, memberships.cohortId))
      .innerJoin(families, eq(families.id, memberships.familyId))
      .where(inArray(memberships.status, ["active", "upcoming", "paused"]))
      .orderBy(asc(cohorts.sortOrder), asc(children.firstName)),
  ]);
  const flexToday = dropIns.filter((d) => d.date === today).length;
  const activeMembers = members.filter((r) => r.m.status === "active");
  const tabs = [
    { key: "flex", label: "Coming to Flex", href: "/admin/flex-club", count: dropIns.length },
    { key: "club", label: "Club Yalla", href: "/admin/flex-club?tab=club", count: members.length },
    { key: "families", label: "Families", href: "/admin/flex-club?tab=families", count: scope.size },
  ];

  return (
    <>
      <PageHeader title="Yalla Flex & Club Yalla" subtitle="Who’s coming, Club Yalla at a glance, and every Flex and Club Yalla family’s contact card and forms." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Flex today" value={flexToday} sub={fmtDate(today, "EEEE d MMMM")} href="/admin/flex-club" />
        <Stat label={`Flex · next ${days} days`} value={dropIns.length} sub={`${new Set(dropIns.map((d) => d.child.id)).size} children`} href="/admin/flex-club" />
        <Stat label="Club Yalla members" value={activeMembers.length} sub={members.length > activeMembers.length ? `+ ${members.length - activeMembers.length} starting soon or paused` : "active"} href="/admin/flex-club?tab=club" />
        <Stat label="Families" value={scope.size} sub="Flex and Club Yalla" href="/admin/flex-club?tab=families" />
      </div>
      <Tabs tabs={tabs} current={tab} />

      {tab === "flex" ? <FlexTab rows={dropIns} today={today} days={days} /> : null}
      {tab === "club" ? <ClubTab rows={members} today={today} /> : null}
      {tab === "families" ? <FamiliesTab scope={scope} q={(sp.q ?? "").trim()} /> : null}
    </>
  );
}

type DropIn = Awaited<ReturnType<typeof upcomingDropIns>>[number];

function FlexTab({ rows, today, days }: { rows: DropIn[]; today: string; days: number }) {
  const byDate = new Map<string, DropIn[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 text-[0.82rem]">
        {[7, 14, 28].map((d) => (
          <Link
            key={d}
            href={`/admin/flex-club?days=${d}`}
            className={`rounded-full px-3.5 py-1.5 ${d === days ? "bg-ink text-chalk" : "border border-ink/15 bg-white text-ink-soft hover:border-ink/40"}`}
          >
            Next {d} days
          </Link>
        ))}
      </div>
      {byDate.size === 0 ? (
        <Empty title="No Flex drop-ins booked">Nobody is booked into Yalla Flex in the next {days} days yet.</Empty>
      ) : (
        <div className="space-y-5">
          {[...byDate].map(([date, list]) => {
            const phrase = dayPhrase(date, today);
            return (
              <Card
                key={date}
                title={`${phrase.startsWith("on ") ? "" : `${phrase[0].toUpperCase()}${phrase.slice(1)} · `}${fmtDate(date, "EEEE, MMMM d")}`}
                actions={<span className="text-[0.8rem] text-ink-soft">{list.length} {list.length === 1 ? "child" : "children"}</span>}
                padded={false}
              >
                {FLEX_GROUPS.filter((g) => list.some((r) => r.cohort.key === g.key)).map((g) => (
                  <div key={g.key} className="border-t border-ink/6 first:border-t-0">
                    <p className="bg-[#f7f5ef] px-5 py-2 text-[0.72rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                      {g.cohort} · {g.label}
                    </p>
                    <ul className="divide-y divide-ink/6">
                      {list
                        .filter((r) => r.cohort.key === g.key)
                        .map((r) => (
                          <li key={r.itemId} className="px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/admin/children/${r.child.id}`} className="font-medium text-ink hover:text-blue">
                                {r.child.preferredName || r.child.firstName} {r.child.lastName}
                              </Link>
                              <span className="text-[0.8rem] text-ink-soft">{ageLabel(r.child.birthDate, date)}</span>
                              {r.isNew ? <Pill tone="info">New Flex friend</Pill> : <Pill tone="positive">Returning</Pill>}
                              <Link href={`/admin/families/${r.child.familyId}`} className="ml-auto text-[0.78rem] text-blue hover:underline">
                                Family card →
                              </Link>
                            </div>
                            <p className="mt-1 text-[0.82rem] text-ink-soft">
                              {r.length[2].toUpperCase()}
                              {r.length.slice(3)}
                            </p>
                            <p className={`mt-1 text-[0.82rem] whitespace-pre-line ${r.child.allergies?.trim() || r.child.medicalNotes?.trim() ? "text-[#8a5212]" : "text-ink-soft"}`}>{careSentence(r.child)}</p>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

type MemberRow = { m: typeof memberships.$inferSelect; c: typeof children.$inferSelect; co: typeof cohorts.$inferSelect; f: typeof families.$inferSelect };

function ClubTab({ rows, today }: { rows: MemberRow[]; today: string }) {
  if (!rows.length) return <Empty title="No Club Yalla members yet">Members appear here once their membership starts.</Empty>;
  const byCohort = new Map<string, MemberRow[]>();
  for (const r of rows) byCohort.set(r.co.id, [...(byCohort.get(r.co.id) ?? []), r]);
  const weekdays = [1, 2, 3, 4, 5];
  const active = rows.filter((r) => r.m.status === "active");
  return (
    <div className="space-y-6">
      {/* Each cohort's days at a glance: how many members come each weekday. */}
      <Card title="Members by day" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[0.85rem]">
            <thead>
              <tr className="border-b border-ink/10 text-[0.72rem] tracking-[0.04em] text-ink-soft uppercase">
                <th className="px-5 py-2.5 font-medium">Cohort</th>
                {weekdays.map((w) => (
                  <th key={w} className="px-3 py-2.5 text-center font-medium">
                    {WEEKDAY[w]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/6">
              {[...byCohort].map(([id, list]) => (
                <tr key={id}>
                  <td className="px-5 py-3 text-ink">
                    {list[0].co.name}
                    {list[0].co.maxSize ? <span className="text-[0.75rem] text-ink-soft"> · up to {list[0].co.maxSize}</span> : null}
                  </td>
                  {weekdays.map((w) => {
                    const n = list.filter((r) => r.m.status === "active" && r.m.weekdays.includes(w)).length;
                    const full = list[0].co.maxSize != null && n >= list[0].co.maxSize;
                    return (
                      <td key={w} className={`px-3 py-3 text-center tabular-nums ${full ? "font-semibold text-[#8a2333]" : n ? "text-ink" : "text-ink/30"}`}>
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink/6 px-5 py-2.5 text-[0.75rem] text-ink-soft">Active members only. {active.length} children in all.</p>
      </Card>

      {[...byCohort].map(([id, list]) => (
        <Card key={id} title={`${list[0].co.name} · ${list.length} ${list.length === 1 ? "member" : "members"}`} padded={false}>
          <ul className="divide-y divide-ink/6">
            {list.map(({ m, c, f }) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="min-w-[12rem]">
                  <Link href={`/admin/children/${c.id}`} className="font-medium text-ink hover:text-blue">
                    {c.preferredName || c.firstName} {c.lastName}
                  </Link>
                  <span className="ml-2 text-[0.8rem] text-ink-soft">{ageLabel(c.birthDate, today)}</span>
                </span>
                <span className="text-[0.82rem] text-ink-soft">
                  {m.weekdays.map((w) => WEEKDAY[w]).join(", ")} · {m.dayLength === "half" ? "Half day" : "Full day"}
                  {m.earlyBird ? " + Early Bird" : ""}
                </span>
                <span className="text-[0.82rem] text-ink-soft">
                  {m.status === "upcoming" ? `Starts ${fmtDate(m.startsOn, "d MMM")}` : `Since ${fmtDate(m.startsOn, "d MMM yyyy")}`}
                  {m.endsOn ? ` · until ${fmtDate(m.endsOn, "d MMM yyyy")}` : ""}
                </span>
                {m.status !== "active" ? <Pill tone={m.status === "paused" ? "warning" : "info"}>{m.status === "paused" ? "Paused" : "Starting soon"}</Pill> : null}
                <Link href={`/admin/families/${f.id}`} className="ml-auto text-[0.78rem] text-blue hover:underline">
                  Family card →
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

async function FamiliesTab({ scope, q }: { scope: Map<string, { flex: boolean; club: boolean }>; q: string }) {
  const ids = [...scope.keys()];
  const db = getDb();
  const [fams, gs, kids] = ids.length
    ? await Promise.all([
        db.select().from(families).where(and(inArray(families.id, ids), eq(families.status, "active"))).orderBy(asc(families.name)),
        db.select().from(guardians).where(inArray(guardians.familyId, ids)).orderBy(desc(guardians.isPrimary), asc(guardians.createdAt)),
        db.select().from(children).where(inArray(children.familyId, ids)).orderBy(asc(children.birthDate)),
      ])
    : [[], [], []];
  const needle = q.toLowerCase();
  const list = fams
    .map((f) => ({ f, gs: gs.filter((g) => g.familyId === f.id), kids: kids.filter((k) => k.familyId === f.id), tags: scope.get(f.id)! }))
    .filter(
      (x) =>
        !needle ||
        [x.f.name, ...x.gs.flatMap((g) => [g.firstName, g.lastName, g.email, g.phone ?? ""]), ...x.kids.flatMap((k) => [k.firstName, k.lastName, k.preferredName ?? ""])].some((v) =>
          v.toLowerCase().includes(needle),
        ),
    );
  return (
    <>
      <FilterBar action="/admin/flex-club">
        <input type="hidden" name="tab" value="families" />
        <FilterField label="Search">
          <input name="q" defaultValue={q} placeholder="Family, parent, child, email or phone" className={inputCls} />
        </FilterField>
      </FilterBar>
      {list.length === 0 ? (
        <Empty title={q ? "No matching families" : "No Flex or Club Yalla families yet"}>{q ? "Try another name, email or phone number." : null}</Empty>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-ink/6">
            {list.map(({ f, gs: g, kids: k, tags }) => {
              const primary = g[0];
              return (
                <li key={f.id}>
                  <Link href={`/admin/families/${f.id}`} className="grid gap-2 px-5 py-3.5 hover:bg-mist/30 sm:grid-cols-[1.2fr_1.4fr_1fr] sm:items-center">
                    <span>
                      <span className="block font-medium text-ink">{f.name}</span>
                      <span className="mt-1 flex gap-1.5">
                        {tags.flex ? <Pill tone="positive">Flex</Pill> : null}
                        {tags.club ? <Pill tone="info">Club Yalla</Pill> : null}
                      </span>
                    </span>
                    <span className="text-[0.82rem] text-ink-soft">
                      {primary ? (
                        <>
                          <span className="block text-ink">
                            {primary.firstName} {primary.lastName}
                          </span>
                          {primary.email}
                          {primary.phone ? ` · ${primary.phone}` : ""}
                        </>
                      ) : (
                        "No guardian on file"
                      )}
                    </span>
                    <span className="text-[0.82rem] text-ink-soft">{k.map((c) => c.preferredName || c.firstName).join(", ") || "—"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
