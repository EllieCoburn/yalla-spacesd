import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { Card, Empty, FilterBar, FilterField, inputCls, PageHeader, Pill } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { addDaysISO, fmtDateTime, zonedDateTime } from "@/lib/time";

export const metadata = { title: "Audit trail" };

const ENTITY_HREF: Record<string, (id: string) => string> = {
  booking: (id) => `/admin/bookings/${id}`,
  invoice: (id) => `/admin/billing/invoices/${id}`,
  family: (id) => `/admin/families/${id}`,
  child: (id) => `/admin/children/${id}`,
  membership: (id) => `/admin/memberships/${id}`,
  session: (id) => `/admin/sessions/${id}`,
  program: (id) => `/admin/programs/${id}`,
  form: (id) => `/admin/forms/${id}`,
  form_submission: (id) => `/admin/forms/submissions/${id}`,
  template: (id) => `/admin/communications/templates/${id}`,
};

const ENTITY_TYPES = ["booking", "session", "program", "schedule", "family", "child", "membership", "invoice", "discount", "form", "form_submission", "document", "staff", "role", "setting", "location", "cohort", "capacity_pool", "template", "waitlist", "report"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; actor?: string; action?: string; from?: string; to?: string; id?: string; page?: string }> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const page = Math.max(1, Number(sp.page) || 1);
  const db = getDb();
  const where = and(
    sp.entity ? eq(auditLog.entityType, sp.entity) : undefined,
    sp.id ? eq(auditLog.entityId, sp.id) : undefined,
    sp.actor ? ilike(auditLog.actorName, `%${sp.actor}%`) : undefined,
    sp.action ? or(ilike(auditLog.action, `%${sp.action}%`), ilike(auditLog.summary, `%${sp.action}%`)) : undefined,
    sp.from && iso.test(sp.from) ? gte(auditLog.at, zonedDateTime(sp.from, "00:00")) : undefined,
    sp.to && iso.test(sp.to) ? lte(auditLog.at, zonedDateTime(addDaysISO(sp.to, 1), "00:00")) : undefined,
  );
  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.at))
    .limit(101)
    .offset((page - 1) * 100);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where);
  const more = rows.length > 100;
  const qs = (p: number) => `/admin/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "page")), page: String(p) } as Record<string, string>)}`;

  return (
    <>
      <PageHeader title="Audit trail" subtitle={`${n.toLocaleString()} recorded action(s). Sensitive values are never stored here — only that they changed.`} />
      <FilterBar action="/admin/audit">
        <FilterField label="Record type">
          <select name="entity" defaultValue={sp.entity ?? ""} className={inputCls}>
            <option value="">All</option>
            {ENTITY_TYPES.map((e) => (
              <option key={e} value={e}>
                {e.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Who">
          <input name="actor" defaultValue={sp.actor ?? ""} placeholder="Staff name, System…" className={inputCls} />
        </FilterField>
        <FilterField label="Action contains">
          <input name="action" defaultValue={sp.action ?? ""} placeholder="refund, override, role…" className={inputCls} />
        </FilterField>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={inputCls} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={inputCls} />
        </FilterField>
      </FilterBar>
      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty title="No matching activity" />
          </div>
        ) : (
          <ul className="divide-y divide-ink/6">
            {rows.slice(0, 100).map((a) => {
              const href = a.entityId && ENTITY_HREF[a.entityType] ? ENTITY_HREF[a.entityType](a.entityId) : null;
              const changes = a.changes as Record<string, unknown> | null;
              return (
                <li key={a.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[11rem_1fr]">
                  <div className="text-[0.78rem] text-ink-soft">
                    <span className="block tabular-nums">{fmtDateTime(a.at)}</span>
                    <span className="block">{a.actorName ?? a.actorType}</span>
                    {a.ip ? <span className="block">{a.ip}</span> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.88rem] text-ink">
                      {href ? (
                        <Link href={href} className="hover:text-blue">
                          {a.summary}
                        </Link>
                      ) : (
                        a.summary
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.72rem] text-ink-soft">
                      <Pill tone={/refund|override|disable|role|cancel|void|restriction/.test(a.action) ? "warning" : "neutral"}>{a.action}</Pill>
                      <span>{a.entityType.replace(/_/g, " ")}</span>
                    </p>
                    {changes ? (
                      <details className="mt-1.5 text-[0.78rem]">
                        <summary className="cursor-pointer text-ink-soft hover:text-ink">Changes</summary>
                        <ul className="mt-1 space-y-0.5">
                          {Object.entries(changes).map(([k, v]) => (
                            <li key={k}>
                              <span className="font-medium">{k}</span>:{" "}
                              <span className="text-ink-soft">
                                {v && typeof v === "object" && "from" in (v as object)
                                  ? `${JSON.stringify((v as { from: unknown }).from)} → ${JSON.stringify((v as { to: unknown }).to)}`
                                  : JSON.stringify(v)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <div className="mt-4 flex justify-between text-[0.85rem]">
        {page > 1 ? (
          <Link className="text-blue hover:underline" href={qs(page - 1)}>
            ← Newer
          </Link>
        ) : (
          <span />
        )}
        {more ? (
          <Link className="text-blue hover:underline" href={qs(page + 1)}>
            Older →
          </Link>
        ) : null}
      </div>
    </>
  );
}
