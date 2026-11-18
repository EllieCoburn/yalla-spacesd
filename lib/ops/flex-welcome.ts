/**
 * The Yalla Flex first-day welcome: one letter from Team Yalla per family, sent on the morning of
 * their first Flex visit (Yalla's local time), before they arrive, followed by the practical
 * details for that visit (door codes, Wi-Fi, Brightwheel, parking and space reservations).
 *
 * - A family's first visit is the earliest day they have confirmed Flex care. Every child coming
 *   that day is in the same email, however many bookings they were made in.
 * - It's sent once per family, ever: `families.flex_welcome_sent_at` is claimed before sending, so
 *   a second run, an updated booking or two runs at once can never send it again.
 * - It's written from the booking as it stands when it's sent (children, cohorts, times).
 * - It goes out from the morning run (cron), and right away when a family books their first Flex
 *   day the same morning (after that run).
 * - Only for bookings made after it was switched on: the first time it runs, every family who had
 *   already booked Flex is marked as welcomed (Yalla welcomed them personally before this existed).
 */
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { bookingItems, bookings, children, families, guardians, programs, sessions, settings } from "@/lib/db/schema";
import { EARLY_BIRD, FLEX_SLUG, HALF_DAY, flexGroupFor, type FlexGroup } from "@/lib/booking/flex";
import { trustedBaseUrl } from "@/lib/base-url";
import { fmtTime, todayLA } from "@/lib/time";
import { getPolicy } from "./settings";
import { whatToBring } from "@/content/flex-what-to-bring";

export const FRONT_DOOR_CODE = "2252";
/** Inner door codes by Flex cohort. Seedlings has none, so no line is shown for it. */
export const COHORT_DOOR_CODES: Record<string, string> = { wildflowers: "2424", sprouts: "2424", saplings: "2022" };
export const WIFI = { network: "YallaSanDiego", password: "YallaSpaceSD" };
/** The Family Portal's parking guide and workspace reservations (signing in returns families here). */
export const PARKING_PATH = "/parking";
export const SPACES_PATH = "/portal/spaces";
/** The Family Portal's what-to-bring lists (private). */
export const WHAT_TO_BRING_PATH = "/portal/what-to-bring";
const WHAT_TO_BRING_LABELING = "Please label everything with your child’s name.";

export type WelcomeChild = { childId: string; name: string; cohort: FlexGroup; half: boolean; arrives: string; pickup: string };

/** "Jane", "Jane and Max", "Jane, Max and Leo". */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The children coming on `date` and each one's cohort, day length, arrival and pickup times. */
export async function firstVisitChildren(db: Executor, familyId: string, date: string): Promise<WelcomeChild[]> {
  const rows = await db
    .select({ item: bookingItems, session: sessions, child: children })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookings.familyId, familyId), eq(programs.slug, FLEX_SLUG), eq(bookingItems.status, "confirmed"), eq(bookings.status, "confirmed"), eq(sessions.localDate, date)))
    .orderBy(sessions.startsAt, children.birthDate);
  const seen = new Set<string>();
  const out: WelcomeChild[] = [];
  for (const r of rows) {
    const cohort = flexGroupFor(r.session.minAgeMonths);
    if (!cohort || seen.has(r.child.id)) continue;
    seen.add(r.child.id);
    const half = r.item.addons.includes(HALF_DAY);
    const start = new Date(r.session.startsAt.getTime() - (r.item.addons.includes(EARLY_BIRD) ? 30 * 60_000 : 0));
    const end = half ? new Date(r.session.startsAt.getTime() + 210 * 60_000) : r.session.endsAt;
    out.push({ childId: r.child.id, name: (r.child.preferredName || r.child.firstName).trim(), cohort, half, arrives: fmtTime(start), pickup: fmtTime(end) });
  }
  return out;
}

const period = (c: WelcomeChild) => (c.half ? "their morning" : "their day");

