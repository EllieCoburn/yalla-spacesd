import Link from "next/link";
import { BlackoutForm } from "@/components/admin/programs/BlackoutForm";
import { SessionCreator } from "@/components/admin/programs/SessionCreator";
import { Disclosure } from "@/components/admin/forms";
import { Capacity, Card, Empty, FilterBar, FilterField, inputCls, PageHeader, Pill, Status } from "@/components/admin/ui";
import { blackoutList, referenceData, scheduleRange } from "@/lib/admin/queries/programs";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { addDaysISO, eachDate, fmtDate, fmtTime, todayLA, weekdayOf } from "@/lib/time";

export const metadata = { title: "Schedule" };

type SP = { date?: string; view?: string; program?: string; location?: string; cohort?: string };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requirePermission("programs.view");
  const sp = await searchParams;
  const db = getDb();
  const today = todayLA();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const view = sp.view === "day" ? "day" : "week";
  const monday = addDaysISO(anchor, -((weekdayOf(anchor) + 6) % 7));
  const from = view === "day" ? anchor : monday;
  const to = view === "day" ? anchor : addDaysISO(monday, 6);
  const filters = { programId: sp.program || undefined, locationId: sp.location || undefined, cohortId: sp.cohort || undefined };
  const [ref, rows, blackouts] = await Promise.all([referenceData(db), scheduleRange(db, from, to, filters), blackoutList(db)]);
  const days = eachDate(from, to);
  const step = view === "day" ? 1 : 7;
  const qs = (extra: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/admin/schedule?${p}`;
  };
  const canSchedule = can(staff, "schedule.manage");
  const activePrograms = ref.programs.filter((p) => p.status !== "archived");
  const blackoutDays = new Set(blackouts.flatMap(({ b }) => eachDate(b.startsOn < from ? from : b.startsOn, b.endsOn > to ? to : b.endsOn)).filter((d) => d >= from && d <= to));

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={view === "day" ? fmtDate(anchor, "EEEE d MMMM yyyy") : `Week of ${fmtDate(monday, "d MMMM yyyy")}`}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <div className="mr-2 inline-flex rounded-lg border border-ink/15 bg-white p-0.5" role="group" aria-label="View">
              {(["week", "day"] as const).map((v) => (
                <Link key={v} href={qs({ view: v === "week" ? undefined : "day" })} aria-current={view === v ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-[0.8rem] capitalize ${view === v ? "bg-ink text-chalk" : "text-ink-soft hover:text-ink"}`}>
                  {v}
                </Link>
              ))}
            </div>
            <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={qs({ date: addDaysISO(anchor, -step) })} aria-label={`Previous ${view}`}>
              ←
            </Link>
            <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={qs({ date: undefined })}>
              Today
            </Link>
            <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={qs({ date: addDaysISO(anchor, step) })} aria-label={`Next ${view}`}>
              →
            </Link>
          </div>
        }
      />

      <FilterBar action="/admin/schedule">
        {view === "day" ? <input type="hidden" name="view" value="day" /> : null}
        <FilterField label="Date">
          <input type="date" name="date" defaultValue={anchor} className={inputCls} />
        </FilterField>
        <FilterField label="Program">
          <select name="program" defaultValue={sp.program ?? ""} className={inputCls}>
            <option value="">All programs</option>
            {activePrograms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Cohort">
          <select name="cohort" defaultValue={sp.cohort ?? ""} className={inputCls}>
            <option value="">All cohorts</option>
            {ref.cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        {ref.locations.length > 1 ? (
          <FilterField label="Location">
            <select name="location" defaultValue={sp.location ?? ""} className={inputCls}>
              <option value="">All locations</option>
              {ref.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
      </FilterBar>

      <div className={`grid gap-3 ${view === "week" ? "md:grid-cols-2 xl:grid-cols-7" : ""}`}>
        {days.map((d) => {
          const list = rows.filter((r) => r.session.localDate === d);
          return (
            <section key={d} aria-labelledby={`day-${d}`} className={`min-w-0 rounded-xl border bg-[#fffefb] ${d === today ? "border-blue/50" : "border-ink/10"}`}>
              <header className="flex items-baseline justify-between gap-2 border-b border-ink/8 px-3 py-2.5">
                <h2 id={`day-${d}`} className="text-[0.85rem] font-semibold text-ink">
                  <Link href={qs({ view: "day", date: d })} className="hover:text-blue">
                    {fmtDate(d, "EEE d")}
                  </Link>
                </h2>
                <span className="flex items-center gap-1.5">
                  {d === today ? <Pill tone="info" icon="dot">Today</Pill> : null}
                  {blackoutDays.has(d) ? <Pill tone="warning" icon="minus">Closure</Pill> : null}
                </span>
              </header>
              {list.length === 0 ? (
                <p className="px-3 py-4 text-[0.78rem] text-ink-soft">No sessions</p>
              ) : (
                <ul className="divide-y divide-ink/6">
                  {list.map(({ session: s, program: p, availability: a }) => (
                    <li key={s.id}>
                      <Link href={`/admin/sessions/${s.id}`} className={`block px-3 py-2.5 transition-colors hover:bg-mist/40 ${s.status !== "scheduled" ? "opacity-70" : ""}`}>
                        <span className="block text-[0.72rem] tabular-nums text-ink-soft">
                          {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
                        </span>
                        <span className="block truncate text-[0.84rem] font-medium text-ink">{s.title ?? p.name}</span>
                        {s.status === "scheduled" ? (
                          <span className="mt-1.5 block">
                            <Capacity used={a.occupancy.used} capacity={a.effectiveCapacity} remaining={a.remaining} />
                          </span>
                        ) : (
                          <span className="mt-1 block">
                            <Status kind="session" value={s.status} />
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <Empty title={`No sessions this ${view}`}>{canSchedule ? "Add sessions below, or change the filters." : "Change the filters or the date."}</Empty>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        {canSchedule ? (
          <Card title="Add sessions">
            <SessionCreator
              today={anchor >= today ? anchor : today}
              programs={activePrograms.map((p) => ({ id: p.id, name: p.name, defaultCapacity: p.defaultCapacity, seriesMode: p.seriesMode, locationId: p.locationId }))}
              locations={ref.locations}
              cohorts={ref.cohorts}
              pools={ref.pools}
            />
          </Card>
        ) : null}
        <Card title="Closures & blackout dates">
          {blackouts.length === 0 ? (
            <p className="mb-4 text-[0.85rem] text-ink-soft">No upcoming closures.</p>
          ) : (
            <ul className="mb-5 divide-y divide-ink/6 rounded-lg border border-ink/10">
              {blackouts.map(({ b, p, l }) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[0.85rem]">
                  <span>
                    <span className="block font-medium text-ink">{b.reason}</span>
                    <span className="text-[0.78rem] text-ink-soft">
                      {b.startsOn === b.endsOn ? fmtDate(b.startsOn) : `${fmtDate(b.startsOn, "EEE d MMM")} – ${fmtDate(b.endsOn)}`} · {p?.name ?? "All programs"}
                      {l ? ` · ${l.name}` : ""}
                    </span>
                  </span>
                  <Link href={qs({ date: b.startsOn, view: undefined })} className="text-[0.8rem] text-blue hover:underline">
                    View week
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {canSchedule ? (
            <Disclosure label="Add a closure" defaultOpen={blackouts.length === 0}>
              <BlackoutForm programs={activePrograms.map((p) => ({ id: p.id, name: p.name }))} locations={ref.locations.map((l) => ({ id: l.id, name: l.name }))} />
            </Disclosure>
          ) : null}
        </Card>
      </div>
    </>
  );
}
