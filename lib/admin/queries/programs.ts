import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import {
  blackoutDates,
  capacityPools,
  children,
  cohorts,
  families,
  formRequirements,
  formTemplates,
  locations,
  programCohorts,
  programPrices,
  programs,
  scheduleSeries,
  sessions,
  waitlistEntries,
} from "@/lib/db/schema";
import { availabilityFor } from "@/lib/ops/capacity";
import { blockingPaperwork } from "@/lib/ops/forms";
import { ageInMonths, todayLA } from "@/lib/time";

export async function referenceData(db: Executor) {
  const [locs, cohortRows, pools, templates, progs] = await Promise.all([
    db.select().from(locations).where(eq(locations.active, true)).orderBy(asc(locations.name)),
    db.select().from(cohorts).where(eq(cohorts.active, true)).orderBy(asc(cohorts.sortOrder)),
    db.select().from(capacityPools).orderBy(asc(capacityPools.name)),
    db.select().from(formTemplates).where(eq(formTemplates.status, "active")).orderBy(asc(formTemplates.title)),
    db.select().from(programs).orderBy(asc(programs.name)),
  ]);
  return { locations: locs, cohorts: cohortRows, pools, templates, programs: progs };
}

export async function programDetail(db: Executor, id: string) {
  const [program] = await db.select().from(programs).where(eq(programs.id, id));
  if (!program) return null;
  const today = todayLA();
  const [cohortLinks, prices, reqs, series, upcoming] = await Promise.all([
    db.select().from(programCohorts).where(eq(programCohorts.programId, id)),
    db.select().from(programPrices).where(eq(programPrices.programId, id)).orderBy(desc(programPrices.active), asc(programPrices.label)),
    db
      .select({ r: formRequirements, t: formTemplates })
      .from(formRequirements)
      .innerJoin(formTemplates, eq(formTemplates.id, formRequirements.templateId))
      .where(and(eq(formRequirements.programId, id), eq(formRequirements.scope, "program"), eq(formRequirements.active, true))),
    db.select().from(scheduleSeries).where(eq(scheduleSeries.programId, id)).orderBy(desc(scheduleSeries.startsOn)),
    db
      .select()
      .from(sessions)
      .where(and(eq(sessions.programId, id), gte(sessions.localDate, today)))
      .orderBy(asc(sessions.startsAt))
      .limit(12),
  ]);
  const seriesCounts = series.length
    ? await db
        .select({ seriesId: sessions.seriesId, total: sql<number>`count(*)::int`, upcoming: sql<number>`count(*) filter (where ${sessions.localDate} >= ${today})::int` })
        .from(sessions)
        .where(
          inArray(
            sessions.seriesId,
            series.map((s) => s.id),
          ),
        )
        .groupBy(sessions.seriesId)
    : [];
  const avail = await availabilityFor(
    db,
    upcoming.map((s) => s.id),
  );
  return {
    program,
    cohortIds: cohortLinks.map((c) => c.cohortId),
    prices,
    requirements: reqs,
    series: series.map((s) => ({ ...s, counts: seriesCounts.find((c) => c.seriesId === s.id) ?? { total: 0, upcoming: 0 } })),
    upcoming: upcoming.map((s) => ({ session: s, availability: avail.get(s.id)! })),
  };
}

export async function scheduleRange(db: Executor, from: string, to: string, f: { programId?: string; locationId?: string; cohortId?: string }) {
  const rows = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(
      and(
        gte(sessions.localDate, from),
        lte(sessions.localDate, to),
        f.programId ? eq(sessions.programId, f.programId) : undefined,
        f.locationId ? eq(sessions.locationId, f.locationId) : undefined,
        f.cohortId ? eq(sessions.cohortId, f.cohortId) : undefined,
        sql`${programs.status} <> 'archived'`,
      ),
    )
    .orderBy(asc(sessions.startsAt));
  const avail = await availabilityFor(
    db,
    rows.map((r) => r.s.id),
  );
  return rows.map((r) => ({ session: r.s, program: r.p, availability: avail.get(r.s.id)! }));
}