/** The letter itself (between "Hi …," and "Warmly, Team Yalla"), worded for one child or several. */
export function welcomeLetter(kids: WelcomeChild[]) {
  const many = kids.length > 1;
  const names = joinNames(kids.map((k) => k.name));
  // "the Wildflowers cohort where Jane will spend their day and the Sprouts cohort where Max will spend their morning"
  const places: { cohort: string; names: string[]; period: string }[] = [];
  for (const k of kids) {
    const p = places.find((x) => x.cohort === k.cohort.cohort && x.period === period(k));
    if (p) p.names.push(k.name);
    else places.push({ cohort: k.cohort.cohort, names: [k.name], period: period(k) });
  }
  // The same length of day in different cohorts reads as one: "the Wildflowers and Saplings cohorts, where Jane and Max will spend their day".
  const cohortsInOrder = [...new Set(places.map((p) => p.cohort))];
  const where =
    places.length > 1 && new Set(places.map((p) => p.period)).size === 1
      ? `the ${joinNames(cohortsInOrder)} cohorts, where ${names} will spend ${places[0].period}`
      : joinNames(places.map((p) => `the ${p.cohort} cohort where ${joinNames(p.names)} will spend ${p.period}`));
  // "pick up Jane and Max at 4:30pm" or "pick up Jane at 4:30pm and Max at 12:00pm"
  const pickups: { time: string; names: string[] }[] = [];
  for (const k of kids) {
    const p = pickups.find((x) => x.time === k.pickup);
    if (p) p.names.push(k.name);
    else pickups.push({ time: k.pickup, names: [k.name] });
  }
  const pickup = joinNames(pickups.map((p) => `${joinNames(p.names)} at ${p.time}`));
  const needs = kids.length === 2 ? "either of them needs" : many ? "any of them needs" : "your child needs";
  return [
    `We’re so glad you${many ? "," : " and"} ${names} are joining us today! A member of Team Yalla will be onsite to welcome you, show you to ${where}, and introduce you to our coworking spaces and amenities.`,
    `Our team looks forward to getting to know ${names}—their interests, their ${many ? "personalities" : "personality"}, and the little things that help them feel at home. We’ll follow their lead as they explore, make connections, and find their rhythm here.`,
    `As you settle into our coworking space, please remember to remain onsite throughout your ${many ? "children’s sessions" : "child’s session"}. If ${needs} you, we’ll reach out—and you’re always welcome to ask how they’re doing.`,
    `You’ll also receive updates through Brightwheel. If you haven’t accepted your invitation yet, you can do that whenever you have a moment. We’re happy to help you get connected.`,
    `Please plan to pick up ${pickup}. Our team will share a little about their day before you head home.`,
    `Welcome to Yalla. We’re happy you’re here, and we look forward to making this a place you ${many ? "all" : "both"} love coming back to.`,
  ].join("\n\n");
}

/** "A few details for your first visit": each child's day, door codes, Wi-Fi, Brightwheel, links. */
/** Short labels for the email's what-to-bring card (the portal shows the full titles and notes). */
const BRING_LABEL: Record<string, string> = { daily: "Bring daily", restock: "Restock", lives: "Keep at Yalla", rest: "Rest time" };

/** One what-to-bring card per cohort and day length (children sharing both share a card). */
export function whatToBringBlocks(kids: WelcomeChild[], baseUrl: string) {
  const groups: { names: string[]; key: string; cohort: string; half: boolean }[] = [];
  for (const k of kids) {
    const g = groups.find((x) => x.key === k.cohort.key && x.half === k.half);
    if (g) g.names.push(k.name);
    else groups.push({ names: [k.name], key: k.cohort.key, cohort: k.cohort.cohort, half: k.half });
  }
  const blocks: string[] = [];
  for (const g of groups) {
    const list = whatToBring(g.key, g.half);
    if (!list) continue;
    blocks.push(
      [
        `### What to bring for ${joinNames(g.names)} · ${g.cohort}, ${g.half ? "half day" : "full day"}`,
        ...list.sections.map((sec) => `${BRING_LABEL[sec.key] ?? sec.title}: ${sec.items.map((i) => i.short).join(", ")}`),
        `Please don’t bring: ${list.doNotBring.map((d) => d.replace(/ \(.*\)$/, "")).join(", ")}`,
      ].join("\n"),
    );
  }
  if (blocks.length) blocks.push(`${WHAT_TO_BRING_LABELING} [See the full list, with notes, in your Family Portal](${baseUrl}${WHAT_TO_BRING_PATH}).`);
  return blocks;
}

