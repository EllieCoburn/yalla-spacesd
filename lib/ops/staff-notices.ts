/**
 * Emails to the team about cancellations, sent right away to the staff notification addresses
 * (Settings → Notifications): who cancelled what, for whom, what happened to the money, and how
 * many spots that session has now. They never block the cancellation itself.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { bookingItems, bookings, children, guardians, programs, sessions, spaceReservationGroups, spaceReservations, workspaces } from "@/lib/db/schema";
import { notifyStaff } from "@/lib/notify";
import { trustedBaseUrl } from "@/lib/base-url";
import { fmtDate, fmtTime } from "@/lib/time";
import { availabilityFor } from "./capacity";
import { staffRecipients } from "./enquiries";

async function parentName(db: Executor, familyId: string) {
  const [g] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  return g ? `${g.firstName} ${g.lastName}` : "A family";
}

async function send(db: Executor, vars: { summary: string; details: string; reference: string; link: string }, related: { type: string; id: string }) {
  for (const to of await staffRecipients(db)) await notifyStaff(db, { key: "staff_booking_cancelled", to, vars, relatedType: related.type, relatedId: related.id });
}

/** A care booking (or some of its days) was cancelled. `money` says what happened to what they paid. */
export async function notifyTeamOfCancellation(db: Executor, input: { bookingId: string; itemIds: string[]; actor: Actor; money: string }) {
  try {
    if (!input.itemIds.length) return;
    const [b] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
    if (!b) return;
    const rows = await db
      .select({ item: bookingItems, session: sessions, program: programs, child: children })
      .from(bookingItems)
      .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
      .innerJoin(programs, eq(programs.id, sessions.programId))
      .leftJoin(children, eq(children.id, bookingItems.childId))
      .where(inArray(bookingItems.id, input.itemIds));
    if (!rows.length) return;
    const parent = await parentName(db, b.familyId);
    const who = input.actor.type === "staff" ? `${input.actor.name} (Team Yalla) cancelled ${parent}’s booking` : `${parent} cancelled`;
    const avail = await availabilityFor(db, [...new Set(rows.map((r) => r.session.id))]);
    const bySession = new Map<string, typeof rows>();
    for (const r of rows) bySession.set(r.session.id, [...(bySession.get(r.session.id) ?? []), r]);
    const lines: string[] = [];
    const spots: string[] = [];
    for (const group of [...bySession.values()].sort((a, c) => a[0].session.startsAt.getTime() - c[0].session.startsAt.getTime())) {
      const s = group[0].session;
      const what = s.title ?? group[0].program.name;
      const kids = group.map((r) => (r.child ? `${r.child.firstName} ${r.child.lastName}` : "a child")).join(" and ");
      lines.push(`${what} on ${fmtDate(s.localDate, "EEEE, MMMM d, yyyy")} (${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)}) for ${kids}`);
      const left = Math.max(0, avail.get(s.id)?.remaining ?? 0);
      spots.push(`You now have ${left} ${left === 1 ? "spot" : "spots"} in ${what} on ${fmtDate(s.localDate, "MMMM d")}.`);
    }
    const details = `${who}: ${lines.join("; ")}.\n\n${input.money}\n\n${spots.join("\n")}`;
    const first = [...bySession.values()][0][0];
    await send(
      db,
      { summary: `${parent} · ${first.session.title ?? first.program.name} · ${fmtDate(first.session.localDate, "MMM d")}${bySession.size > 1 ? ` + ${bySession.size - 1} more` : ""}`, details, reference: b.reference, link: `${trustedBaseUrl()}/admin/bookings/${b.id}` },
      { type: "booking", id: b.id },
    );
  } catch (e) {
    console.error("[staff cancellation email failed]", (e as Error).message?.slice(0, 160));
  }
}

/** A workspace reservation was cancelled. */
export async function notifyTeamOfSpaceCancellation(db: Executor, input: { groupId: string; actor: Actor; money: string }) {
  try {
    const [g] = await db.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, input.groupId));
    if (!g) return;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, g.workspaceId));
    const [first] = await db.select().from(spaceReservations).where(eq(spaceReservations.groupId, g.id)).orderBy(spaceReservations.startsAt).limit(1);
    const parent = await parentName(db, g.familyId);
    const who = input.actor.type === "staff" ? `${input.actor.name} (Team Yalla) cancelled ${parent}’s reservation` : `${parent} cancelled`;
    const when = first ? `${fmtDate(first.localDate, "EEEE, MMMM d, yyyy")} (${fmtTime(first.startsAt)}–${fmtTime(first.endsAt)})` : "";
    const details = `${who}: ${ws?.name ?? "a workspace"}${when ? ` on ${when}` : ""}.\n\n${input.money}\n\n${ws?.name ?? "That space"} is free again for that time.`;
    await send(db, { summary: `${parent} · ${ws?.name ?? "Workspace"}${first ? ` · ${fmtDate(first.localDate, "MMM d")}` : ""}`, details, reference: g.reference, link: `${trustedBaseUrl()}/admin/spaces/${g.id}` }, { type: "space_reservation", id: g.id });
  } catch (e) {
    console.error("[staff space cancellation email failed]", (e as Error).message?.slice(0, 160));
  }
}
