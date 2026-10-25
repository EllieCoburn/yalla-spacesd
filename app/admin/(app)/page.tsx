import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Capacity, Card, Empty, FilterBar, FilterField, inputCls, Money, PageHeader, Pill, Stat, Status } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { children, families, locations, programs } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { format } from "date-fns";
import { inLA } from "@/lib/time";
import { dashboard } from "@/lib/ops/dashboard";
import { addDaysISO, fmtDate, fmtDateTime, fmtTime, todayLA } from "@/lib/time";

export const metadata = { title: "Today" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ date?: string; program?: string; location?: string }> }) {
  const staff = await requirePermission("dashboard.view");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayLA();
  const db = getDb();
  const [progs, locs] = await Promise.all([db.select().from(programs).orderBy(asc(programs.name)), db.select().from(locations).where(eq(locations.active, true))]);
  const d = await dashboard(db, { date, programId: sp.program || undefined, locationId: sp.location || undefined }, { money: can(staff, "billing.view"), paperwork: can(staff, "forms.view") });
  const isToday = date === todayLA();
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(sp.program ? { program: sp.program } : {}), ...(sp.location ? { location: sp.location } : {}), ...extra })}`;
  const capacityTotal = d.today.filter((t) => t.program.kind !== "membership" || true).reduce((s, t) => s + t.availability.effectiveCapacity, 0);
  const checkedIn = d.today.reduce((s, t) => s + t.checkedIn, 0);
  const missingChildren = d.paperwork.filter((p) => p.childId).length;
  const kidIds = d.paperwork.map((p) => p.childId).filter(Boolean) as string[];
  const famIds = d.paperwork.map((p) => p.familyId);
  const kidNames = new Map((kidIds.length ? await db.select().from(children).where(inArray(children.id, kidIds)) : []).map((c) => [c.id, `${c.preferredName || c.firstName} ${c.lastName}`]));
  const famNames = new Map((famIds.length ? await db.select().from(families).where(inArray(families.id, famIds)) : []).map((f) => [f.id, f.name]));
  const hour = Number(format(new Date(), "H", { in: inLA }));

  return (
    <>
      <PageHeader
        title={isToday ? `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${staff.name.split(" ")[0]}` : fmtDate(date, "EEEE d MMMM")}
        subtitle={isToday ? `Here’s ${fmtDate(date, "EEEE d MMMM")} at Yalla.` : "Viewing another day."}
        actions={
          <div className="flex items-center gap-1">
            <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={q({ date: addDaysISO(date, -1) })} aria-label="Previous day">
              ←
            </Link>
            {!isToday ? (
              <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={q({})}>
                Today
              </Link>
            ) : null}
            <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.82rem] hover:border-ink/40" href={q({ date: addDaysISO(date, 1) })} aria-label="Next day">
              →
            </Link>
          </div>
        }
      />

      <FilterBar action="/admin">
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

      {/* Attention row */}
      {d.needsAttention.length || d.pendingRequests.length ? (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {d.needsAttention.length ? (
            <Link href="/admin/bookings?status=needs_attention" className="rounded-xl bg-[#f6e3e5] p-4 text-[#8a2333] ring-1 ring-[#8a2333]/20 ring-inset hover:ring-[#8a2333]/50">
              <p className="font-semibold">⚠ {d.needsAttention.length} booking{d.needsAttention.length === 1 ? "" : "s"} need attention</p>
              <p className="mt-1 text-[0.82rem]">Paid after the hold expired and the spot was no longer available. Move, refund or override each one.</p>
            </Link>
          ) : null}
          {d.pendingRequests.length ? (
            <Link href="/admin/bookings?status=requested" className="rounded-xl bg-[#f8eedd] p-4 text-[#8a5212] ring-1 ring-[#8a5212]/20 ring-inset hover:ring-[#8a5212]/50">
              <p className="font-semibold">◷ {d.pendingRequests.length} booking request{d.pendingRequests.length === 1 ? "" : "s"} awaiting approval</p>
              <p className="mt-1 text-[0.82rem]">Spots are held until you approve or decline.</p>
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Expected children" value={d.expectedChildren} sub={`${d.expectedFamilies} families · bookings and Club Yalla`} href={can(staff, "roster.view") ? `/admin/roster${q({ date })}` : undefined} />
        <Stat label="Checked in" value={`${checkedIn}`} sub={`of ${d.expectedChildren} expected · capacity ${capacityTotal}`} href={can(staff, "roster.view") ? `/admin/roster${q({ date })}` : undefined} />
        {can(staff, "forms.view") ? (
          <Stat
            label="Paperwork issues"
            value={missingChildren + d.paperwork.filter((p) => !p.childId).length}
            sub="Children & families attending in the next 7 days"
            href={`/admin/forms/outstanding?from=${date}`}
            tone={d.paperwork.length ? "warning" : undefined}
          />
        ) : null}
        <Stat label="Waitlisted" value={d.waiting} sub="Families waiting or holding an offer" href="/admin/waitlist" />
      </div>

      {d.money ? (
        <div className="mb-8">
          <h2 className="mb-2 text-[0.72rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">Money · {fmtDate(date, "MMMM yyyy")}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Payments collected" value={<Money cents={d.money.collected} />} sub="Received this month (excludes credit)" href="/admin/billing/payments?status=succeeded&period=month" />
            <Stat label="Refunds issued" value={<Money cents={d.money.refunded} />} sub="Completed this month" href="/admin/billing/refunds" />
            <Stat label="Unpaid invoices" value={<Money cents={d.money.unpaid} />} sub={`${d.money.unpaidCount} invoice(s) with a balance`} href="/admin/billing/invoices?status=open" tone={d.money.unpaid ? "warning" : undefined} />
            <Stat label="Failed payments" value={d.money.failed.count} sub={<Money cents={d.money.failed.amount} />} href="/admin/billing/payments?status=failed" tone={d.money.failed.count ? "critical" : undefined} />
            <Stat label="Scheduled charges" value={<Money cents={d.money.scheduled} />} sub="Membership charges due in the next 30 days (not yet invoiced)" href="/admin/billing/scheduled" />
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card title={`${isToday ? "Today’s" : fmtDate(date, "EEE d MMM")} sessions`} actions={can(staff, "roster.view") ? <Link href={`/admin/roster${q({ date })}`} className="text-blue">Open roster →</Link> : null} padded={false}>
            {d.today.length === 0 ? (
              <div className="p-5">
                <Empty title="No sessions on this day">Choose another date, or add sessions from the schedule.</Empty>
              </div>
            ) : (
              <ul className="divide-y divide-ink/6">
                {d.today.map((t) => (
                  <li key={t.session.id}>
                    <Link href={`/admin/sessions/${t.session.id}`} className="grid gap-3 px-5 py-3.5 transition-colors hover:bg-mist/30 sm:grid-cols-[6.5rem_1fr_9rem_7rem] sm:items-center">
                      <span className="text-[0.85rem] tabular-nums text-ink-soft">
                        {fmtTime(t.session.startsAt)}–{fmtTime(t.session.endsAt)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[0.9rem] font-medium text-ink">{t.session.title ?? t.program.name}</span>
                        <span className="text-[0.78rem] text-ink-soft">
                          {t.expected} expected · {t.checkedIn} in{t.absent ? ` · ${t.absent} absent` : ""}
                          {t.availability.occupancy.members ? ` · ${t.availability.occupancy.members} members` : ""}
                        </span>
                      </span>
                      <Capacity used={t.availability.occupancy.used} capacity={t.availability.effectiveCapacity} remaining={t.availability.remaining} />
                      <span className="sm:text-right">{t.session.status !== "scheduled" ? <Status kind="session" value={t.session.status} /> : null}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Nearly full · next 14 days" actions={<Link href="/admin/schedule" className="text-blue">Schedule →</Link>} padded={false}>
            {d.nearlyFull.length === 0 ? (
              <p className="p-5 text-[0.85rem] text-ink-soft">No bookable sessions are close to capacity.</p>
            ) : (
              <ul className="divide-y divide-ink/6">
                {d.nearlyFull.map((u) => (
                  <li key={u.s.id}>
                    <Link href={`/admin/sessions/${u.s.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-mist/30">
                      <span>
                        <span className="block text-[0.88rem] text-ink">{u.s.title ?? u.p.name}</span>
                        <span className="text-[0.78rem] text-ink-soft">
                          {fmtDate(u.s.localDate, "EEE d MMM")} · {fmtTime(u.s.startsAt)}
                        </span>
                      </span>
                      {u.a.remaining <= 0 ? <Pill tone="critical" icon="x">Full</Pill> : <Pill tone="warning" icon="alert">{u.a.remaining} left</Pill>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {d.paperwork.length ? (
            <Card title="Missing or incomplete paperwork" actions={<Link href={`/admin/forms/outstanding?from=${date}`} className="text-blue">All outstanding →</Link>} padded={false}>
              <ul className="divide-y divide-ink/6">
                {d.paperwork.slice(0, 8).map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <Link href={p.childId ? `/admin/children/${p.childId}#paperwork` : `/admin/families/${p.familyId}#paperwork`} className="text-[0.88rem] text-ink hover:text-blue">
                      <span className="font-medium">{p.childId ? kidNames.get(p.childId) : famNames.get(p.familyId)}</span>
                      <span className="text-ink-soft"> · {p.items.map((i) => i.title).join(", ")}</span>
                    </Link>
                    <span className="flex flex-wrap gap-1">
                      {p.items.map((i) => (
                        <Status key={i.templateId} kind="paperwork" value={i.state} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {can(staff, "bookings.view") ? (
            <Card title="New bookings · last 7 days" actions={<Link href="/admin/bookings" className="text-blue">All →</Link>} padded={false}>
              {d.recentBookings.length === 0 ? (
                <p className="p-5 text-[0.85rem] text-ink-soft">No new bookings.</p>
              ) : (
                <ul className="divide-y divide-ink/6">
                  {d.recentBookings.map(({ b, f }) => (
                    <li key={b.id}>
                      <Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-mist/30">
                        <span className="min-w-0">
                          <span className="block truncate text-[0.88rem] text-ink">{f.name}</span>
                          <span className="text-[0.75rem] text-ink-soft">
                            {b.reference} · {fmtDateTime(b.createdAt)}
                          </span>
                        </span>
                        <Status kind="booking" value={b.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
          {can(staff, "bookings.view") ? (
            <Card title="Recent cancellations" padded={false}>
              {d.recentCancellations.length === 0 ? (
                <p className="p-5 text-[0.85rem] text-ink-soft">None in the last 7 days.</p>
              ) : (
                <ul className="divide-y divide-ink/6">
                  {d.recentCancellations.map(({ b, f }) => (
                    <li key={b.id}>
                      <Link href={`/admin/bookings/${b.id}`} className="block px-5 py-3 hover:bg-mist/30">
                        <span className="block text-[0.88rem] text-ink">{f.name}</span>
                        <span className="text-[0.75rem] text-ink-soft">
                          {b.reference} · {b.cancelReason}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
          <Card title="Recent activity" actions={can(staff, "audit.view") ? <Link href="/admin/audit" className="text-blue">Audit trail →</Link> : null} padded={false}>
            <ul className="divide-y divide-ink/6">
              {d.activity.map((a) => (
                <li key={a.id} className="px-5 py-2.5">
                  <p className="text-[0.84rem] text-ink">{a.summary}</p>
                  <p className="text-[0.72rem] text-ink-soft">
                    {a.actorName} · {fmtDateTime(a.at)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
