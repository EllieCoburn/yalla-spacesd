import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Card, Empty, FilterBar, FilterField, inputCls, PageHeader, Pill, Stat, Tabs } from "@/components/admin/ui";
import { flexClubFamilies } from "@/lib/auth/flex-club";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { OpsList } from "@/components/admin/ops/OpsList";
import { opsList, opsOpenCounts } from "@/lib/ops/ops-requests";
import { getDb } from "@/lib/db";
import { children, cohorts, families, guardians, memberships } from "@/lib/db/schema";
import { FLEX_GROUPS, flexDayWindow } from "@/lib/booking/flex";
import { WEEKDAY } from "@/lib/ops/memberships";
import { careSentence, dayPhrase, upcomingDropIns } from "@/lib/ops/team-notices";
import { ageLabel, fmtDate, phaseText, sessionPhase, todayLA } from "@/lib/time";

export const metadata = { title: "Club Yalla operations" };

/**
 * Club Yalla operations: Club Yalla at a glance, who's coming to Yalla Flex, the families of both, and
 * the supplies and maintenance lists. Nothing about bookings, billing or messages; family cards open
 * read-only.
 */
export default async function FlexClubPage({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string; q?: string }> }) {
  const staff = await requirePermission("flexclub.view");
  const lists = can(staff, "ops.lists");
  const sp = await searchParams;
  const tab = ["flex", "families", ...(lists ? ["supplies", "maintenance"] : [])].includes(sp.tab ?? "") ? sp.tab! : "club";
  const days = [7, 14, 28].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const db = getDb();
  const today = todayLA();

  const [dropIns, scope, members, openCounts] = await Promise.all([
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
    lists ? opsOpenCounts(db) : null,
  ]);
  const flexToday = dropIns.filter((d) => d.date === today).length;
  const activeMembers = members.filter((r) => r.m.status === "active");
  const tabs = [
    { key: "club", label: "Club Yalla", href: "/admin/flex-club", count: members.length },
    { key: "flex", label: "Coming to Flex", href: "/admin/flex-club?tab=flex", count: dropIns.length },
    { key: "families", label: "Families", href: "/admin/flex-club?tab=families", count: scope.size },
    ...(openCounts
      ? [
          { key: "supplies", label: "Supplies", href: "/admin/flex-club?tab=supplies", count: openCounts.supply.n },
          { key: "maintenance", label: "Maintenance", href: "/admin/flex-club?tab=maintenance", count: openCounts.maintenance.n },
        ]
      : []),
  ];
  const list = tab === "supplies" || tab === "maintenance" ? await opsList(db, tab === "supplies" ? "supply" : "maintenance") : null;

  return (
    <>
      <PageHeader title="Club Yalla operations" subtitle="Club Yalla at a glance, who’s coming to Yalla Flex, every family’s contact card and forms, and what’s needed around the building." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Club Yalla members" value={activeMembers.length} sub={members.length > activeMembers.length ? `+ ${members.length - activeMembers.length} starting soon or paused` : "active"} href="/admin/flex-club" />
        <Stat label="Flex today" value={flexToday} sub={flexToday ? `${phaseText(flexDayWindow(today))} · Pacific` : fmtDate(today, "EEEE d MMMM")} href="/admin/flex-club?tab=flex" />
        {openCounts ? (
          <>
            <Stat label="Supplies needed" value={openCounts.supply.n} sub={openCounts.supply.urgent ? `${openCounts.supply.urgent} urgent` : "on the list"} href="/admin/flex-club?tab=supplies" tone={openCounts.supply.urgent ? "warning" : undefined} />
            <Stat label="Maintenance" value={openCounts.maintenance.n} sub={openCounts.maintenance.urgent ? `${openCounts.maintenance.urgent} urgent` : "open items"} href="/admin/flex-club?tab=maintenance" tone={openCounts.maintenance.urgent ? "critical" : undefined} />
          </>
        ) : (
          <>
            <Stat label={`Flex · next ${days} days`} value={dropIns.length} sub={`${new Set(dropIns.map((d) => d.child.id)).size} children`} href="/admin/flex-club?tab=flex" />
            <Stat label="Families" value={scope.size} sub="Club Yalla and Flex" href="/admin/flex-club?tab=families" />
          </>
        )}
      </div>
      <Tabs tabs={tabs} current={tab} />

      {tab === "flex" ? <FlexTab rows={dropIns} today={today} days={days} /> : null}
      {tab === "club" ? <ClubTab rows={members} today={today} /> : null}
      {tab === "families" ? <FamiliesTab scope={scope} q={(sp.q ?? "").trim()} /> : null}
      {list ? <OpsList kind={tab === "supplies" ? "supply" : "maintenance"} open={list.open} closed={list.closed} /> : null}
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
            href={`/admin/flex-club?tab=flex&days=${d}`}
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
                actions={
                  <span className="text-[0.8rem] text-ink-soft">
                    {date === today ? <span className={`mr-2 font-medium ${sessionPhase(flexDayWindow(date)) === "live" ? "text-[#2c6447]" : sessionPhase(flexDayWindow(date)) === "ended" ? "text-ink-soft" : "text-blue"}`}>{phaseText(flexDayWindow(date))} ·</span> : null}
                    {list.length} {list.length === 1 ? "child" : "children"}
                  </span>
                }
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

/** "7328743368" → "(732) 874-3368"; anything else is shown as entered. */
function phone(v: string) {
  const d = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v;
}

async function FamiliesTab({ scope, q }: { scope: Map<string, { flex: boolean; club: boolean }>; q: string }) {
  const today = todayLA();
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
              return (
                <li key={f.id}>
                  <Link href={`/admin/families/${f.id}`} className="grid gap-3 px-5 py-4 hover:bg-mist/30 sm:grid-cols-[1fr_1.5fr_1.1fr] sm:items-start">
                    <span>
                      <span className="block font-medium text-ink">{f.name}</span>
                      <span className="mt-1 flex gap-1.5">
                        {tags.flex ? <Pill tone="positive">Flex</Pill> : null}
                        {tags.club ? <Pill tone="info">Club Yalla</Pill> : null}
                      </span>
                    </span>
                    <span className="text-[0.82rem] text-ink-soft">
                      <span className="mb-1 block text-[0.66rem] font-semibold tracking-[0.12em] text-ink-soft/80 uppercase">{g.length > 1 ? "Parents" : "Parent"}</span>
                      {g.length ? (
                        g.slice(0, 2).map((x, i) => (
                          <span key={x.id} className={`block ${i ? "mt-1.5" : ""}`}>
                            <span className="block text-ink">
                              {x.firstName} {x.lastName}
                              {x.relationship && !/^(parent|guardian)$/i.test(x.relationship.trim()) ? <span className="text-ink-soft"> · {x.relationship}</span> : null}
                            </span>
                            {x.email}
                            {x.phone ? ` · ${phone(x.phone)}` : ""}
                          </span>
                        ))
                      ) : (
                        "No parent on file"
                      )}
                    </span>
                    <span className="text-[0.82rem] text-ink-soft">
                      <span className="mb-1 block text-[0.66rem] font-semibold tracking-[0.12em] text-ink-soft/80 uppercase">{k.length === 1 ? "Child" : "Children"}</span>
                      {k.length
                        ? k.map((c) => (
                            <span key={c.id} className="block">
                              <span className="text-ink">
                                {c.preferredName || c.firstName} {c.lastName}
                              </span>
                              <span> · {ageLabel(c.birthDate, today)}</span>
                            </span>
                          ))
                        : "—"}
                    </span>
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
