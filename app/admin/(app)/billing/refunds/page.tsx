import Link from "next/link";
import { Card, Empty, FilterBar, FilterField, inputCls, Money, Notice, PageHeader, Status, Table } from "@/components/admin/ui";
import { listRefunds, periodFrom } from "@/lib/admin/queries/billing";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/time";

export const metadata = { title: "Refunds" };

export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ status?: string; from?: string; to?: string; period?: string }> }) {
  await requirePermission("billing.view");
  const sp = await searchParams;
  const period = periodFrom(sp.from ? sp : { ...sp, period: sp.period ?? "year" });
  const rows = await listRefunds(getDb(), period, sp.status ?? "all");
  const issues = rows.filter((r) => r.r.status !== "succeeded");
  return (
    <>
      <PageHeader title="Refunds" subtitle={`${fmtDate(period.from, "d MMM yyyy")} – ${fmtDate(period.to, "d MMM yyyy")}`} />
      {issues.length ? (
        <div className="mb-5">
          <Notice tone="warning" title={`${issues.length} refund(s) need follow-up`}>
            Failed refunds didn’t move any money and left the invoice unchanged; retry from the invoice. Pending refunds are waiting on the provider.
          </Notice>
        </div>
      ) : null}
      <FilterBar action="/admin/billing/refunds">
        <FilterField label="Status">
          <select name="status" defaultValue={sp.status ?? "all"} className={inputCls}>
            <option value="all">All</option>
            <option value="succeeded">Refunded</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </FilterField>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={period.from} className={inputCls} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={period.to} className={inputCls} />
        </FilterField>
      </FilterBar>
      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty title="No refunds in this period" />
          </div>
        ) : (
          <Table head={["Requested", "Family", "Invoice", "Amount", "Reason", "Status", "By"]}>
            {rows.map(({ r, i, f }) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                <td>{f.name}</td>
                <td>
                  <Link className="text-blue hover:underline" href={`/admin/billing/invoices/${i.id}`}>
                    {i.number}
                  </Link>
                </td>
                <td className="font-medium">
                  <Money cents={r.amountCents} />
                </td>
                <td>
                  {r.reason}
                  {r.failureReason ? <span className="block text-[0.75rem] text-[#8a2333]">{r.failureReason}</span> : null}
                </td>
                <td>
                  <Status kind="refund" value={r.status} />
                </td>
                <td className="text-ink-soft">{r.requestedBy}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
