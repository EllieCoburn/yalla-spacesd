import Link from "next/link";
import { Card, Empty, FilterBar, FilterField, inputCls, Money, PageHeader, Status, Table } from "@/components/admin/ui";
import { listInvoices } from "@/lib/admin/queries/billing";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string; family?: string }> }) {
  await requirePermission("billing.view");
  const sp = await searchParams;
  const rows = await listInvoices(getDb(), { status: sp.status ?? "all", q: sp.q, from: sp.from, to: sp.to, familyId: sp.family });
  const totalBalance = rows.reduce((s, r) => s + (r.i.status === "open" ? Math.max(r.t.balance, 0) : 0), 0);
  return (
    <>
      <PageHeader title="Invoices" subtitle={`${rows.length} invoice(s)${totalBalance ? ` · ${(totalBalance / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} outstanding in this view` : ""}`} />
      <FilterBar action="/admin/billing/invoices">
        <FilterField label="Status">
          <select name="status" defaultValue={sp.status ?? "all"} className={inputCls}>
            <option value="all">All</option>
            <option value="open">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </FilterField>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Family, invoice number…" className={inputCls} />
        </FilterField>
        <FilterField label="Issued from">
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={inputCls} />
        </FilterField>
        <FilterField label="Issued to">
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={inputCls} />
        </FilterField>
        {sp.family ? <input type="hidden" name="family" value={sp.family} /> : null}
      </FilterBar>
      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty title="No invoices match">Try a different status or date range.</Empty>
          </div>
        ) : (
          <Table head={["Invoice", "Family", "For", "Issued", "Total", "Paid (net)", "Balance", "Status"]}>
            {rows.map(({ i, f, t }) => (
              <tr key={i.id}>
                <td>
                  <Link href={`/admin/billing/invoices/${i.id}`} className="font-medium text-ink hover:text-blue">
                    {i.number}
                  </Link>
                </td>
                <td>{f.name}</td>
                <td className="max-w-[16rem] truncate text-ink-soft">{i.description}</td>
                <td className="whitespace-nowrap text-ink-soft">{fmtDate(i.issuedAt.toISOString().slice(0, 10), "d MMM yyyy")}</td>
                <td>
                  <Money cents={t.total} />
                </td>
                <td>
                  <Money cents={t.paid + t.creditApplied - t.refunded} muted />
                </td>
                <td className="font-medium">
                  <Money cents={i.status === "void" ? 0 : t.balance} />
                </td>
                <td>
                  <Status kind="invoice" value={i.status} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
