import Link from "next/link";
import { asc } from "drizzle-orm";
import { Card, Empty, FilterBar, FilterField, inputCls, Money, Notice, PageHeader, Pill } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { programs } from "@/lib/db/schema";
import { REPORTS, reportById, type Column } from "@/lib/ops/reports";
import { addDaysISO, fmtDate, todayLA } from "@/lib/time";

export const metadata = { title: "Reports" };

function Cell({ c, v }: { c: Column; v: string | number | null | undefined }) {
  if (c.kind === "money") return <Money cents={Number(v ?? 0)} />;
  if (c.kind === "percent") return <span className="tabular-nums">{v}%</span>;
  if (c.kind === "number") return <span className="tabular-nums">{v}</span>;
  return <>{v}</>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string; program?: string }> }) {
  const staff = await requirePermission("reports.view");
  const sp = await searchParams;
  const visible = REPORTS.filter((r) => !r.financial || can(staff, "reports.financial"));
  const report = reportById(sp.r ?? "") && visible.some((v) => v.id === sp.r) ? reportById(sp.r!)! : null;
  const today = todayLA();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.from && iso.test(sp.from) ? sp.from : addDaysISO(today, -30);
  const to = sp.to && iso.test(sp.to) ? sp.to : today;

  if (!report) {
    return (
      <>
        <PageHeader title="Reports" subtitle="Every figure is labeled for exactly what it measures." />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => (
            <Link key={r.id} href={`/admin/reports?r=${r.id}`} className="rounded-xl border border-ink/10 bg-[#fffefb] p-5 transition-colors hover:border-blue/50">
              <p className="flex items-center gap-2 text-[0.95rem] font-semibold text-ink">
                {r.title} {r.financial ? <Pill tone="neutral">Financial</Pill> : null}
              </p>
              <p className="mt-1 text-[0.85rem] text-ink-soft">{r.description}</p>
            </Link>
          ))}
        </div>
        {!can(staff, "reports.financial") ? <p className="mt-4 text-[0.8rem] text-ink-soft">Financial reports are hidden for your role.</p> : null}
      </>
    );
  }

  const db = getDb();
  const progs = report.filters.includes("program") ? await db.select().from(programs).orderBy(asc(programs.name)) : [];
  const result = await report.run(db, { from, to, programId: sp.program || undefined });
  const exportHref = `/admin/export/report/${report.id}?${new URLSearchParams({ from, to, ...(sp.program ? { program: sp.program } : {}) })}`;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/reports", label: "Reports" }}
        title={report.title}
        subtitle={report.filters.includes("asOf") ? `As of ${fmtDate(to)}` : `${fmtDate(from)} – ${fmtDate(to)}`}
        actions={
          can(staff, "reports.export") ? (
            <a href={exportHref} className="inline-flex h-9 items-center rounded-lg border border-ink/15 bg-white px-3.5 text-[0.84rem] font-medium hover:border-ink/40">
              Export CSV
            </a>
          ) : null
        }
      />
      <FilterBar action="/admin/reports">
        <input type="hidden" name="r" value={report.id} />
        {report.filters.includes("range") ? (
          <FilterField label="From">
            <input type="date" name="from" defaultValue={from} className={inputCls} />
          </FilterField>
        ) : null}
        <FilterField label={report.filters.includes("asOf") ? "As of" : "To"}>
          <input type="date" name="to" defaultValue={to} className={inputCls} />
        </FilterField>
        {report.filters.includes("program") ? (
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
        ) : null}
      </FilterBar>
      {result.note ? (
        <div className="mb-4">
          <Notice tone="info">{result.note}</Notice>
        </div>
      ) : null}
      <Card padded={false}>
        {result.rows.length === 0 ? (
          <div className="p-5">
            <Empty title="No data for these filters" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[0.85rem]">
              <thead>
                <tr className="border-b border-ink/10 text-[0.72rem] tracking-[0.04em] text-ink-soft uppercase">
                  {result.columns.map((c) => (
                    <th key={c.key} scope="col" className={`px-4 py-2.5 font-medium first:pl-5 last:pr-5 ${c.kind && c.kind !== "text" ? "text-right" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/6">
                {result.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-mist/30">
                    {result.columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2.5 first:pl-5 last:pr-5 ${c.kind && c.kind !== "text" ? "text-right" : ""}`}>
                        <Cell c={c} v={r[c.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {result.totals ? (
                <tfoot>
                  <tr className="border-t-2 border-ink/15 font-semibold">
                    {result.columns.map((c, i) => (
                      <td key={c.key} className={`px-4 py-2.5 first:pl-5 last:pr-5 ${c.kind && c.kind !== "text" ? "text-right" : ""}`}>
                        {i === 0 ? "Total" : c.key in result.totals! ? <Cell c={c} v={result.totals![c.key]} /> : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