export async function blackoutList(db: Executor) {
  return db
    .select({ b: blackoutDates, p: programs, l: locations })
    .from(blackoutDates)
    .leftJoin(programs, eq(programs.id, blackoutDates.programId))
    .leftJoin(locations, eq(locations.id, blackoutDates.locationId))
    .where(gte(blackoutDates.endsOn, todayLA()))
    .orderBy(asc(blackoutDates.startsOn));
}

export async function waitlistRows(db: Executor, f: { programId?: string; sessionId?: string; status?: string }) {
  const rows = await db
    .select({ e: waitlistEntries, p: programs, s: sessions, f: families })
    .from(waitlistEntries)
    .innerJoin(programs, eq(programs.id, waitlistEntries.programId))
    .innerJoin(families, eq(families.id, waitlistEntries.familyId))
    .leftJoin(sessions, eq(sessions.id, waitlistEntries.sessionId))
    .where(
      and(
        f.programId ? eq(waitlistEntries.programId, f.programId) : undefined,
        f.sessionId ? eq(waitlistEntries.sessionId, f.sessionId) : undefined,
        f.status ? eq(waitlistEntries.status, f.status) : inArray(waitlistEntries.status, ["waiting", "offered"]),
      ),
    )
    .orderBy(asc(waitlistEntries.createdAt));
  const childIds = [...new Set(rows.flatMap((r) => r.e.childIds))];
  const kids = childIds.length ? await db.select().from(children).where(inArray(children.id, childIds)) : [];
  const sessionIds = [...new Set(rows.map((r) => r.s?.id).filter(Boolean) as string[])];
  const avail = await availabilityFor(db, sessionIds);
  // Position in queue per session among waiting entries.
  const positions = new Map<string, number>();
  const counters = new Map<string, number>();
  for (const r of rows) {
    if (r.e.status !== "waiting") continue;
    const k = r.e.sessionId ?? r.e.programId;
    const n = (counters.get(k) ?? 0) + 1;
    counters.set(k, n);
    positions.set(r.e.id, n);
  }
  const withEligibility = rows.map((r) => {
    const entryKids = r.e.childIds.map((id) => kids.find((k) => k.id === id)).filter(Boolean) as (typeof children.$inferSelect)[];
    const onDate = r.s?.localDate ?? todayLA();
    const ineligible = entryKids
      .filter((k) => {
        const a = ageInMonths(k.birthDate, onDate);
        return (r.p.minAgeMonths != null && a < r.p.minAgeMonths) || (r.p.maxAgeMonths != null && a > r.p.maxAgeMonths);
      })
      .map((k) => k.preferredName || k.firstName);
    const remaining = r.s ? avail.get(r.s.id)!.remaining : null;
    return { ...r, kids: entryKids, ineligible, remaining, position: positions.get(r.e.id) ?? null };
  });
  // Paperwork that blocks booking also blocks an offer (the hold uses the same booking rules).
  const out = [];
  for (const r of withEligibility) {
    let blocking: string[] = [];
    if (r.e.status === "waiting" && r.s) {
      const items = await blockingPaperwork(db, { familyId: r.f.id, childIds: r.e.childIds, programIds: [r.p.id], sessionIds: [r.s.id], onDate: r.s.localDate });
      blocking = [...new Set(items.map((i) => i.title))];
    }
    out.push({ ...r, blocking, canOffer: r.e.status === "waiting" && !!r.s && r.remaining != null && r.remaining >= r.e.partySize && r.ineligible.length === 0 });
  }
  return out;
}

export async function familiesForPicker(db: Executor) {
  const fams = await db.select({ id: families.id, name: families.name }).from(families).where(eq(families.status, "active")).orderBy(asc(families.name));
  const kids = await db.select({ id: children.id, familyId: children.familyId, firstName: children.firstName, preferredName: children.preferredName, birthDate: children.birthDate }).from(children).where(eq(children.status, "active"));
  return fams.map((f) => ({ ...f, children: kids.filter((k) => k.familyId === f.id) }));
}
