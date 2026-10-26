import Link from "next/link";
import { asc } from "drizzle-orm";
import { Card, Empty, LinkButton, Money, PageHeader, Status, Table, Tabs } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { programs } from "@/lib/db/schema";
import { BOOKING_MODES, BOOKING_UNITS, PROGRAM_KINDS, upcomingSessionCounts } from "@/lib/ops/programs";
import { todayLA } from "@/lib/time";

export const metadata = { title: "Programs" };

const label = (list: { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label.split(" — ")[0].split(" (")[0] ?? v;

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ status?: string; deleted?: string }> }) {
  const staff = await requirePermission("programs.view");
  const sp = await searchParams;
  const db = getDb();
  const all = await db.select().from(programs).orderBy(asc(programs.name));
  const counts = await upcomingSessionCounts(db, todayLA());
  const current = sp.status ?? "active";
  const shown = all.filter((p) => (current === "active" ? p.status !== "archived" : p.status === current));
  const tab = (key: string, text: string) => ({ key, label: text, href: `/admin/programs?status=${key}`, count: key === "active" ? all.filter((p) => p.status !== "archived").length : all.filter((p) => p.status === key).length });

  return (
    <>
      <PageHeader
        title="Programs"
        subtitle="Every offering, with its own booking rules, pricing and paperwork."
        actions={can(staff, "programs.manage") ? <LinkButton href="/admin/programs/new" variant="primary">New program</LinkButton> : null}
      />
      {sp.deleted ? <p className="mb-4 rounded-lg bg-[#e6f0ea] px-3 py-2 text-[0.85rem] text-[#2c6447]">Draft program deleted.</p> : null}
      <Tabs current={current} tabs={[tab("active", "Active"), tab("published", "Published"), tab("draft", "Drafts"), tab("paused", "Paused"), tab("archived", "Archived")]} />
      <Card padded={false}>
        {shown.length === 0 ? (
          <div className="p-5">
            <Empty title="No programs here">{current === "archived" ? "Archived programs appear here, with all their records kept." : "Create a program to start scheduling sessions."}</Empty>
          </div>
        ) : (
          <Table head={["Program", "Type", "Booking", "Price", "Upcoming sessions", "Status", ""]}>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/programs/${p.id}`} className="font-medium text-ink hover:text-blue">
                    {p.name}
                  </Link>
                  {p.tagline ? <span className="block text-[0.78rem] text-ink-soft">{p.tagline}</span> : null}
                </td>
                <td className="text-ink-soft">{label(PROGRAM_KINDS, p.kind)}</td>
                <td>
                  <span className="block">{label(BOOKING_MODES, p.bookingMode)}</span>
                  <span className="text-[0.78rem] text-ink-soft">{label(BOOKING_UNITS, p.bookingUnit)}</span>
                </td>
                <td>{p.priceCents != null ? <><Money cents={p.priceCents} /> <span className="text-[0.78rem] text-ink-soft">/ {p.priceUnit}</span></> : <span className="text-ink-soft">Price table / not set</span>}</td>
                <td className="tabular-nums">{counts.get(p.id) ?? 0}</td>
                <td>
                  <Status kind="program" value={p.status} />
                </td>
                <td className="text-right">
                  {p.status === "published" && p.bookingMode !== "enroll" ? (
                    <a href={`/programs/${p.slug}`} target="_blank" rel="noreferrer" className="text-[0.8rem] text-blue hover:underline">
                      Public page ↗
                    </a>
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
