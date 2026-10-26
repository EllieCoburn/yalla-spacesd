import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { RosterCard } from "@/components/admin/roster/RosterCard";
import { Capacity, Card, Empty, FilterBar, FilterField, inputCls, LinkButton, Notice, PageHeader, Status } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { locations, programs } from "@/lib/db/schema";
import { roster } from "@/lib/ops/attendance";
import { daySessions } from "@/lib/ops/dashboard";
import { addDaysISO, fmtDate, fmtTime, todayLA } from "@/lib/time";

export const metadata = { title: "Roster" };

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ date?: string; program?: string; location?: string; session?: string }> }) {
  const staff = await requirePermission("roster.view");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayLA();
  const db = getDb();
  const [progs, locs] = await Promise.all([db.select().from(programs).orderBy(asc(programs.name)), db.select().from(locations).where(eq(locations.active, true))]);
  const list = await daySessions(db, { date, programId: sp.program || undefined, locationId: sp.location || undefined });
  const selectedId = sp.session && list.some((l) => l.session.id === sp.session) ? sp.session : list.find((l) => l.expected > 0)?.session.id ?? list[0]?.session.id;
  const r = selectedId ? await roster(db, selectedId, staff.permissions) : null;
  const q = (extra: Record<string, string>) =>
    `/admin/roster?${new URLSearchParams({ date, ...(sp.program ? { program: sp.program } : {}), ...(sp.location ? { location: sp.location } : {}), ...extra })}`;
  const expected = r?.children.filter((c) => c.expected || c.attendance?.status === "checked_in" || c.attendance?.status === "checked_out") ?? [];
  const notExpected = r?.children.filter((c) => !expected.includes(c)) ?? [];
  const canManage = can(staff, "attendance.manage");

  return (
    <>
      <PageHeader
        title="Roster"
        subtitle={fmtDate(date, "EEEE d MMMM yyyy")}
        actions={
          <div className="flex items-center gap-1">
            <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={q({ date: addDaysISO(date, -1) })} aria-label="Previous day">
              ←
            </Link>
            {date !== todayLA() ? (
              <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={q({ date: todayLA() })}>
                Today
              </Link>
            ) : null}
            <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={q({ date: addDaysISO(date, 1) })} aria-label="Next day">
              →
            </Link>
          </div>
        }
      />
      <FilterBar action="/admin/roster">
        <FilterField label="Date">
          <input type="date" name="date" defaultValue={date} className={inputCls} />
        </FilterField>
        <FilterField label="Program">
          <select name="program" defaultValue={sp.program ?? ""} className={inputCls}>
            <option value="">All programs</option>
            {progs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FilterField>
        {locs.length > 1 ? (
          <FilterField label="Location">
            <select name="location" defaultValue={sp.location ?? ""} className={inputCls}>
              <option value="">All locations</option>
              {locs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
      </FilterBar>

      {list.length === 0 ? (
        <Empty title="No sessions on this day">Pick another date to see its roster.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Sessions" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-2 lg:px-0">
            {list.map((l) => (
              <Link
                key={l.session.id}
                href={q({ session: l.session.id })}
                aria-current={l.session.id === selectedId ? "page" : undefined}
                className={`block min-w-[14rem] shrink-0 rounded-xl border p-3 transition-colors lg:min-w-0 ${l.session.id === selectedId ? "border-ink bg-white shadow-sm" : "border-ink/10 bg-[#fffefb] hover:border-ink/30"}`}
              >
                <span className="block text-[0.9rem] font-medium text-ink">{l.session.title ?? l.program.name}</span>
                <span className="block text-[0.78rem] text-ink-soft tabular-nums">
                  {fmtTime(l.session.startsAt)}–{fmtTime(l.session.endsAt)} · {l.checkedIn}/{l.expected} in
                </span>
                {l.session.status !== "scheduled" ? (
                  <span className="mt-1 block">
                    <Status kind="session" value={l.session.status} />
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          {r ? (
            <section aria-labelledby="roster-title">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="roster-title" className="font-serif text-[1.5rem] text-ink">
                    {r.session.title ?? r.program.name}
                  </h2>
                  <p className="text-[0.85rem] text-ink-soft">
                    {fmtTime(r.session.startsAt)}–{fmtTime(r.session.endsAt)} · {expected.length} expected · {expected.filter((c) => c.attendance?.status === "checked_in").length} here now ·{" "}
                    {expected.filter((c) => c.attendance?.status === "checked_out").length} gone home
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LinkButton href={`/admin/roster/${r.session.id}/print`}>Print</LinkButton>
                  <a className="inline-flex h-9 items-center rounded-lg border border-ink/15 bg-white px-3.5 text-[0.84rem] font-medium hover:border-ink/40" href={`/admin/export/roster/${r.session.id}`}>
                    Export CSV
                  </a>
                </div>
              </div>
              {!can(staff, "children.care") ? (
                <div className="mb-4">
                  <Notice tone="info">Allergy, care and departure details are hidden for your role.</Notice>
                </div>
              ) : null}
              {r.session.status !== "scheduled" ? (
                <div className="mb-4">
                  <Notice tone="warning" title={`This session is ${r.session.status}`}>
                    {r.session.notes ?? "Bookings on this date need follow-up."}
                  </Notice>
                </div>
              ) : null}
              {expected.length === 0 ? (
                <Card>
                  <Empty title="No children expected">Bookings and Club Yalla members for this session will appear here.</Empty>
                </Card>
              ) : (
                <ul className="grid gap-3 xl:grid-cols-2">
                  {expected.map((c) => (
                    <RosterCard key={c.childId} c={c} sessionId={r.session.id} canManage={canManage} showBookings={can(staff, "bookings.view")} />
                  ))}
                </ul>
              )}
              {notExpected.length ? (
                <details className="mt-6">
                  <summary className="cursor-pointer text-[0.9rem] font-medium text-ink">Absences & cancellations ({notExpected.length})</summary>
                  <ul className="mt-3 grid gap-3 xl:grid-cols-2">
                    {notExpected.map((c) => (
                      <RosterCard key={c.childId} c={c} sessionId={r.session.id} canManage={canManage && (c.source === "membership" || c.notExpectedReason === "Absent")} showBookings={can(staff, "bookings.view")} />
                    ))}
                  </ul>
                </details>
              ) : null}
              <div className="mt-6 max-w-sm">
                <Capacity
                  used={list.find((l) => l.session.id === r.session.id)!.availability.occupancy.used}
                  capacity={list.find((l) => l.session.id === r.session.id)!.availability.effectiveCapacity}
                  remaining={list.find((l) => l.session.id === r.session.id)!.availability.remaining}
                />
              </div>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
