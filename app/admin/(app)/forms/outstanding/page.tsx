import Link from "next/link";
import { asc } from "drizzle-orm";
import { ActionForm } from "@/components/admin/forms";
import { Card, Empty, FilterBar, FilterField, inputCls, PageHeader, Status } from "@/components/admin/ui";
import { outstandingPaperwork } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { programs } from "@/lib/db/schema";
import { addDaysISO, fmtDate, todayLA } from "@/lib/time";
import { sendReminderAction } from "../actions";

export const metadata = { title: "Outstanding paperwork" };

const ENF: Record<string, string> = { blocks_booking: "Blocks booking", before_attendance: "Needed before attending" };

export default async function OutstandingPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; program?: string }> }) {
  const staff = await requirePermission("forms.view");
  const sp = await searchParams;
  const db = getDb();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : todayLA();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : addDaysISO(from, 7);
  const progs = await db.select().from(programs).orderBy(asc(programs.name));
  const rows = await outstandingPaperwork(db, { from, to, programId: sp.program || undefined });
  const childCount = rows.reduce((s, r) => s + r.rows.filter((x) => x.childId).length, 0);
  const manage = can(staff, "forms.manage");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/forms", label: "Forms & waivers" }}
        title="Outstanding paperwork"
        subtitle={`Children and families attending ${fmtDate(from, "EEE d MMM")} – ${fmtDate(to, "EEE d MMM")} with something missing, expired or needing a new signature.`}
      />
      <FilterBar action="/admin/forms/outstanding">
        <FilterField label="Attending from">
          <input type="date" name="from" defaultValue={from} className={inputCls} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={to} className={inputCls} />
        </FilterField>
        <FilterField label="Program">
          <select name="program" defaultValue={sp.program ?? ""} className={inputCls}>
            <option value="">All programs</option>
            {progs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>
      <p className="mb-3 text-[0.85rem] text-ink-soft">
        {rows.length} famil{rows.length === 1 ? "y" : "ies"} · {childCount} child record{childCount === 1 ? "" : "s"} with open items. Informational forms are not listed.
      </p>
      {rows.length === 0 ? (
        <Card>
          <Empty title="Nothing outstanding">Everyone attending in this range has their required paperwork.</Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card
              key={r.family.id}
              title={
                <Link href={`/admin/families/${r.family.id}#paperwork`} className="hover:text-blue">
                  {r.family.name}
                </Link>
              }
              actions={
                manage ? (
                  <ActionForm action={sendReminderAction} submit={{ label: "Send reminder", variant: "secondary" }}>
                    <input type="hidden" name="familyId" value={r.family.id} />
                  </ActionForm>
                ) : null
              }
            >
              <ul className="divide-y divide-ink/6">
                {r.rows.map((row) =>
                  row.items.map((i) => (
                    <li key={`${row.childId}:${i.templateId}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span>
                        <span className="text-[0.88rem] text-ink">{i.title}</span>
                        <span className="text-[0.8rem] text-ink-soft">
                          {" "}
                          ·{" "}
                          {row.childId ? (
                            <Link href={`/admin/children/${row.childId}#paperwork`} className="hover:underline">
                              {row.childName}
                            </Link>
                          ) : (
                            "Whole family"
                          )}
                          {ENF[i.enforcement] ? ` · ${ENF[i.enforcement]}` : ""}
                          {i.expiresOn && i.state === "expired" ? ` · expired ${fmtDate(i.expiresOn, "d MMM yyyy")}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Status kind="paperwork" value={i.state} />
                        {manage ? (
                          <Link href={`/admin/forms/${i.templateId}?record=1&family=${r.family.id}${row.childId ? `&child=${row.childId}` : ""}#record`} className="text-[0.78rem] text-blue hover:underline">
                            Record
                          </Link>
                        ) : null}
                      </span>
                    </li>
                  )),
                )}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
