import Link from "next/link";
import { Card, FilterBar, FilterField, inputCls, Money, Notice, PageHeader, Stat } from "@/components/admin/ui";
import { billingOverview, listInvoices, periodFrom } from "@/lib/admin/queries/billing";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { paymentsStatus } from "@/lib/payments/provider";
import { fmtDate } from "@/lib/time";
import { Status } from "@/components/admin/ui";

export const metadata = { title: "Billing" };

export default async function BillingOverview({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; period?: string }> }) {
  const staff = await requirePermission("billing.view");
  const sp = await searchParams;
  const period = periodFrom(sp);
  const db = getDb();
  const [o, recentOpen] = await Promise.all([billingOverview(db, period), listInvoices(db, { status: "open", limit: 8 })]);
  const pay = paymentsStatus();
  const range = `${fmtDate(period.from, "d MMM")} – ${fmtDate(period.to, "d MMM yyyy")}`;
  const qp = `from=${period.from}&to=${period.to}`;

  return (
    <>
      <PageHeader title="Billing" subtitle={`Money in, money out and what’s still owed · ${range}`} />
      <div className="mb-5">
        {pay.provider === "test" ? (
          <Notice tone="info" title="Test payments are active">
            Card payments use Yalla’s built-in test checkout — no real money moves. Connect Stripe (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET) to take real payments.{pay.problem ? ` ${pay.problem}` : ""}
          </Notice>
        ) : pay.live ? (
          <Notice tone="critical" title="Live payments">Stripe live mode — real cards are being charged.</Notice>
        ) : (
          <Notice tone="info" title="Stripe test mode">Payments go through Stripe’s test environment.</Notice>
        )}
      </div>
      <FilterBar action="/admin/billing">
        <FilterField label="From">
          <input type="date" name="from" defaultValue={period.from} className={inputCls} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={period.to} className={inputCls} />
        </FilterField>
      </FilterBar>

      <h2 className="mb-2 text-[0.72rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">In this period</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Payments collected" value={<Money cents={o.collected} />} sub={`${o.collectedCount} payment(s) · includes ${(o.offline / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} offline`} href={`/admin/billing/payments?status=succeeded&${qp}`} />
        <Stat label="Refunds issued" value={<Money cents={o.refunded} />} sub={`${o.refundedCount} completed${o.refundIssues ? ` · ${o.refundIssues} pending or failed` : ""}`} href={`/admin/billing/refunds?${qp}`} tone={o.refundIssues ? "warning" : undefined} />
        <Stat label="Net received" value={<Money cents={o.collected - o.refunded} />} sub="Payments collected minus refunds issued" />
      </div>

      <h2 className="mb-2 text-[0.72rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">Right now</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Unpaid invoices" value={<Money cents={o.unpaid} />} sub={`${o.unpaidCount} invoice(s) with a balance`} href="/admin/billing/invoices?status=open" tone={o.unpaid ? "warning" : undefined} />
        <Stat label="Failed payments" value={o.failedCount} sub={<Money cents={o.failed} />} href="/admin/billing/payments?status=failed&period=year" tone={o.failedCount ? "critical" : undefined} />
        <Stat label="Disputes" value={o.disputes} sub={o.disputes ? <Money cents={o.disputeAmount} /> : "None reported by the provider"} href="/admin/billing/payments?status=succeeded&period=year" tone={o.disputes ? "critical" : undefined} />
        <Stat label="Account credit held" value={<Money cents={o.credits} />} sub={`${o.creditFamilies} family(ies) · owed to families as credit`} href="/admin/billing/credits" />
        <Stat label="Scheduled charges" value={<Money cents={o.scheduled} />} sub={`${o.scheduledCount} membership charge(s) in the next 30 days — not yet invoiced`} href="/admin/billing/scheduled" />
      </div>

      {o.dueNowCount && can(staff, "billing.manage") ? (
        <div className="mb-6">
          <Notice tone="warning" title={`${o.dueNowCount} scheduled charge(s) are due now`}>
            <Link href="/admin/billing/scheduled" className="underline">
              Review and create invoices
            </Link>{" "}
            totalling <Money cents={o.dueNow} />.
          </Notice>
        </div>
      ) : null}

      <Card title="Oldest unpaid invoices" actions={<Link href="/admin/billing/invoices?status=open" className="text-blue">All unpaid →</Link>} padded={false}>
        {recentOpen.filter((r) => r.t.balance > 0).length === 0 ? (
          <p className="p-5 text-[0.85rem] text-ink-soft">Nothing outstanding.</p>
        ) : (
          <ul className="divide-y divide-ink/6">
            {recentOpen
              .filter((r) => r.t.balance > 0)
              .map((r) => (
                <li key={r.i.id}>
                  <Link href={`/admin/billing/invoices/${r.i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-mist/30">
                    <span className="min-w-0">
                      <span className="block truncate text-[0.88rem] text-ink">
                        {r.f.name} · {r.i.description}
                      </span>
                      <span className="text-[0.75rem] text-ink-soft">
                        {r.i.number} · issued {fmtDate(r.i.issuedAt.toISOString().slice(0, 10), "d MMM")}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <Money cents={r.t.balance} />
                      <Status kind="invoice" value={r.i.status} />
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </>
  );
}
