/**
 * Yalla Flex & Club Yalla operations access (permission "flexclub.view").
 *
 * Staff with this permission, but without the wider "families.view", can open only the families who
 * use Yalla Flex or Club Yalla: their contact card, children, care details and forms. Nothing about
 * bookings, billing or messages, and no other family.
 *
 * A family is in scope while they have a Club Yalla membership that isn't over (active, upcoming or
 * paused), or a Yalla Flex booking in the last 90 days or still to come.
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { bookingItems, bookings, documents, formSubmissions, memberships, programs, sessions } from "@/lib/db/schema";
import { addDaysISO, todayLA } from "@/lib/time";
import type { Permission } from "./permissions";
import { can, type StaffContext } from "./staff";

import { FLEX_SLUG } from "@/lib/booking/flex";
export { FLEX_SLUG };
const LIVE_MEMBERSHIP = ["active", "upcoming", "paused"];
const LIVE_BOOKING = ["confirmed", "held", "requested", "pending_payment"];
const LOOKBACK_DAYS = 90;

/** True when this person sees Flex & Club Yalla families only (not every family). */
export const flexClubOnly = (staff: StaffContext) => !can(staff, "families.view") && can(staff, "flexclub.view");

/** Every family in scope, with which of the two programs they use. */
export async function flexClubFamilies(db: Executor, now = new Date()): Promise<Map<string, { flex: boolean; club: boolean }>> {
  const since = addDaysISO(todayLA(now), -LOOKBACK_DAYS);
  const [flex, club] = await Promise.all([
    db
      .selectDistinct({ familyId: bookings.familyId })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
      .innerJoin(programs, eq(programs.id, sessions.programId))
      .where(and(eq(programs.slug, FLEX_SLUG), inArray(bookings.status, LIVE_BOOKING), inArray(bookingItems.status, ["confirmed", "held"]), gte(sessions.localDate, since))),
    db.selectDistinct({ familyId: memberships.familyId }).from(memberships).where(inArray(memberships.status, LIVE_MEMBERSHIP)),
  ]);
  const out = new Map<string, { flex: boolean; club: boolean }>();
  for (const r of flex) out.set(r.familyId, { flex: true, club: false });
  for (const r of club) out.set(r.familyId, { flex: out.get(r.familyId)?.flex ?? false, club: true });
  return out;
}

export async function familyInFlexClub(db: Executor, familyId: string, now = new Date()) {
  return (await flexClubFamilies(db, now)).has(familyId);
}

/** May this person open this family's record (contact card, children, care, forms)? */
export async function canOpenFamily(db: Executor, staff: StaffContext, familyId: string) {
  if (can(staff, "families.view")) return true;
  if (!can(staff, "flexclub.view")) return false;
  return familyInFlexClub(db, familyId);
}

/**
 * For pages a Flex & Club Yalla person may open: the permissions to render that one family with. They
 * see contact details, care information and forms (read-only), and never bookings, billing, messages,
 * memberships' prices or the record history.
 */
export function asFamilyViewer(staff: StaffContext): StaffContext {
  if (!flexClubOnly(staff)) return staff;
  const extra: Permission[] = ["families.view", "children.care", "forms.view", "forms.documents"];
  return { ...staff, permissions: [...new Set([...staff.permissions, ...extra])] };
}

/** May this person open this form submission? */
export async function canOpenSubmission(db: Executor, staff: StaffContext, submissionId: string) {
  if (can(staff, "forms.view")) return true;
  if (!can(staff, "flexclub.view")) return false;
  const [s] = await db.select({ familyId: formSubmissions.familyId }).from(formSubmissions).where(eq(formSubmissions.id, submissionId));
  return !!s && familyInFlexClub(db, s.familyId);
}

/** May this person download this document (a signed form or a family's uploaded paperwork)? */
export async function canOpenDocument(db: Executor, staff: StaffContext, documentId: string) {
  if (can(staff, "forms.documents")) return true;
  if (!can(staff, "flexclub.view")) return false;
  const [doc] = await db.select({ familyId: documents.familyId }).from(documents).where(eq(documents.id, documentId));
  if (!doc) return false;
  const linked = await db.select({ familyId: formSubmissions.familyId }).from(formSubmissions).where(eq(formSubmissions.documentId, documentId));
  const owners = [...new Set([doc.familyId, ...linked.map((r) => r.familyId)].filter((x): x is string => !!x))];
  if (!owners.length) return false;
  const scope = await flexClubFamilies(db);
  return owners.every((f) => scope.has(f));
}
