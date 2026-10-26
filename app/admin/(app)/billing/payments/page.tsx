import Link from "next/link";
import { Card, Empty, FilterBar, FilterField, inputCls, Money, PageHeader, Pill, Status, Table } from "@/components/admin/ui";
import { listPayments, periodFrom } from "@/lib/admin/queries/billing";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/time";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; from?: string; to?: string; period?: string; method?: string }> }) {
  await requirePermission("billing.view");
  const sp = await searchParams;
  const period = periodFrom(sp);
  const rows = await listPayments(getDb(), { status: sp.status ?? "all", period, method: sp.method || undefined });
  const succeeded = rows.filter((r) => r.p.status === "succeeded" && r.p.method !== "credit").reduce((s, r) => s + r.p.amountCents, 0);
  return (
    <>
      <PageHeader title="Payments" subtitle={`${fmtDate(period.from, "d MMM")} – ${fmtDate(period.to, "d MMM yyyy")} · ${(succeeded / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} collected in this view`} />
      <FilterBar action="/admin/billing/payments">
        <FilterField label="Status">
          <select name="status" defaultValue={sp.status ?? "all"} className={inputCls}>
            <option value="all">All</option>
            <option value="succeeded">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Abandoned</option>
          </select>
        </FilterField>
        <FilterField label="Method">
          <select name="method" defaultValue={sp.method ?? ""} className={inputCls}>
            <option value="">All methods</option>
            <option value="card">Card</option>
            <option value="offline_check">Check</option>
            <option value="offline_cash">Cash</option>
            <option value="offline_other">Other offline</option>
            <option value="credit">Account credit</option>
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
            <Empty title="No payments in this view" />
          </div>
        ) : (
          <Table head={["Started", "Family", "Invoice", "Method", "Amount", "Status", "Provider reference"]}>
            {rows.map(({ p, i, f }) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap">
                  {fmtDateTime(p.createdAt)}
                  {p.succeededAt ? <span className="block text-[0.75rem] text-ink-soft">Paid {fmtDateTime(p.succeededAt)}</span> : null}
                </td>
                <td>{f.name}</td>
                <td>
                  <Link className="text-blue hover:underline" href={`/admin/billing/invoices/${i.id}`}>
                    {i.number}
                  </Link>
                </td>
                <td className="text-ink-soft">{p.method === "card" ? `Card (${p.provider})` : p.method.replace("offline_", "").replace("credit", "account credit")}</td>
                <td className="font-medium">
                  <Money cents={p.amountCents} />
                </td>
                <td>
                  <span className="flex flex-wrap gap-1">
                    <Status kind="payment" value={p.status} />
                    {p.disputeStatus ? (
                      <Pill tone="critical" icon="alert">
                        Dispute
                      </Pill>
                    ) : null}
                  </span>
                  {p.failureReason ? <span className="mt-1 block text-[0.75rem] text-[#8a2333]">{p.failureReason}</span> : null}
                </td>
                <td className="max-w-[12rem] truncate text-[0.75rem] text-ink-soft">{p.status === "succeeded" ? p.providerRef : p.checkoutRef}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
