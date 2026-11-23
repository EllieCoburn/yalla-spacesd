import Link from "next/link";
import { Card, Empty, FilterBar, FilterField, inputCls, PageHeader, Pill, Stat, Status, Table, Tabs } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { abandonedCheckouts, openCarts, type CheckoutRow } from "@/lib/ops/carts";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/time";

export const metadata = { title: "Carts & checkouts" };

const PERIODS = [7, 30, 90];

function ago(d: Date, now = new Date()) {
  const m = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const days = Math.round(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const when = (s: { localDate: string; startsAt: Date }) => `${fmtDate(s.localDate, "EEE d MMM")} · ${fmtTime(s.startsAt)}`;

export default async function CartsPage({ searchParams }: { searchParams: Promise<{ view?: string; days?: string; all?: string }> }) {
  const staff = await requirePermission("bookings.view");
  const sp = await searchParams;
  const view = sp.view === "abandoned" ? "abandoned" : "carts";
  const days = PERIODS.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const showAll = sp.all === "1";
  const seeFamilies = can(staff, "families.view");
  const db = getDb();
  const [open, checkouts] = await Promise.all([openCarts(db), abandonedCheckouts(db, { days })]);
  const stillOpen = checkouts.abandoned.filter((a) => !a.bookedLater);
  const abandonedShown = showAll ? checkouts.abandoned : stillOpen;

  return (
    <>
      <PageHeader title="Carts & checkouts" subtitle="What families have picked out on the website but haven’t booked yet." />
      <Tabs
        current={view}
        tabs={[
          { key: "carts", label: "Open carts", href: "/admin/carts", count: open.carts.length },
          { key: "abandoned", label: "Abandoned checkouts", href: `/admin/carts?view=abandoned&days=${days}`, count: stillOpen.length },
        ]}
      />

      {view === "carts" ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Open carts" value={open.carts.length} sub="Changed in the last 7 days" />
            <Stat label="Spots in carts" value={open.spots} sub={`Across ${open.demand.length} session${open.demand.length === 1 ? "" : "s"}`} />
            <Stat label="Signed-in families" value={open.signedIn} sub="The rest are anonymous visitors" />
            <Stat label="In checkout now" value={checkouts.inProgress.length} sub="Details entered, paying now" href="/admin/carts?view=abandoned" />
          </div>

          <div className="space-y-6">
            <Card title="Most wanted sessions" padded={false}>
              {open.demand.length === 0 ? (
                <div className="p-5">
                  <Empty title="Nothing in carts right now">When visitors add sessions on the website, you’ll see them here.</Empty>
                </div>
              ) : (
                <Table head={["Session", "Date", "In carts", "Spots wanted", "Spaces left"]} dense>
                  {open.demand.map((d) => (
                    <tr key={d.session.id}>
                      <td>
                        <Link href={`/admin/sessions/${d.session.id}`} className="font-medium text-ink hover:text-blue">
                          {d.session.name}
                        </Link>
                        {d.session.name !== d.session.programName ? <span className="block text-[0.75rem] text-ink-soft">{d.session.programName}</span> : null}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{when(d.session)}</td>
                      <td className="tabular-nums">{d.carts}</td>
                      <td className="tabular-nums">{d.spots}</td>
                      <td>
                        {d.remaining == null ? (
                          <span className="text-ink-soft">—</span>
                        ) : d.remaining <= 0 ? (
                          <Pill tone="critical" icon="x">Full</Pill>
                        ) : d.spots >= d.remaining ? (
                          <Pill tone="warning" icon="alert">{d.remaining} left</Pill>
                        ) : (
                          <span className="tabular-nums">{d.remaining}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            {open.carts.length ? (
              <Card title="Every open cart" padded={false}>
                <ul className="divide-y divide-ink/6">
                  {open.carts.map((c) => (
                    <li key={c.id} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[14rem_1fr_8rem]">
                      <span className="text-[0.88rem]">
                        {c.family ? (
                          seeFamilies ? (
                            <Link href={`/admin/families/${c.family.id}`} className="font-medium text-ink hover:text-blue">
                              {c.family.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-ink">{c.family.name}</span>
                          )
                        ) : (
                          <span className="text-ink-soft">Visitor (not signed in)</span>
                        )}
                      </span>
                      <ul className="space-y-0.5 text-[0.84rem] text-ink">
                        {c.items.map((i) => (
                          <li key={i.id}>
                            {i.session.name} <span className="text-ink-soft">· {when(i.session)}{i.spots > 1 ? ` · ${i.spots} spots` : ""}{i.extras.length ? ` · ${i.extras.length} extra${i.extras.length === 1 ? "" : "s"}` : ""}</span>
                          </li>
                        ))}
                      </ul>
                      <span className="text-[0.78rem] text-ink-soft sm:text-right" title={fmtDateTime(c.updatedAt)}>
                        {ago(c.updatedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <p className="text-[0.78rem] text-ink-soft">
              Carts are kept on each visitor’s device, with a copy here so you can see demand. Visitors who aren’t signed in to the Family Portal stay anonymous: you’ll see what
              they picked, not who they are. Carts untouched for 7 days are cleared. Families who go on to enter their details at checkout appear under Abandoned checkouts if they
              don’t finish paying.
            </p>
          </div>
        </>
      ) : (
        <>
          <FilterBar action="/admin/carts">
            <input type="hidden" name="view" value="abandoned" />
            <FilterField label="Period">
              <select name="days" defaultValue={String(days)} className={inputCls}>
                {PERIODS.map((d) => (
                  <option key={d} value={d}>
                    Last {d} days
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Show">
              <select name="all" defaultValue={showAll ? "1" : ""} className={inputCls}>
                <option value="">Not booked since</option>
                <option value="1">Everything, including later bookings</option>
              </select>
            </FilterField>
          </FilterBar>

          <div className="space-y-6">
            {checkouts.inProgress.length ? (
              <Card title={`In checkout now · ${checkouts.inProgress.length}`} padded={false}>
                <CheckoutTable rows={checkouts.inProgress} seeFamilies={seeFamilies} live />
              </Card>
            ) : null}
            <Card title={`Abandoned checkouts · last ${days} days`} padded={false}>
              {abandonedShown.length === 0 ? (
                <div className="p-5">
                  <Empty title="No abandoned checkouts">
                    {checkouts.abandoned.length ? "Every family in this period went on to book." : "Every checkout in this period was completed."}
                  </Empty>
                </div>
              ) : (
                <CheckoutTable rows={abandonedShown} seeFamilies={seeFamilies} />
              )}
            </Card>
            <p className="text-[0.78rem] text-ink-soft">
              A checkout is abandoned when a family entered their details and chose sessions on the website, but their hold ran out before they paid, so the spots were released.
              “Booked later” means they came back and booked at least one of the same sessions.
            </p>
          </div>
        </>
      )}
    </>
  );
}

function CheckoutTable({ rows, seeFamilies, live }: { rows: CheckoutRow[]; seeFamilies: boolean; live?: boolean }) {
  return (
    <Table head={["Family", "Contact", "What they chose", live ? "Hold ends" : "Started", ""]} dense>
      {rows.map((r) => (
        <tr key={r.booking.id}>
          <td>
            {seeFamilies ? (
              <Link href={`/admin/families/${r.family.id}`} className="font-medium text-ink hover:text-blue">
                {r.family.name}
              </Link>
            ) : (
              <span className="font-medium text-ink">{r.family.name}</span>
            )}
            <Link href={`/admin/bookings/${r.booking.id}`} className="block text-[0.75rem] text-ink-soft hover:text-blue">
              {r.booking.reference}
            </Link>
          </td>
          <td className="text-[0.82rem]">
            {r.contact && seeFamilies ? (
              <>
                <span className="block text-ink">{r.contact.name}</span>
                <a href={`mailto:${r.contact.email}`} className="block text-blue hover:underline">
                  {r.contact.email}
                </a>
                {r.contact.phone ? (
                  <a href={`tel:${r.contact.phone}`} className="block text-ink-soft hover:text-blue">
                    {r.contact.phone}
                  </a>
                ) : null}
              </>
            ) : (
              <span className="text-ink-soft">—</span>
            )}
          </td>
          <td className="text-[0.82rem]">
            <ul className="space-y-0.5">
              {r.lines.map((l, i) => (
                <li key={i}>
                  {l.session.name} <span className="text-ink-soft">· {when(l.session)}{l.childName ? ` · ${l.childName}` : ""}</span>
                </li>
              ))}
            </ul>
          </td>
          <td className="whitespace-nowrap text-[0.8rem] text-ink-soft">
            {live && r.booking.holdExpiresAt ? fmtTime(r.booking.holdExpiresAt) : fmtDateTime(r.booking.createdAt)}
            {!live && r.attempts > 1 ? <span className="block">Tried {r.attempts} times</span> : null}
          </td>
          <td className="text-right">{live ? <Status kind="booking" value={r.booking.status} /> : r.bookedLater ? <Pill tone="positive" icon="check">Booked later</Pill> : <Pill tone="warning" icon="alert">Not booked</Pill>}</td>
        </tr>
      ))}
    </Table>
  );
}
