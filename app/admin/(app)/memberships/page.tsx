import Link from "next/link";
import { asc } from "drizzle-orm";
import { Card, Empty, FilterBar, FilterField, inputCls, LinkButton, Money, PageHeader, Status, Table } from "@/components/admin/ui";
import { membershipList } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";
import { WEEKDAY } from "@/lib/ops/memberships";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Club Yalla memberships" };

export default async function MembershipsPage({ searchParams }: { searchParams: Promise<{ status?: string; cohort?: string; weekday?: string; q?: string }> }) {
  const staff = await requirePermission("memberships.view");
  const sp = await searchParams;
  const db = getDb();
  const cohortRows = await db.select().from(cohorts).orderBy(asc(cohorts.sortOrder));
  const weekday = sp.weekday && /^[0-6]$/.test(sp.weekday) ? Number(sp.weekday) : undefined;
  const rows = await membershipList(db, { status: sp.status || undefined, cohortId: sp.cohort || undefined, weekday, q: sp.q?.slice(0, 60) || undefined });
  const money = can(staff, "billing.view");

  // Members per cohort per weekday (current filter set) — a quick occupancy picture.
  const grid = cohortRows.map((c) => ({ cohort: c, days: [1, 2, 3, 4, 5].map((d) => rows.filter((r) => r.co.id === c.id && r.m.weekdays.includes(d) && r.m.status !== "ended").length) }));

  return (
    <>
      <PageHeader
        title="Club Yalla memberships"
        subtitle="Recurring weekday memberships. Each member’s schedule reserves their place, so those spots aren’t sold as drop-in care."
        actions={can(staff, "memberships.manage") ? <LinkButton href="/admin/memberships/new" variant="primary">Start membership</LinkButton> : null}
      />
      <FilterBar action="/admin/memberships">
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Child or family" className={inputCls} />
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
            <option value="">Current (active, upcoming, paused)</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
          </select>
        </FilterField>
        <FilterField label="Cohort">
          <select name="cohort" defaultValue={sp.cohort ?? ""} className={inputCls}>
            <option value="">All cohorts</option>
            {cohortRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Weekday">
          <select name="weekday" defaultValue={sp.weekday ?? ""} className={inputCls}>
            <option value="">Any day</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {WEEKDAY[d]}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      <Card title="Members by cohort and weekday" className="mb-6" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[0.85rem]">
            <thead>
              <tr className="border-b border-ink/10 text-[0.72rem] tracking-[0.04em] text-ink-soft uppercase">
                <th className="px-5 py-2 text-left font-medium">Cohort</th>
                {[1, 2, 3, 4, 5].map((d) => (
                  <th key={d} className="px-3 py-2 text-center font-medium">
                    {WEEKDAY[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/6">
              {grid.map((g) => (
                <tr key={g.cohort.id}>
                  <td className="px-5 py-2.5">
                    {g.cohort.name} <span className="text-ink-soft">· max {g.cohort.maxSize ?? "—"}</span>
                  </td>
                  {g.days.map((n, i) => {
                    const full = g.cohort.maxSize != null && n >= g.cohort.maxSize;
                    return (
                      <td key={i} className={`px-3 py-2.5 text-center tabular-nums ${full ? "font-semibold text-[#8a2333]" : ""}`}>
                        {n}
                        {g.cohort.maxSize ? <span className="text-ink-soft">/{g.cohort.maxSize}</span> : null}
                        {full ? <span className="sr-only"> (full)</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink/8 px-5 py-2 text-[0.74rem] text-ink-soft">Counts reflect the filters above. Drop-in availability also depends on bookings and shared room capacity — see the schedule for exact remaining spots.</p>
      </Card>

      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty title="No memberships match these filters" />
          </div>
        ) : (
          <Table head={["Child", "Cohort", "Schedule", "Dates", ...(money ? ["Price"] : []), "Status"]}>
            {rows.map(({ m, c, f, co }) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/admin/memberships/${m.id}`} className="font-medium text-ink hover:text-blue">
                    {c.preferredName || c.firstName} {c.lastName}
                  </Link>
                  <span className="block text-[0.75rem] text-ink-soft">{f.name}</span>
                </td>
                <td>{co.name}</td>
                <td>
                  {m.weekdays.map((w) => WEEKDAY[w]).join(", ")}
                  <span className="block text-[0.75rem] text-ink-soft">
                    {m.dayLength === "half" ? "Half day 8:30–12:00" : "Full day 8:30–4:30"}
                    {m.earlyBird ? " · Early Bird 8:00" : ""}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  {fmtDate(m.startsOn, "d MMM yyyy")}
                  <span className="block text-[0.75rem] text-ink-soft">{m.endsOn ? `to ${fmtDate(m.endsOn, "d MMM yyyy")}` : "Ongoing"}</span>
                </td>
                {money ? (
                  <td className="whitespace-nowrap">
                    <Money cents={m.priceCents} />
                    <span className="block text-[0.75rem] text-ink-soft">{m.billingFrequency}</span>
                  </td>
                ) : null}
                <td>
                  <Status kind="membership" value={m.status} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
