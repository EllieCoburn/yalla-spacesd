"use server";

import { ilike, or, sql } from "drizzle-orm";
import type { SearchResult } from "@/components/admin/Shell";
import { getStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { bookings, children, families, guardians } from "@/lib/db/schema";

/** Global search, limited to what the signed-in staff member may see. */
export async function searchAll(q: string): Promise<SearchResult[]> {
  const staff = await getStaff();
  if (!staff || (staff.mfaEnabled && !staff.mfaVerified)) return [];
  const term = `%${q.trim().slice(0, 80)}%`;
  const db = getDb();
  const out: SearchResult[] = [];
  if (can(staff, "bookings.view") && /^yl-?/i.test(q.trim())) {
    const rows = await db
      .select({ id: bookings.id, ref: bookings.reference, status: bookings.status })
      .from(bookings)
      .where(ilike(bookings.reference, `%${q.trim().replace(/^yl-?/i, "")}%`))
      .limit(6);
    out.push(...rows.map((r) => ({ href: `/admin/bookings/${r.id}`, title: r.ref, detail: r.status.replace("_", " "), type: "Booking" })));
  }
  if (can(staff, "families.view")) {
    const kids = await db
      .select({ id: children.id, first: children.firstName, last: children.lastName, preferred: children.preferredName, familyName: families.name })
      .from(children)
      .innerJoin(families, sql`${families.id} = ${children.familyId}`)
      .where(or(ilike(children.firstName, term), ilike(children.lastName, term), ilike(children.preferredName, term)))
      .limit(6);
    out.push(...kids.map((k) => ({ href: `/admin/children/${k.id}`, title: `${k.preferred || k.first} ${k.last}`, detail: k.familyName, type: "Child" })));
    const fams = await db
      .selectDistinct({ id: families.id, name: families.name })
      .from(families)
      .leftJoin(guardians, sql`${guardians.familyId} = ${families.id}`)
      .where(or(ilike(families.name, term), ilike(guardians.firstName, term), ilike(guardians.lastName, term), ilike(guardians.email, term), ilike(guardians.phone, term)))
      .limit(6);
    out.push(...fams.map((f) => ({ href: `/admin/families/${f.id}`, title: f.name, detail: "Family", type: "Family" })));
  }
  return out;
}
