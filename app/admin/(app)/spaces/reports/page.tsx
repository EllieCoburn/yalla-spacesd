import { Card, FilterBar, FilterField, inputCls, Money, PageHeader, Stat, Table } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { spaceReport } from "@/lib/spaces/admin";
import { addDaysISO, fmtDate, todayLA } from "@/lib/time";

export const metadata = { title: "Workspace reports" };

export default async function SpaceReports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const staff = await requirePermission("spaces.view");
  const sp = await searchParams;
  const today = todayLA();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.from && iso.test(sp.from) ? sp.from : addDaysISO(today, -29);
  let to = sp.to && iso.test(sp.to) ? sp.to : today;
  if (to < from) to = from;
  if (to > addDaysISO(from, 366)) to = addDaysISO(from, 366);
  const r = await spaceReport(getDb(), from, to);
  const money = can(staff, "reports.financial") || can(staff, "billing.view");
  const top = r.byWorkspace.filter((w) => w.bookings > 0).slice(0, 3);

  return (
    <>
      <PageHeader back={{ href: "/admin/spaces", label: "Space reservations" }} title="Workspace reports" subtitle={`${fmtDate(from, "d MMM yyyy")} – ${fmtDate(to, "d MMM yyyy")}`} />
      <FilterBar action="/admin/spaces/reports">
        <FilterField label="From">
          <input type="date" name="from" defaultValue={from} className={inputCls} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={to} className={inputCls} />
        </FilterField>
      </FilterBar>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Total bookings" value={r.total} sub="including cancelled" />
        <Stat label="Complimentary" value={r.complimentary} />
        <Stat label="Paid" value={r.paid} />
        {money ? <Stat label="Revenue" value={<Money cents={r.revenueCents} />} sub="confirmed reservations" /> : null}
        <Stat label="Cancellations" value={r.cancelled} sub={`${r.cancellationRate}% of bookings`} />
        <Stat label="Most booked" value={top[0]?.name ?? "—"} sub={top.slice(1).map((t) => t.name).join(", ") || undefined} />
      </div>
      <Card title="By workspace" padded={false}>
        <Table head={["Workspace", "Bookings", "Hours reserved", "Utilization", ...(money ? ["Revenue"] : [])]}>
          {r.byWorkspace.map((w) => (
            <tr key={w.id}>
              <td className="font-medium">{w.name}</td>
              <td className="tabular-nums">{w.bookings}</td>
              <td className="tabular-nums">{w.hours}</td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/8" role="img" aria-label={`${w.utilization}% utilized`}>
                    <div className="h-full rounded-full bg-blue" style={{ width: `${Math.min(100, w.utilization)}%` }} />
                  </div>
                  <span className="tabular-nums">{w.utilization}%</span>
                </div>
              </td>
              {money ? (
                <td>
                  <Money cents={w.revenueCents} />
                </td>
              ) : null}
            </tr>
          ))}
        </Table>
        <p className="px-5 py-3 text-[0.75rem] text-ink-soft">Utilization compares reserved hours with house opening hours in the range.</p>
      </Card>
    </>
  );
}
