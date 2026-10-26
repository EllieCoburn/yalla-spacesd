import Link from "next/link";
import { asc } from "drizzle-orm";
import { ActionForm, Checkbox, Disclosure, SelectField, TextField } from "@/components/admin/forms";
import { Card, Empty, Money, Notice, PageHeader, Pill, Table } from "@/components/admin/ui";
import { listDiscounts } from "@/lib/admin/queries/billing";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { programs } from "@/lib/db/schema";
import { getPolicy } from "@/lib/ops/settings";
import { fmtDate } from "@/lib/time";
import { discountAction } from "../actions";

export const metadata = { title: "Discounts" };

function DiscountFields({ d, programOptions }: { d?: { id: string; code: string | null; name: string; kind: string; value: number; programId: string | null; active: boolean; startsOn: string | null; endsOn: string | null; maxUses: number | null }; programOptions: { value: string; label: string }[] }) {
  return (
    <>
      {d ? <input type="hidden" name="id" value={d.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="name" label="Name" required defaultValue={d?.name} />
        <TextField name="code" label="Promo code (optional)" defaultValue={d?.code} hint="Leave empty for staff-applied discounts." />
        <SelectField name="kind" label="Type" defaultValue={d?.kind ?? "percent"} options={[{ value: "percent", label: "Percent off" }, { value: "fixed", label: "Fixed amount off" }]} />
        <TextField name="value" label="Value" required defaultValue={d ? (d.kind === "fixed" ? (d.value / 100).toFixed(2) : d.value) : ""} hint="Percent (1–100) or dollars for fixed." />
        <SelectField name="programId" label="Applies to" defaultValue={d?.programId ?? ""} options={[{ value: "", label: "All programs" }, ...programOptions]} />
        <TextField name="maxUses" label="Max uses (optional)" type="number" defaultValue={d?.maxUses} />
        <TextField name="startsOn" label="Starts" type="date" defaultValue={d?.startsOn} />
        <TextField name="endsOn" label="Ends" type="date" defaultValue={d?.endsOn} />
      </div>
      <Checkbox name="active" label="Active" defaultChecked={d?.active ?? true} />
    </>
  );
}

export default async function DiscountsPage() {
  const staff = await requirePermission("billing.view");
  const db = getDb();
  const [rows, progs, sibling] = await Promise.all([listDiscounts(db), db.select().from(programs).orderBy(asc(programs.name)), getPolicy(db, "billing.siblingDiscountPercent")]);
  const programOptions = progs.map((p) => ({ value: p.id, label: p.name }));
  const manage = can(staff, "billing.manage");
  return (
    <>
      <PageHeader title="Discounts & promo codes" />
      <div className="mb-5">
        <Notice tone="info" title="Sibling discount">
          {sibling ? `${sibling}% off each additional child in the same booking.` : "Not set."} Change it in{" "}
          <Link href="/admin/settings?tab=policies" className="underline">
            Settings → Policies
          </Link>
          . Promo codes are recorded here; applying them at public checkout is part of the booking flow configuration.
        </Notice>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card padded={false}>
          {rows.length === 0 ? (
            <div className="p-5">
              <Empty title="No discounts yet" />
            </div>
          ) : (
            <Table head={["Discount", "Code", "Value", "Applies to", "Dates", "Status", ""]}>
              {rows.map(({ d, p }) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.name}</td>
                  <td className="font-mono text-[0.8rem]">{d.code ?? "—"}</td>
                  <td>{d.kind === "percent" ? `${d.value}%` : <Money cents={d.value} />}</td>
                  <td>{p?.name ?? "All programs"}</td>
                  <td className="text-[0.8rem] text-ink-soft">{d.startsOn || d.endsOn ? `${d.startsOn ? fmtDate(d.startsOn, "d MMM") : "…"} – ${d.endsOn ? fmtDate(d.endsOn, "d MMM yyyy") : "…"}` : "Any time"}</td>
                  <td>{d.active ? <Pill tone="positive" icon="check">Active</Pill> : <Pill tone="muted" icon="minus">Inactive</Pill>}</td>
                  <td className="min-w-[14rem]">
                    {manage ? (
                      <Disclosure label="Edit">
                        <ActionForm action={discountAction} submit={{ label: "Save" }}>
                          <DiscountFields d={d} programOptions={programOptions} />
                        </ActionForm>
                      </Disclosure>
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        {manage ? (
          <Card title="New discount">
            <ActionForm action={discountAction} submit={{ label: "Create discount" }} resetOnSuccess>
              <DiscountFields programOptions={programOptions} />
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
