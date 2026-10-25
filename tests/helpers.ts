import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import type { Actor } from "@/lib/audit";
import { ensureDefaultRoles } from "@/lib/auth/staff";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import { zonedDateTime, addDaysISO, todayLA } from "@/lib/time";

export const db = () => getDb();
export const owner: Actor = { type: "staff", id: "staff-owner", name: "Test Owner", permissions: ALL_PERMISSIONS };

export async function reset() {
  const d = db();
  const tables = await d.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '__drizzle%'`);
  await d.execute(sql.raw(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`));
  await ensureDefaultRoles(d);
}

let n = 0;
export async function program(overrides: Partial<typeof s.programs.$inferInsert> = {}) {
  n++;
  const [loc] = await db().insert(s.locations).values({ name: `Loc ${n}` }).returning();
  const [p] = await db()
    .insert(s.programs)
    .values({ slug: `p-${n}-${Math.random().toString(36).slice(2, 6)}`, name: `Program ${n}`, kind: "drop_in", status: "published", locationId: loc.id, priceCents: 15000, ...overrides })
    .returning();
  return p;
}

export async function session(programId: string, overrides: Partial<typeof s.sessions.$inferInsert> = {}, daysAhead = 7, start = "08:30", end = "16:30") {
  const d = addDaysISO(todayLA(), daysAhead);
  const [row] = await db()
    .insert(s.sessions)
    .values({ programId, localDate: d, startsAt: zonedDateTime(d, start), endsAt: zonedDateTime(d, end), capacity: 2, ...overrides })
    .returning();
  return row;
}

export async function family(name = "Test", kids: { first: string; birth: string; cohortId?: string }[] = [{ first: "Kid", birth: "2023-01-15" }]) {
  n++;
  const [f] = await db().insert(s.families).values({ name: `${name} family ${n}`, isSample: true }).returning();
  const [g] = await db()
    .insert(s.guardians)
    .values({ familyId: f.id, firstName: name, lastName: `Fam${n}`, email: `g${n}-${Math.random().toString(36).slice(2, 7)}@example.com`, isPrimary: true, canViewBilling: true })
    .returning();
  const children = [];
  for (const k of kids) {
    const [c] = await db().insert(s.children).values({ familyId: f.id, firstName: k.first, lastName: `Fam${n}`, birthDate: k.birth, cohortId: k.cohortId ?? null }).returning();
    children.push(c);
  }
  return { family: f, guardian: g, children };
}
