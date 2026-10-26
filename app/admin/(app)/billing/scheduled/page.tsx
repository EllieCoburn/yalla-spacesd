import Link from "next/link";
import { ActionForm, Disclosure, TextField } from "@/components/admin/forms";
import { Card, Empty, FilterBar, FilterField, inputCls, Money, Notice, PageHeader, Pill, Table } from "@/components/admin/ui";
import { listScheduled } from "@/lib/admin/queries/billing";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { fmtDate, todayLA } from "@/lib/time";
import { invoiceDueAction, skipChargeAction } from "../actions";

export const metadata = { title: "Scheduled charges" };

export default async function ScheduledPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const staff = await requirePermission("billing.view");
  const sp = await searchParams;
  const status = sp.status ?? "scheduled";
  const rows = await listScheduled(getDb(), status);
  const today = todayLA();
  const due = rows.filter((r) => r.c.status === "scheduled" && r.c.scheduledFor <= today);
  const manage = can(staff, "billing.manage");
  return (
    <>
      <PageHeader
        title="Scheduled charges"
        subtitle="Upcoming Club Yalla membership charges. They aren’t owed until they’re turned into invoices, and nothing is charged to a card automatically."
      />
      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <Notice tone={due.length ? "warning" : "info"} title={due.length ? `${due.length} charge(s) are due` : "Nothing is due yet"}>
          {due.length ? (
            <>
              Totalling <Money cents={due.reduce((s, r) => s + r.c.amountCents, 0)} />. Creating invoices is safe to repeat — each charge is invoiced at most once.
            </>
          ) : (
            "Charges appear here when memberships are created. Automatic card billing needs Stripe subscriptions and a decision on billing policy."
          )}
        </Notice>
        {manage ? (
          <Card className="lg:w-80">
            <ActionForm action={invoiceDueAction} submit={{ label: "Create invoices for due charges", pending: "Creating…" }}>
              <label className="block text-[0.8rem] font-medium">
                Include charges due on or before
                <input type="date" name="through" defaultValue={today} className={`${inputCls} mt-1.5`} />
              </label>
            </ActionForm>
          </Card>
        ) : null}
      </div>
      <FilterBar action="/admin/billing/scheduled">
        <FilterField label="Status">
          <select name="status" defaultValue={status} className={inputCls}>
            <option value="scheduled">Scheduled</option>
            <option value="invoiced">Invoiced</option>
            <option value="skipped">Skipped</option>
            <option value="all">All</option>
          </select>
        </FilterField>
      </FilterBar>
      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty title="No charges in this view" />
          </div>
        ) : (
          <Table head={["Date", "Family", "Description", "Amount", "Status", ""]}>
            {rows.map(({ c, f }) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">
                  {fmtDate(c.scheduledFor, "EEE d MMM yyyy")}
                  {c.status === "scheduled" && c.scheduledFor <= today ? (
                    <span className="ml-2">
                      <Pill tone="warning" icon="clock">
                        Due
                      </Pill>
                    </span>
                  ) : null}
                </td>
                <td>
                  <Link className="hover:text-blue" href={`/admin/families/${f.id}`}>
                    {f.name}
                  </Link>
                </td>
                <td>{c.description}</td>
                <td className="font-medium">
                  <Money cents={c.amountCents} />
                </td>
                <td>
                  {c.status === "invoiced" && c.invoiceId ? (
                    <Link href={`/admin/billing/invoices/${c.invoiceId}`} className="text-blue hover:underline">
                      Invoiced →
                    </Link>
                  ) : (
                    <Pill tone={c.status === "skipped" ? "muted" : "info"} icon={c.status === "skipped" ? "x" : "clock"}>
                      {c.status === "skipped" ? "Skipped" : "Scheduled"}
                    </Pill>
                  )}
                </td>
                <td className="min-w-[12rem]">
                  {manage && c.status === "scheduled" ? (
                    <Disclosure label="Skip">
                      <ActionForm action={skipChargeAction} submit={{ label: "Skip charge", variant: "secondary" }}>
                        <input type="hidden" name="chargeId" value={c.id} />
                        <TextField name="reason" label="Reason" required />
                      </ActionForm>
                    </Disclosure>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
