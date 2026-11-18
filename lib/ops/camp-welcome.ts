/**
 * The Camp Yalla first-day welcome: one warm letter from Team Yalla per family, with everything for
 * their first camp day (drop-off and pickup, what to bring, the front door code, the family's check-in
 * code for the lobby kiosk, parking and extras). It is also that evening's "see you tomorrow" reminder
 * for camp. Camp doesn't use Brightwheel: families check in at the kiosk with their 4-digit code
 * (lib/ops/checkin.ts).
 *
 * Works like the Yalla Flex welcome (lib/ops/flex-welcome.ts):
 * - A family's first camp day is the earliest day they have confirmed Camp Yalla care.
 * - Sent the evening before (the 6pm run). A family who books after that run, or the same morning,
 *   gets it as soon as the booking is confirmed. The early-morning run catches anyone still missing it.
 * - Sent once per family, ever (`families.camp_welcome_sent_at` is claimed before sending).
 * - Only for future families: the first time it runs, every family who had already booked camp is
 *   marked as welcomed.
 * - Parents drop off and leave, so there are no coworking, Wi-Fi or private-space lines.
 */
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { bookingItems, bookings, children, families, guardians, programs, sessions, settings } from "@/lib/db/schema";
import { trustedBaseUrl } from "@/lib/base-url";
import { addDaysISO, fmtDate, fmtTime, todayLA, zonedDateTime } from "@/lib/time";
import { getPolicy } from "./settings";
import { CAMP_FOOD_NOTE, campGroupFor, campWhatToBring, type CampGroup } from "@/content/camp-what-to-bring";
import { ensureCheckinCode } from "./checkin";
import { EVENING_SEND, FRONT_DOOR_CODE, PARKING_PATH, WHAT_TO_BRING_PATH, joinNames } from "./flex-welcome";

const CAMP_KIND = "camp";

export type CampChild = { childId: string; name: string; group: CampGroup; arrives: string; pickup: string };

/** The children at camp on `date`, each one's age group, drop-off and pickup (with Early Bird and late stay). */
export async function campDayChildren(db: Executor, familyId: string, date: string): Promise<CampChild[]> {
  const rows = await db
    .select({ item: bookingItems, session: sessions, child: children })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookings.familyId, familyId), eq(programs.kind, CAMP_KIND), eq(bookingItems.status, "confirmed"), eq(bookings.status, "confirmed"), eq(sessions.localDate, date)))
    .orderBy(sessions.startsAt, children.birthDate);
  const seen = new Set<string>();
  const out: CampChild[] = [];
  for (const r of rows) {
    const group = campGroupFor(r.session.minAgeMonths);
    if (!group || seen.has(r.child.id)) continue;
    seen.add(r.child.id);
    const start = new Date(r.session.startsAt.getTime() - (r.item.addons.includes("early") ? 60 * 60_000 : 0));
    const end = new Date(r.session.endsAt.getTime() + (r.item.addons.includes("late") ? 90 * 60_000 : 0));
    out.push({ childId: r.child.id, name: (r.child.preferredName || r.child.firstName).trim(), group, arrives: fmtTime(start), pickup: fmtTime(end) });
  }
  return out;
}

/** The letter itself (between "Hi …," and "Warmly, Team Yalla"), worded for one child or several. */
export function campWelcomeLetter(kids: CampChild[], when: "today" | "tomorrow" = "tomorrow") {
  const many = kids.length > 1;
  const names = joinNames(kids.map((k) => k.name));
  const groups = [...new Set(kids.map((k) => k.group.label))];
  const where = groups.length === 1 ? `the ${groups[0]} group` : "their groups";
  const pickups: { time: string; names: string[] }[] = [];
  for (const k of kids) {
    const p = pickups.find((x) => x.time === k.pickup);
    if (p) p.names.push(k.name);
    else pickups.push({ time: k.pickup, names: [k.name] });
  }
  const pickup = joinNames(pickups.map((p) => `${joinNames(p.names)} at ${p.time}`));
  return [
    `We’re so glad ${names} ${many ? "are" : "is"} joining us at Camp Yalla ${when}! A member of Team Yalla will be there at drop-off to welcome you and show ${names} to ${where}.`,
    `Our team looks forward to getting to know ${names}—their interests, their ${many ? "personalities" : "personality"}, and the little things that help them feel at home. We’ll follow their lead as they play, explore and make new friends.`,
    `Please plan to pick up ${pickup}. Our team will share a little about their day before you head home.`,
    `Welcome to Camp Yalla. We’re happy you’re here, and we can’t wait for a day full of play.`,
  ].join("\n\n");
}

const BRING_LABEL: Record<string, string> = { daily: "Pack each day", sun: "Sun and layers", clothes: "Extra clothes", care: "Diapering", rest: "Rest time" };