export function firstVisitDetails(kids: WelcomeChild[], baseUrl: string) {
  const many = kids.length > 1;
  // Each cohort's door code once, in the order the children are listed; Seedlings has no line at all.
  const codes: string[] = [];
  for (const k of kids) {
    const code = COHORT_DOOR_CODES[k.cohort.key];
    const line = `${k.cohort.cohort} door code: ${code}`;
    if (code && !codes.includes(line)) codes.push(line);
  }
  const who = joinNames(kids.map((k) => k.name));
  return [
    "## A few details for your first visit",
    ["### Today", ...kids.map((k) => `${k.name}: ${k.cohort.cohort} · ${k.half ? "Half day" : "Full day"}, ${k.arrives}–${k.pickup} · **Pick up at ${k.pickup}**`)].join("\n"),
    ...whatToBringBlocks(kids, baseUrl),
    ["### Getting inside", `Front door code: ${FRONT_DOOR_CODE}`, ...codes].join("\n"),
    ["### Connecting to Wi-Fi", `Network: ${WIFI.network}`, `Password: ${WIFI.password}`].join("\n"),
    [
      "### Coworking during your visit",
      "A large portion of Yalla’s coworking amenities are available on a first-come, first-served basis and are included in the cost of your visit. You’re welcome to choose the workspace that works best for you in our common area at no additional charge, and to book complimentary time in our private phone booth or private offices, subject to availability.",
    ].join("\n"),
    `If you’d like a designated private desk or private office instead, you can [book a space](${baseUrl}${SPACES_PATH}) and purchase it through your Family Portal, and it’s yours for the duration of your stay.`,
    ["### Using Brightwheel", "Brightwheel is how we stay connected during your visit."].join("\n"),
    [
      `• Check ${many ? "your children" : "your child"} in and out at the kiosk in our lobby. Each caregiver has their own check-in code in the Brightwheel app.`,
      "• Our team shares updates about meals, snacks, diapering, toileting and moments from the day, along with messages, photos and notes.",
      "• Keep your notifications on so you see our updates and messages during your session.",
    ].join("\n"),
    `You don’t need to set up Brightwheel before your first visit. If your account isn’t ready yet, our team will check ${who} in and help you get connected.`,
    ["### Parking and space reservations", `• [View our parking guide](${baseUrl}${PARKING_PATH})`, `• [Reserve a space](${baseUrl}${SPACES_PATH})`].join("\n"),
  ].join("\n\n");
}

/** Families whose first-ever Flex visit is `date` and who haven't been welcomed. */
export async function familiesDueWelcome(db: Executor, date: string) {
  const today = await db
    .selectDistinct({ familyId: bookings.familyId })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(families, eq(families.id, bookings.familyId))
    .where(and(eq(programs.slug, FLEX_SLUG), eq(bookingItems.status, "confirmed"), eq(bookings.status, "confirmed"), eq(sessions.localDate, date), isNull(families.flexWelcomeSentAt)));
  if (!today.length) return [];
  const ids = today.map((r) => r.familyId);
  // Anyone who already had a confirmed Flex day before this one isn't new.
  const earlier = await db
    .selectDistinct({ familyId: bookings.familyId })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(programs.slug, FLEX_SLUG), eq(bookingItems.status, "confirmed"), inArray(bookings.familyId, ids), lt(sessions.localDate, date)));
  const old = new Set(earlier.map((r) => r.familyId));
  return ids.filter((id) => !old.has(id));
}

