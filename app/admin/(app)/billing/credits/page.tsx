import Link from "next/link";
import { ActionForm, MoneyField, SelectField, TextArea } from "@/components/admin/forms";
import { Card, Empty, Money, PageHeader, Table } from "@/components/admin/ui";
import { creditLedger, familyOptions } from "@/lib/admin/queries/billing";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { courtesyCreditAction } from "../../play-passes/actions";

export const metadata = { title: "Account credit" };

export default async function CreditsPage() {
  const staff = await requirePermission("billing.view");
  const db = getDb();
  const [{ balances, recent }, fams] = await Promise.all([creditLedger(db), familyOptions(db)]);
  return (
    <>
      <PageHeader
        title="Credit"
        subtitle="Give a family Yalla Wallet credit for any reason. It shows in their Family Portal and is used at checkout, like cancellation credit. You can also add it from the family’s page."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          {can(staff, "billing.manage") ? (
            <Card title="Add Yalla Wallet credit">
              <ActionForm action={courtesyCreditAction} submit={{ label: "Add to their wallet" }} resetOnSuccess confirm={{ title: "Add this credit to their Yalla Wallet?", body: "They’ll see it in their Family Portal with your reason.", confirmLabel: "Add credit" }}>
                <SelectField name="familyId" label="Family" required options={[{ value: "", label: "Choose a family…" }, ...fams.map((f) => ({ value: f.id, label: f.name }))]} />
                <MoneyField name="amount" label="Amount" required />
                <TextArea name="note" label="Reason shared with the family" required rows={4} hint="Emailed to the family exactly as you write it, with your line breaks." />
              </ActionForm>
              <p className="mt-2 text-[0.75rem] text-ink-soft">Valid 24 months.</p>
            </Card>
          ) : null}
          <p className="text-[0.8rem] text-ink-soft">Below: older account credit, from before the Yalla Wallet. It’s applied by staff from an invoice and doesn’t show in families’ wallets.</p>
          <Card title="Families holding older account credit" padded={false}>
            {balances.length === 0 ? (
              <p className="p-5 text-[0.85rem] text-ink-soft">No family has a credit balance.</p>
            ) : (
              <ul className="divide-y divide-ink/6">
                {balances.map((b) => (
                  <li key={b.family_id} className="flex items-center justify-between px-5 py-3">
                    <Link href={`/admin/families/${b.family_id}`} className="text-[0.88rem] text-ink hover:text-blue">
                      {b.name}
                    </Link>
                    <Money cents={b.balance} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Older account credit history" padded={false}>
          {recent.length === 0 ? (
            <div className="p-5">
              <Empty title="No credit activity yet" />
            </div>
          ) : (
            <Table head={["When", "Family", "Change", "Reason", "By"]} dense>
              {recent.map(({ c, f }) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(c.createdAt)}</td>
                  <td>{f.name}</td>
                  <td className={c.amountCents < 0 ? "text-ink-soft" : "font-medium"}>
                    <Money cents={c.amountCents} />
                  </td>
                  <td>{c.reason}</td>
                  <td className="text-ink-soft">{c.createdBy}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
