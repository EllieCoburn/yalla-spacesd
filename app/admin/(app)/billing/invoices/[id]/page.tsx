import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Disclosure, MoneyField, SelectField, TextField } from "@/components/admin/forms";
import { RefundForm } from "@/components/admin/billing/RefundForm";
import { Card, DL, Money, Notice, PageHeader, Pill, Status, Table } from "@/components/admin/ui";
import { invoiceDetail } from "@/lib/admin/queries/billing";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { adjustmentAction, applyCreditAction, offlinePaymentAction, paymentLinkAction, voidAction } from "../../actions";

export const metadata = { title: "Invoice" };

const kindLabel: Record<string, string> = { charge: "Charge", discount: "Discount", fee: "Fee", tax: "Tax", adjustment: "Adjustment" };
const methodLabel = (m: string, provider: string) =>
  m === "card" ? `Card · ${provider === "test" ? "test checkout" : provider}` : m === "credit" ? "Account credit" : m === "offline_cash" ? "Cash" : m === "offline_check" ? "Check" : "Other offline";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("billing.view");
  const { id } = await params;
  const d = await invoiceDetail(getDb(), id);
  if (!d) notFound();
  const { invoice: i, totals: t } = d;
  const manage = can(staff, "billing.manage");
  const refund = can(staff, "billing.refund");
  const refundedByPayment = new Map<string, number>();
  for (const r of d.refunds) if (r.status === "succeeded" || r.status === "pending") refundedByPayment.set(r.paymentId, (refundedByPayment.get(r.paymentId) ?? 0) + r.amountCents);
  const open = i.status === "open";
  const pendingCheckout = d.payments.find((p) => p.status === "pending");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/billing/invoices", label: "Invoices" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {i.number} <Status kind="invoice" value={i.status} />
          </span>
        }
        subtitle={
          <>
            <Link href={`/admin/families/${d.family.id}`} className="text-blue hover:underline">
              {d.family.name}
            </Link>{" "}
            · {i.description} · issued {fmtDateTime(i.issuedAt)}
            {i.dueOn ? ` · due ${fmtDate(i.dueOn)}` : ""}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card title="Line items" padded={false}>
            <Table head={["Type", "Description", "Qty", "Unit", "Amount", "Added"]} dense>
              {d.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Pill tone={l.kind === "adjustment" ? "info" : l.kind === "discount" ? "positive" : "neutral"}>{kindLabel[l.kind] ?? l.kind}</Pill>
                  </td>
                  <td>{l.description}</td>
                  <td className="tabular-nums">{l.quantity}</td>
                  <td>
                    <Money cents={l.unitCents} muted />
                  </td>
                  <td className="font-medium">
                    <Money cents={l.amountCents} />
                  </td>
                  <td className="text-[0.75rem] whitespace-nowrap text-ink-soft">
                    {l.createdBy ?? ""} · {fmtDate(l.createdAt.toISOString().slice(0, 10), "d MMM")}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Payments" padded={false}>
            {d.payments.length === 0 ? (
              <p className="p-5 text-[0.85rem] text-ink-soft">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-ink/6">
                {d.payments.map((p) => {
                  const refunded = refundedByPayment.get(p.id) ?? 0;
                  const refundable = p.amountCents - refunded;
                  return (
                    <li key={p.id} className="space-y-3 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[0.9rem] font-medium text-ink">
                            <Money cents={p.amountCents} /> · {methodLabel(p.method, p.provider)}
                          </p>
                          <p className="text-[0.75rem] text-ink-soft">
                            Started {fmtDateTime(p.createdAt)}
                            {p.succeededAt ? ` · paid ${fmtDateTime(p.succeededAt)}` : ""}
                            {p.failedAt ? ` · failed ${fmtDateTime(p.failedAt)}` : ""}
                            {p.recordedBy ? ` · recorded by ${p.recordedBy}` : ""}
                          </p>
                          <p className="text-[0.75rem] break-all text-ink-soft">
                            Provider reference: {p.method === "card" ? (p.status === "succeeded" ? (p.providerRef ?? "—") : (p.checkoutRef ?? "—")) : (p.providerRef ?? "—")}
                          </p>
                          {p.failureReason ? <p className="mt-1 text-[0.8rem] text-[#8a2333]">Reason: {p.failureReason}</p> : null}
                          {p.disputeStatus ? (
                            <p className="mt-1">
                              <Pill tone="critical" icon="alert">
                                Dispute: {p.disputeStatus.replace(/_/g, " ")}
                              </Pill>
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Status kind="payment" value={p.status} />
                          {refunded ? (
                            <span className="text-[0.75rem] text-ink-soft">
                              <Money cents={refunded} /> refunded
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {refund && p.status === "succeeded" && refundable > 0 ? (
                        <Disclosure label={`Refund this payment (up to $${(refundable / 100).toFixed(2)})`}>
                          <RefundForm paymentId={p.id} maxCents={refundable} label={methodLabel(p.method, p.provider).toLowerCase()} />
                        </Disclosure>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Refunds" padded={false}>
            {d.refunds.length === 0 ? (
              <p className="p-5 text-[0.85rem] text-ink-soft">No refunds.</p>
            ) : (
              <Table head={["Requested", "Amount", "Reason", "Status", "Provider reference", "By"]} dense>
                {d.refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                    <td>
                      <Money cents={r.amountCents} />
                    </td>
                    <td>
                      {r.reason}
                      {r.failureReason ? <span className="block text-[0.78rem] text-[#8a2333]">{r.failureReason}</span> : null}
                    </td>
                    <td>
                      <Status kind="refund" value={r.status} />
                    </td>
                    <td className="text-[0.78rem] break-all text-ink-soft">{r.providerRef ?? "—"}</td>
                    <td className="text-ink-soft">{r.requestedBy}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Summary">
            <dl className="space-y-2 text-[0.9rem]">
              {[
                ["Charges & fees", t.charges],
                ["Discounts", t.discounts],
                ["Tax", t.tax],
                ["Adjustments", t.adjustments],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd>
                    <Money cents={v as number} />
                  </dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-ink/10 pt-2 font-medium">
                <dt>Total due</dt>
                <dd>
                  <Money cents={t.total} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Amount paid</dt>
                <dd>
                  <Money cents={t.paid} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Credit applied</dt>
                <dd>
                  <Money cents={t.creditApplied} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Amount refunded</dt>
                <dd>
                  <Money cents={t.refunded} />
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink/10 pt-2 text-[1.05rem] font-semibold">
                <dt>Remaining balance</dt>
                <dd>
                  <Money cents={i.status === "void" ? 0 : t.balance} />
                </dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-ink/10 pt-4">
              <DL
                cols={1}
                items={[
                  { label: "Related booking", value: d.booking ? <Link className="text-blue hover:underline" href={`/admin/bookings/${d.booking.id}`}>{d.booking.reference}</Link> : null },
                  {
                    label: "Related membership",
                    value: d.membership ? (
                      <Link className="text-blue hover:underline" href={`/admin/memberships/${d.membership.m.id}`}>
                        Club Yalla · {d.membership.c.preferredName || d.membership.c.firstName}
                      </Link>
                    ) : null,
                  },
                  { label: "Family credit available", value: <Money cents={d.credit} /> },
                  { label: "Billing contacts", value: d.guardians.filter((g) => g.canViewBilling || g.isPrimary).map((g) => `${g.firstName} ${g.lastName} (${g.email})`).join(", ") || "—" },
                ]}
              />
            </div>
          </Card>

          {t.balance < 0 && i.status !== "void" ? (
            <Notice tone="warning" title="Overpaid">
              The family has paid <Money cents={-t.balance} /> more than is owed. Refund the difference or grant it as account credit — nothing happens automatically.
            </Notice>
          ) : null}

          {manage && open ? (
            <Card title="Take payment">
              <div className="space-y-3">
                {pendingCheckout ? (
                  <p className="text-[0.82rem] text-ink-soft">
                    A checkout for <Money cents={pendingCheckout.amountCents} /> is open (started {fmtDateTime(pendingCheckout.createdAt)}). Paid status updates only when the provider confirms it.
                  </p>
                ) : null}
                <ActionForm action={paymentLinkAction} submit={{ label: "Send payment link", variant: "secondary", pending: "Sending…" }}>
                  <input type="hidden" name="invoiceId" value={i.id} />
                  <p className="text-[0.82rem] text-ink-soft">Emails a secure checkout link for the remaining balance to the family’s billing contacts.</p>
                </ActionForm>
                <Disclosure label="Record an approved offline payment">
                  <ActionForm action={offlinePaymentAction} submit={{ label: "Record payment" }} resetOnSuccess>
                    <input type="hidden" name="invoiceId" value={i.id} />
                    <MoneyField name="amount" label="Amount received" required defaultValue={Math.max(t.balance, 0)} />
                    <SelectField
                      name="method"
                      label="Method"
                      options={[
                        { value: "offline_check", label: "Check" },
                        { value: "offline_cash", label: "Cash" },
                        { value: "offline_other", label: "Other (bank transfer, etc.)" },
                      ]}
                    />
                    <TextField name="note" label="Reference" required hint="Check number, receipt or who approved it." />
                  </ActionForm>
                </Disclosure>
                {d.credit > 0 ? (
                  <Disclosure label={`Apply account credit ($${(d.credit / 100).toFixed(2)} available)`}>
                    <ActionForm action={applyCreditAction} submit={{ label: "Apply credit" }}>
                      <input type="hidden" name="invoiceId" value={i.id} />
                      <MoneyField name="amount" label="Amount" required defaultValue={Math.min(d.credit, Math.max(t.balance, 0))} />
                    </ActionForm>
                  </Disclosure>
                ) : null}
              </div>
            </Card>
          ) : null}

          {manage && i.status !== "void" ? (
            <Card title="Corrections">
              <div className="space-y-3">
                <Disclosure label="Add an adjustment">
                  <ActionForm action={adjustmentAction} submit={{ label: "Add adjustment" }} resetOnSuccess>
                    <input type="hidden" name="invoiceId" value={i.id} />
                    <MoneyField name="amount" label="Amount" required hint="Use a negative amount to reduce what’s owed (e.g. -25.00)." />
                    <TextField name="description" label="Description" required hint="Shown on the invoice and kept in the history." />
                  </ActionForm>
                </Disclosure>
                {t.paid === 0 && t.creditApplied === 0 ? (
                  <Disclosure label="Void invoice">
                    <ActionForm
                      action={voidAction}
                      submit={{ label: "Void invoice", variant: "danger" }}
                      confirm={{ title: `Void ${i.number}?`, body: "The invoice stays on record but no longer counts as owed.", confirmLabel: "Void invoice", danger: true }}
                    >
                      <input type="hidden" name="invoiceId" value={i.id} />
                      <TextField name="reason" label="Reason" required />
                    </ActionForm>
                  </Disclosure>
                ) : (
                  <p className="text-[0.78rem] text-ink-soft">Invoices with payments can’t be voided — refund or adjust instead, so the history stays intact.</p>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
