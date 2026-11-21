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
import { childDay } from "@/lib/booking/addons";
import { fmtDate, fmtTime } from "@/lib/time";
import { availabilityFor } from "./capacity";
import { notifyCohortsOfCancelledDropIns, teamRecipients, topicForProgram, type NoticeTopic } from "./team-notices";

const dollars = (c: number) => "$" + (c / 100).toFixed(2);

async function parentName(db: Executor, familyId: string) {
  const [g] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  return g ? `${g.firstName} ${g.lastName}` : "A family";
}

async function send(db: Executor, topics: NoticeTopic[], vars: { summary: string; details: string; reference: string; link: string }, related: { type: string; id: string }) {
  for (const to of await teamRecipients(db, topics)) await notifyStaff(db, { key: "staff_booking_cancelled", to, vars, relatedType: related.type, relatedId: related.id });
}

/** A care booking (or some of its days) was cancelled. `money` says what happened to what they paid. */
export async function notifyTeamOfCancellation(db: Executor, input: { bookingId: string; itemIds: string[]; actor: Actor; money: string; walletCents?: number }) {
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
    const avail = await availabilityFor(db, [...new Set(rows.map((r) => r.session.id))]);
    const bySession = new Map<string, typeof rows>();
    for (const r of rows) bySession.set(r.session.id, [...(bySession.get(r.session.id) ?? []), r]);
    // Same glanceable layout as the new-booking email (">>", "!!", "~~" lines are styled in the email).
    const blocks: string[] = [];
    const sorted = [...bySession.values()].sort((a, c) => a[0].session.startsAt.getTime() - c[0].session.startsAt.getTime());
    for (const group of sorted) {
      const s = group[0].session;
      const what = s.title ?? group[0].program.name;
      const left = Math.max(0, avail.get(s.id)?.remaining ?? 0);
      const days = group.map((r) => childDay(r.program, r.session, r.item.addons));
      const same = days.every((d) => d.endsAt.getTime() === days[0].endsAt.getTime());
      blocks.push(`>> ${what}\n${fmtDate(s.localDate, "EEEE, MMMM d, yyyy")} · ${fmtTime(s.startsAt)}–${fmtTime(same ? days[0].endsAt : s.endsAt)}${same && days[0].label ? ` · ${days[0].label}` : ""}`);
      blocks.push([`Parent: ${parent}`, ...group.map((r) => `Child: ${r.child ? `${r.child.firstName} ${r.child.lastName}` : "not named"}`)].join("\n"));
      blocks.push(`!! ${left} | ${left === 1 ? "spot" : "spots"} now open in that age group for ${fmtDate(s.localDate, "MMMM d")}`);
    }
    blocks.push(input.walletCents ? `!! ${dollars(input.walletCents)} | returned to their Yalla Wallet` : `~~ ${input.money}`);
    blocks.push(`Cancelled by: ${input.actor.type === "staff" ? `${input.actor.name} (Team Yalla)` : `${parent} in the Family Portal`}\nReference: ${b.reference}`);
    const details = blocks.join("\n\n");
    const first = [...bySession.values()][0][0];
    await send(
      db,
      [...new Set(rows.map((r) => topicForProgram(r.program)))],
      { summary: `${parent} · ${first.session.title ?? first.program.name} · ${fmtDate(first.session.localDate, "MMM d")}${bySession.size > 1 ? ` + ${bySession.size - 1} more` : ""}`, details, reference: b.reference, link: `${trustedBaseUrl()}/admin/bookings/${b.id}` },
      { type: "booking", id: b.id },
    );
  } catch (e) {
    console.error("[staff cancellation email failed]", (e as Error).message?.slice(0, 160));
  }  await notifyCohortsOfCancelledDropIns(db, input.itemIds);
}

/** A workspace reservation was cancelled. */
export async function notifyTeamOfSpaceCancellation(db: Executor, input: { groupId: string; actor: Actor; money: string }) {
  try {
    const [g] = await db.select().from(spaceReservationGroups).where(eq(spaceReservationGroups.id, input.groupId));
    if (!g) return;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, g.workspaceId));
    const [first] = await db.select().from(spaceReservations).where(eq(spaceReservations.groupId, g.id)).orderBy(spaceReservations.startsAt).limit(1);
    const parent = await parentName(db, g.familyId);
    const when = first ? `${fmtDate(first.localDate, "EEEE, MMMM d, yyyy")} · ${fmtTime(first.startsAt)}–${fmtTime(first.endsAt)}` : "";
    const details = [
      `>> ${ws?.name ?? "Workspace"}${when ? `\n${when}` : ""}`,
      `Parent: ${parent}\nCancelled by: ${input.actor.type === "staff" ? `${input.actor.name} (Team Yalla)` : `${parent} in the Family Portal`}\nReference: ${g.reference}`,
      `~~ ${input.money} ${ws?.name ?? "The space"} is free again for that time.`,
    ].join("\n\n");
    await send(db, ["spaces"], { summary: `${parent} · ${ws?.name ?? "Workspace"}${first ? ` · ${fmtDate(first.localDate, "MMM d")}` : ""}`, details, reference: g.reference, link: `${trustedBaseUrl()}/admin/spaces/${g.id}` }, { type: "space_reservation", id: g.id });
  } catch (e) {
    console.error("[staff space cancellation email failed]", (e as Error).message?.slice(0, 160));
  }
}
