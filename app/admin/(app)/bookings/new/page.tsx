import Link from "next/link";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { NewBookingForm, type SessionOption } from "@/components/admin/bookings/NewBookingForm";
import { btn, Card, Empty, inputCls, Notice, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { children, cohorts, families, guardians, programs, sessions } from "@/lib/db/schema";
import { priceFor } from "@/lib/ops/bookings";
import { availabilityFor, publicState } from "@/lib/ops/capacity";
import { searchFamilies } from "@/lib/ops/families";
import { blockingPaperwork } from "@/lib/ops/forms";
import { addDaysISO, ageInMonths, ageLabel, fmtDate, fmtTime, todayLA } from "@/lib/time";
import { createBookingAction } from "../actions";

export const metadata = { title: "New booking" };

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ q?: string; family?: string; program?: string; from?: string }> }) {
  const staff = await requirePermission("bookings.manage");
  const sp = await searchParams;
  const db = getDb();

  if (!sp.family) {
    const results = await searchFamilies(db, sp.q ?? "", 30);
    const guards = results.length ? await db.select().from(guardians).where(and(inArray(guardians.familyId, results.map((r) => r.id)), eq(guardians.isPrimary, true))) : [];
    return (
      <>
        <PageHeader title="New booking" subtitle="Step 1 of 2 · Choose the family" back={{ href: "/admin/bookings", label: "Bookings" }} />
        <Card>
          <form action="/admin/bookings/new" className="flex flex-wrap gap-2" role="search">
            <label htmlFor="family-q" className="sr-only">
              Search families
            </label>
            <input id="family-q" name="q" defaultValue={sp.q ?? ""} placeholder="Family name, guardian, email, phone or child" className={`${inputCls} max-w-md flex-1`} autoFocus />
            <button className={btn.primary}>Search</button>
          </form>
          <ul className="mt-4 divide-y divide-ink/6">
            {results.length === 0 ? (
              <li className="py-6">
                <Empty title="No families found">
                  Check the spelling, or{" "}
                  <Link href="/admin/families/new" className="text-blue underline">
                    add a new family
                  </Link>{" "}
                  first.
                </Empty>
              </li>
            ) : null}
            {results.map((f) => {
              const g = guards.find((x) => x.familyId === f.id);
              return (
                <li key={f.id}>
                  <Link href={`/admin/bookings/new?family=${f.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-mist/30">
                    <span>
                      <span className="block text-[0.9rem] text-ink">{f.name}</span>
                      <span className="text-[0.78rem] text-ink-soft">{g ? `${g.firstName} ${g.lastName} · ${g.email}` : "No primary guardian"}</span>
                    </span>
                    <span className="text-[0.82rem] text-blue">Choose →</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </>
    );
  }

  const [family] = await db.select().from(families).where(eq(families.id, sp.family));
  if (!family) return <Notice tone="critical">Family not found.</Notice>;
  const kids = await db.select({ c: children, cohortName: cohorts.name }).from(children).leftJoin(cohorts, eq(cohorts.id, children.cohortId)).where(and(eq(children.familyId, family.id), eq(children.status, "active"))).orderBy(asc(children.birthDate));
  const progs = await db.select().from(programs).where(and(ne(programs.status, "archived"), ne(programs.kind, "membership"))).orderBy(asc(programs.name));
  const program = progs.find((p) => p.id === sp.program) ?? null;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : todayLA();

  let options: SessionOption[] = [];
  if (program) {
    const rows = await db
      .select({ s: sessions, cohortName: cohorts.name })
      .from(sessions)
      .leftJoin(cohorts, eq(cohorts.id, sessions.cohortId))
      .where(and(eq(sessions.programId, program.id), gte(sessions.localDate, from), lte(sessions.localDate, addDaysISO(from, 42))))
      .orderBy(asc(sessions.startsAt))
      .limit(80);
    const avail = await availabilityFor(
      db,
      rows.map((r) => r.s.id),
    );
    for (const { s, cohortName } of rows) {
      const a = avail.get(s.id)!;
      const st = publicState(s, program, a.remaining);
      const prices: Record<string, number | null> = {};
      for (const k of kids) prices[k.c.id] = (await priceFor(db, s, program, k.c)).cents;
      const general = (await priceFor(db, s, program, null)).cents;
      options.push({
        id: s.id,
        label: s.title ?? program.name,
        date: fmtDate(s.localDate, "EEE d MMM"),
        time: `${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)}`,
        cohortName,
        remaining: a.remaining,
        hardRoom: (s.hardCapacity ?? a.effectiveCapacity) - a.effectiveCapacity,
        state: s.endsAt < new Date() ? "past" : st.state,
        stateLabel: s.endsAt < new Date() ? "Already happened" : st.state === "closed" ? st.reason : st.state === "not_offered" ? "Not offered" : st.state === "full" ? "Fully booked" : `${a.remaining} left`,
        prices,
        generalPrice: general,
        ages: kids.map((k) => ({ childId: k.c.id, months: ageInMonths(k.c.birthDate, s.localDate) })),
      });
    }
    options = options.filter((o) => o.state !== "past");
  }
  const blocking = program
    ? await blockingPaperwork(db, { familyId: family.id, childIds: kids.map((k) => k.c.id), programIds: [program.id] })
    : [];

  return (
    <>
      <PageHeader title={`New booking for ${family.name}`} subtitle="Step 2 of 2 · Children, program and sessions" back={{ href: "/admin/bookings/new", label: "Choose a different family" }} />
      {kids.length === 0 ? (
        <Notice tone="warning" title="This family has no children on file">
          <Link href={`/admin/families/${family.id}`} className="underline">
            Add a child to the family
          </Link>{" "}
          before booking per-child programs.
        </Notice>
      ) : null}
      <Card className="mb-5">
        <form action="/admin/bookings/new" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="family" value={family.id} />
          <label className="flex flex-col gap-1 text-[0.8rem] font-medium text-ink">
            Program
            <select name="program" defaultValue={program?.id ?? ""} className={`${inputCls} min-w-[14rem]`}>
              <option value="">Choose a program…</option>
              {progs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.status !== "published" ? ` (${p.status})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[0.8rem] font-medium text-ink">
            Sessions from
            <input type="date" name="from" defaultValue={from} className={inputCls} />
          </label>
          <button className={btn.secondary}>Show sessions</button>
        </form>
      </Card>
      {program ? (
        <NewBookingForm
          action={createBookingAction}
          familyId={family.id}
          program={{ id: program.id, name: program.name, unit: program.bookingUnit, min: program.minAgeMonths, max: program.maxAgeMonths, status: program.status }}
          kids={kids.map((k) => ({ id: k.c.id, name: `${k.c.preferredName || k.c.firstName} ${k.c.lastName}`, age: ageLabel(k.c.birthDate, todayLA()), cohort: k.cohortName }))}
          sessions={options}
          canOverride={can(staff, "capacity.override")}
          blocking={[...new Set(blocking.map((b) => b.title))]}
        />
      ) : (
        <Card>
          <Empty title="Choose a program">Club Yalla memberships are managed from Club Yalla, not as bookings.</Empty>
        </Card>
      )}
    </>
  );
}
