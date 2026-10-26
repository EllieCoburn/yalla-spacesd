import Link from "next/link";
import { Card, Empty, FilterBar, FilterField, inputCls, LinkButton, Money, PageHeader, Pill, Tabs } from "@/components/admin/ui";
import { familyDirectory } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { ageLabel, todayLA } from "@/lib/time";

export const metadata = { title: "Families" };

export default async function FamiliesPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string }> }) {
  const staff = await requirePermission("families.view");
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const archived = sp.view === "archived";
  const rows = await familyDirectory(getDb(), staff, q, { archived });
  const today = todayLA();
  const money = can(staff, "billing.view");
  const forms = can(staff, "forms.view");

  return (
    <>
      <PageHeader
        title="Families"
        subtitle="Search by family, guardian, child, email or phone."
        actions={can(staff, "families.manage") ? <LinkButton href="/admin/families/new" variant="primary">Add family</LinkButton> : null}
      />
      <Tabs
        current={archived ? "archived" : "active"}
        tabs={[
          { key: "active", label: "Active", href: `/admin/families${q ? `?q=${encodeURIComponent(q)}` : ""}` },
          { key: "archived", label: "Archived", href: `/admin/families?view=archived${q ? `&q=${encodeURIComponent(q)}` : ""}` },
        ]}
      />
      <FilterBar action="/admin/families">
        {archived ? <input type="hidden" name="view" value="archived" /> : null}
        <FilterField label="Search">
          <input name="q" defaultValue={q} placeholder="e.g. Sample, family3@example.com, Ava" className={`${inputCls} min-w-[16rem]`} autoFocus />
        </FilterField>
      </FilterBar>

      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty title={q ? "No families match that search" : archived ? "No archived families" : "No families yet"}>
              {q ? "Try part of a name, an email or a phone number." : null}
            </Empty>
          </div>
        ) : (
          <ul className="divide-y divide-ink/6">
            {rows.map((r) => (
              <li key={r.family.id}>
                <Link href={`/admin/families/${r.family.id}`} className="grid gap-3 px-5 py-4 transition-colors hover:bg-mist/30 md:grid-cols-[1.3fr_1.4fr_auto] md:items-center">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.95rem] font-medium text-ink">{r.family.name}</span>
                      {r.isMember ? <Pill tone="info" icon="check">Club Yalla</Pill> : null}
                      {r.family.isSample ? <Pill tone="muted">Sample</Pill> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.8rem] text-ink-soft">
                      {r.guardians.map((g) => `${g.name}${g.isPrimary ? " (primary)" : ""}`).join(" · ") || "No guardians"}
                    </span>
                    <span className="block truncate text-[0.75rem] text-ink-soft">{r.guardians[0]?.email}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {r.children.length === 0 ? <span className="text-[0.8rem] text-ink-soft">No children yet</span> : null}
                    {r.children.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-[0.78rem] text-ink">
                        {c.name}
                        <span className="text-ink-soft">{ageLabel(c.birthDate, today)}</span>
                      </span>
                    ))}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 md:justify-end">
                    {forms && r.paperworkIssues ? (
                      <Pill tone="warning" icon="alert">
                        {r.paperworkIssues} form{r.paperworkIssues === 1 ? "" : "s"} outstanding
                      </Pill>
                    ) : forms ? (
                      <Pill tone="positive" icon="check">Paperwork complete</Pill>
                    ) : null}
                    {money && r.balance ? (
                      <Pill tone="warning" icon="clock">
                        <Money cents={r.balance} /> due
                      </Pill>
                    ) : null}
                    {money && r.credit ? (
                      <Pill tone="neutral" icon="dot">
                        <Money cents={r.credit} /> credit
                      </Pill>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {rows.length >= 60 ? <p className="mt-3 text-[0.8rem] text-ink-soft">Showing the first 60 families. Refine your search to see others.</p> : null}
    </>
  );
}