/** One what-to-bring card per age group (children in the same group share a card). */
export function campBringBlocks(kids: CampChild[], baseUrl: string) {
  const groups: { names: string[]; group: CampGroup }[] = [];
  for (const k of kids) {
    const g = groups.find((x) => x.group.key === k.group.key);
    if (g) g.names.push(k.name);
    else groups.push({ names: [k.name], group: k.group });
  }
  const blocks: string[] = [];
  for (const g of groups) {
    const list = campWhatToBring(g.group.key);
    if (!list) continue;
    blocks.push(
      [
        `### What to bring for ${joinNames(g.names)} · ${g.group.label}`,
        ...list.sections.map((sec) => `${BRING_LABEL[sec.key] ?? sec.title}: ${sec.items.map((i) => i.short).join(", ")}`),
        `Please don’t bring: ${list.doNotBring.join(", ")}`,
      ].join("\n"),
    );
  }
  if (blocks.length) {
    blocks.push(`~~ ${CAMP_FOOD_NOTE}`);
    blocks.push(`Please label everything with your child’s name. [See the full list in your Family Portal](${baseUrl}${WHAT_TO_BRING_PATH}).`);
  }
  return blocks;
}

/** "A few details for camp": each child's day, what to bring, the front door, check-in, links. */
export function campDayDetails(kids: CampChild[], baseUrl: string, opts: { when?: "today" | "tomorrow"; date?: string; code: string }) {
  const many = kids.length > 1;
  const who = joinNames(kids.map((k) => k.name));
  return [
    "## A few details for camp",
    [
      opts.when === "tomorrow" && opts.date ? `### Tomorrow, ${fmtDate(opts.date, "EEEE, MMMM d")}` : "### Today",
      ...kids.map((k) => `${k.name}: ${k.group.label} · Drop off at ${k.arrives} · **Pick up at ${k.pickup}**`),
    ].join("\n"),
    ...campBringBlocks(kids, baseUrl),
    ["### Getting inside", `Front door code: ${FRONT_DOOR_CODE}`].join("\n"),
    ["### Checking in", `Your family’s check-in code: **${opts.code}**`].join("\n"),
    `When you arrive, enter this code at the kiosk in our lobby and tap ${many ? "each child’s name" : `${who}’s name`} to check in. Use it again at pickup to check out. It’s the same code for camp, weekend sessions and Happenings, and it’s always in your [Family Portal](${baseUrl}/portal/home).`,
    [
      "### Parking and extras",
      `• [View our parking guide](${baseUrl}${PARKING_PATH})`,
      ...(opts.date ? [`• [Add Early Bird or a late stay](${baseUrl}/portal/extras/${opts.date})`] : []),
    ].join("\n"),
  ].join("\n\n");
}

/** Families whose first-ever camp day is `date` and who haven't been welcomed. */
export async function campFamiliesDueWelcome(db: Executor, date: string) {
  const today = await db
    .selectDistinct({ familyId: bookings.familyId })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(families, eq(families.id, bookings.familyId))
    .where(and(eq(programs.kind, CAMP_KIND), eq(bookingItems.status, "confirmed"), eq(bookings.status, "confirmed"), eq(sessions.localDate, date), isNull(families.campWelcomeSentAt)));
  if (!today.length) return [];
  const ids = today.map((r) => r.familyId);
  const earlier = await db
    .selectDistinct({ familyId: bookings.familyId })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(programs.kind, CAMP_KIND), eq(bookingItems.status, "confirmed"), inArray(bookings.familyId, ids), lt(sessions.localDate, date)));
  const old = new Set(earlier.map((r) => r.familyId));
  return ids.filter((id) => !old.has(id));
}

/**
 * Sends the camp welcome to every new camp family due one.
 * - `evening: true` (the 6pm run): families whose first camp day is tomorrow.
 * - Otherwise (the early-morning run): anyone whose first camp day is today and still hasn't had it.
 * - `familyIds` (right after a booking): today, and also tomorrow once that evening's run has passed.
 */
export async function sendCampWelcomes(db: Executor, opts: { now?: Date; baseUrl?: string; familyIds?: string[]; bookingId?: string; evening?: boolean } = {}) {
  const now = opts.now ?? new Date();
  await startCampWelcomes(db, opts.bookingId);
  if (!(await getPolicy(db, "notifications.campWelcome"))) return { sent: 0 };
  const today = todayLA(now);
  const tomorrow = addDaysISO(today, 1);
  const targets: { date: string; when: "today" | "tomorrow" }[] = opts.familyIds
    ? [{ date: today, when: "today" }, ...(now >= zonedDateTime(today, EVENING_SEND) ? [{ date: tomorrow, when: "tomorrow" as const }] : [])]
    : opts.evening
      ? [{ date: tomorrow, when: "tomorrow" }]
      : [{ date: today, when: "today" }];
  let sent = 0;
  for (const t of targets) {
    let due = await campFamiliesDueWelcome(db, t.date);
    if (opts.familyIds) due = due.filter((id) => opts.familyIds!.includes(id));
    for (const familyId of due) {
      try {
        if (await sendCampWelcome(db, familyId, t.date, { now, baseUrl: opts.baseUrl, when: t.when })) sent++;
      } catch (e) {
        console.error("[camp welcome failed]", (e as Error).message?.slice(0, 160));
      }
    }
  }
  return { sent };
}

