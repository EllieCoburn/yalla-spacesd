import Link from "next/link";
import { ENFORCEMENT_LABEL, FREQUENCY_LABEL, KIND_LABEL, SCOPE_LABEL } from "@/components/admin/forms-admin/labels";
import { Card, Empty, LinkButton, PageHeader, Pill, Table } from "@/components/admin/ui";
import { formsOverview } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "Forms & waivers" };

export default async function FormsPage() {
  const staff = await requirePermission("forms.view");
  const rows = await formsOverview(getDb());
  return (
    <>
      <PageHeader
        title="Forms & waivers"
        subtitle="Paperwork families complete, the versions they signed, and who it’s required for."
        actions={
          <>
            <LinkButton href="/admin/forms/outstanding">Outstanding paperwork</LinkButton>
            {can(staff, "forms.manage") ? <LinkButton href="/admin/forms/new" variant="primary">New form</LinkButton> : null}
          </>
        }
      />
      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty title="No forms yet" action={can(staff, "forms.manage") ? <LinkButton href="/admin/forms/new">Create the first form</LinkButton> : null} />
          </div>
        ) : (
          <Table head={["Form", "Required", "Completes", "Current version", "Required for", "Completed"]}>
            {rows.map((r) => (
              <tr key={r.template.id} className={r.template.status === "archived" ? "opacity-60" : ""}>
                <td>
                  <Link href={`/admin/forms/${r.template.id}`} className="font-medium text-ink hover:text-blue">
                    {r.template.title}
                  </Link>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    <Pill tone="neutral">{KIND_LABEL[r.template.kind] ?? r.template.kind}</Pill>
                    {r.template.requiresSignature ? <Pill tone="info" icon="check">Signature</Pill> : null}
                    {r.template.status === "archived" ? <Pill tone="muted" icon="x">Archived</Pill> : null}
                  </span>
                </td>
                <td>
                  <Pill tone={r.template.enforcement === "blocks_booking" ? "critical" : r.template.enforcement === "before_attendance" ? "warning" : "muted"} icon={r.template.enforcement === "informational" ? "minus" : "alert"}>
                    {ENFORCEMENT_LABEL[r.template.enforcement]}
                  </Pill>
                </td>
                <td>
                  {FREQUENCY_LABEL[r.template.frequency]}
                  {r.template.validForMonths ? <span className="block text-[0.75rem] text-ink-soft">every {r.template.validForMonths} months</span> : null}
                  <span className="block text-[0.75rem] text-ink-soft">{r.template.perChild ? "Per child" : "Per family"}</span>
                </td>
                <td>
                  {r.current ? (
                    <>
                      v{r.current.version}
                      <span className="block text-[0.75rem] text-ink-soft">{fmtDateTime(r.current.publishedAt)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-[0.82rem]">{r.requirements.length ? [...new Set(r.requirements.map((q) => SCOPE_LABEL[q.scope] ?? q.scope))].join(", ") : <span className="text-[#8a5212]">Not required anywhere</span>}</td>
                <td className="tabular-nums">
                  {r.completedCurrent} on current version
                  {r.completedAny !== r.completedCurrent ? <span className="block text-[0.75rem] text-ink-soft">{r.completedAny} incl. earlier versions</span> : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