/**
 * Sends today's welcome emails. Only before the family's arrival: after their first child's
 * session has started, it's no longer sent (it says "joining us today").
 */
export async function sendFlexWelcomes(db: Executor, opts: { now?: Date; baseUrl?: string; familyIds?: string[]; bookingId?: string } = {}) {
  const now = opts.now ?? new Date();
  await startWelcomes(db, opts.bookingId);
  if (!(await getPolicy(db, "notifications.flexWelcome"))) return { sent: 0 };
  const date = todayLA(now);
  let due = await familiesDueWelcome(db, date);
  if (opts.familyIds) due = due.filter((id) => opts.familyIds!.includes(id));
  let sent = 0;
  for (const familyId of due) {
    try {
      if (await sendFlexWelcome(db, familyId, date, { now, baseUrl: opts.baseUrl })) sent++;
    } catch (e) {
      console.error("[flex welcome failed]", (e as Error).message?.slice(0, 160));
    }
  }
  return { sent };
}

export const WELCOME_STARTED_KEY = "flexWelcome.startedAt";

/**
 * The first time welcomes run (right after this goes live), every family with a Flex booking made
 * before then is marked as already welcomed, so only families booking from now on get the email.
 * `bookingId` is the booking that triggered this run (made after go-live), which doesn't count.
 */
async function startWelcomes(db: Executor, bookingId?: string) {
  const startedAt = new Date();
  const [first] = await db
    .insert(settings)
    .values({ key: WELCOME_STARTED_KEY, value: startedAt.toISOString(), updatedBy: "Flex welcome email (first run)" })
    .onConflictDoNothing({ target: settings.key })
    .returning({ key: settings.key });
  if (!first) return;
  await db.execute(sql`
    UPDATE families SET flex_welcome_sent_at = ${startedAt.toISOString()}::timestamptz
    WHERE flex_welcome_sent_at IS NULL AND id IN (
      SELECT b.family_id FROM bookings b
      JOIN booking_items i ON i.booking_id = b.id
      JOIN sessions s ON s.id = i.session_id
      JOIN programs p ON p.id = s.program_id
      WHERE p.slug = ${FLEX_SLUG} AND b.status <> 'expired' AND b.id <> ${bookingId ?? ""}
    )`);
}

async function sendFlexWelcome(db: Executor, familyId: string, date: string, opts: { now: Date; baseUrl?: string }) {
  const kids = await firstVisitChildren(db, familyId, date);
  if (!kids.length) return false;
  const [first] = await db
    .select({ startsAt: sql<Date>`min(${sessions.startsAt})` })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .where(and(eq(bookings.familyId, familyId), eq(bookingItems.status, "confirmed"), inArray(bookingItems.childId, kids.map((k) => k.childId)), eq(sessions.localDate, date)));
  // Early Bird starts 30 minutes before the session.
  if (first?.startsAt && opts.now.getTime() >= new Date(first.startsAt).getTime() - 30 * 60_000) return false;
  const [primary] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  if (!primary) return false;
  // Claim it first, so it can only ever be sent once.
  const [claimed] = await db
    .update(families)
    .set({ flexWelcomeSentAt: opts.now })
    .where(and(eq(families.id, familyId), isNull(families.flexWelcomeSentAt)))
    .returning({ id: families.id });
  if (!claimed) return false;
  try {
    const { notifyFamily } = await import("@/lib/notify");
    await notifyFamily(db, {
      key: "flex_welcome",
      familyId,
      guardianIds: [primary.id],
      vars: { welcome_letter: welcomeLetter(kids), first_visit_details: firstVisitDetails(kids, opts.baseUrl ?? trustedBaseUrl()) },
      related: { type: "family", id: familyId },
    });
    return true;
  } catch (e) {
    // Nothing went out: let the next run try again.
    await db.update(families).set({ flexWelcomeSentAt: null }).where(eq(families.id, familyId));
    throw e;
  }
}