export const CAMP_WELCOME_STARTED_KEY = "campWelcome.startedAt";

/** Families whose first camp day is `date` and whose welcome went out in the last day: it is their reminder too. */
export async function campFamiliesWelcomedFor(db: Executor, date: string, familyIds: string[], now = new Date()) {
  if (!familyIds.length) return new Set<string>();
  const [started] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, CAMP_WELCOME_STARTED_KEY));
  const since = new Date(now.getTime() - 30 * 3600_000);
  const rows = await db
    .select({ familyId: bookings.familyId, first: sql<string>`min(${sessions.localDate})`, sentAt: sql<Date>`max(${families.campWelcomeSentAt})` })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(families, eq(families.id, bookings.familyId))
    .where(and(eq(programs.kind, CAMP_KIND), eq(bookingItems.status, "confirmed"), inArray(bookings.familyId, familyIds), sql`${families.campWelcomeSentAt} is not null`))
    .groupBy(bookings.familyId);
  const startedAt = started?.value ? new Date(String(started.value).replace(/^"|"$/g, "")).getTime() : null;
  return new Set(
    rows
      .filter((r) => r.first === date)
      .filter((r) => {
        const t = new Date(r.sentAt).getTime();
        return t >= since.getTime() && t !== startedAt;
      })
      .map((r) => r.familyId),
  );
}

/** First run: every family who booked camp before now is marked as welcomed (future families only). */
async function startCampWelcomes(db: Executor, bookingId?: string) {
  const startedAt = new Date();
  const [first] = await db
    .insert(settings)
    .values({ key: CAMP_WELCOME_STARTED_KEY, value: startedAt.toISOString(), updatedBy: "Camp welcome email (first run)" })
    .onConflictDoNothing({ target: settings.key })
    .returning({ key: settings.key });
  if (!first) return;
  await db.execute(sql`
    UPDATE families SET camp_welcome_sent_at = ${startedAt.toISOString()}::timestamptz
    WHERE camp_welcome_sent_at IS NULL AND id IN (
      SELECT b.family_id FROM bookings b
      JOIN booking_items i ON i.booking_id = b.id
      JOIN sessions s ON s.id = i.session_id
      JOIN programs p ON p.id = s.program_id
      WHERE p.kind = ${CAMP_KIND} AND b.status <> 'expired' AND b.id <> ${bookingId ?? ""}
    )`);
}

async function sendCampWelcome(db: Executor, familyId: string, date: string, opts: { now: Date; baseUrl?: string; when: "today" | "tomorrow" }) {
  const kids = await campDayChildren(db, familyId, date);
  if (!kids.length) return false;
  const [first] = await db
    .select({ startsAt: sql<Date>`min(${sessions.startsAt})` })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .where(and(eq(bookings.familyId, familyId), eq(bookingItems.status, "confirmed"), inArray(bookingItems.childId, kids.map((k) => k.childId)), eq(sessions.localDate, date)));
  // Early Bird starts an hour before camp: once that has passed, it's too late to be useful.
  if (opts.when === "today" && first?.startsAt && opts.now.getTime() >= new Date(first.startsAt).getTime() - 60 * 60_000) return false;
  const [primary] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  if (!primary) return false;
  const [claimed] = await db
    .update(families)
    .set({ campWelcomeSentAt: opts.now })
    .where(and(eq(families.id, familyId), isNull(families.campWelcomeSentAt)))
    .returning({ id: families.id });
  if (!claimed) return false;
  try {
    const { notifyFamily } = await import("@/lib/notify");
    await notifyFamily(db, {
      key: "camp_welcome",
      familyId,
      guardianIds: [primary.id],
      vars: {
        when: opts.when,
        camp_letter: campWelcomeLetter(kids, opts.when),
        camp_details: campDayDetails(kids, opts.baseUrl ?? trustedBaseUrl(), { when: opts.when, date, code: await ensureCheckinCode(db, familyId) }),
      },
      related: { type: "family", id: familyId },
    });
    return true;
  } catch (e) {
    await db.update(families).set({ campWelcomeSentAt: null }).where(eq(families.id, familyId));
    throw e;
  }
}
