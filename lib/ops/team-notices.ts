/**
 * Who on the team gets which emails.
 *
 * Each staff account has its own list of notice topics (Settings → Staff & roles), set by an owner.
 * The addresses in Settings → Notifications are shared inboxes: the general one gets every topic
 * except Club Yalla and Play Passes, which go to the membership one. An address there that belongs
 * to a staff account follows that person's own choices instead, so turning a topic off for someone
 * always works.
 *
 * Someone with workdays set only gets team emails on those days (by Yalla's local date); with none
 * set, every day.
 *
 * Flex cohort teams (e.g. the Wildflowers team) are emailed about each drop-in to their cohort as
 * soon as it's booked, and if it's cancelled.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import type { Executor } from "@/lib/db";
import { bookingItems, children, programs, sessions, staffUsers, roles } from "@/lib/db/schema";
import { EARLY_BIRD, FLEX_GROUPS, FLEX_SLUG, HALF_DAY, flexGroupFor, type FlexGroup } from "@/lib/booking/flex";
import { trustedBaseUrl } from "@/lib/base-url";
import { addDaysISO, fmtDate, todayLA, weekdayOf } from "@/lib/time";
import { getPolicy } from "./settings";

export const NOTICE_TOPICS = [
  { key: "flex", label: "Yalla Flex", help: "Flex bookings, cancellations and waitlist sign-ups" },
  { key: "camp", label: "Camp Yalla", help: "Camp bookings, cancellations and waitlist sign-ups" },
  { key: "after_hours", label: "After Hours Evenings", help: "After Hours bookings, cancellations and waitlist sign-ups" },
  { key: "happenings", label: "Happenings & weekend play", help: "Yalla Happenings, Immersive Play, Weekend Play and Yalla Outside" },
  { key: "celebrations", label: "Celebrations & event enquiries", help: "Private event bookings and event enquiries from the website" },
  { key: "club", label: "Club Yalla", help: "Club Yalla applications from the website" },
  { key: "playpass", label: "Play Passes", help: "New members, plan changes, cancellations, pauses and failed payments" },
  { key: "spaces", label: "Workspaces", help: "Workspace reservations and cancellations" },
  { key: "enquiries", label: "Tours & handbook questions", help: "Tour requests and questions families send from the handbook" },
  { key: "families", label: "New Family Portal accounts", help: "When a family joins the Family Portal" },
] as const;
export type NoticeTopic = (typeof NOTICE_TOPICS)[number]["key"];
const TOPIC_KEYS = new Set<string>(NOTICE_TOPICS.map((t) => t.key));
const MEMBERSHIP_TOPICS = new Set<NoticeTopic>(["club", "playpass"]);

/** The notice topic for a program's bookings, cancellations and waitlist sign-ups. */
export function topicForProgram(p: { kind: string; slug: string }): NoticeTopic {
  if (p.slug === FLEX_SLUG || p.kind === "drop_in") return "flex";
  if (p.kind === "camp") return "camp";
  if (p.kind === "parents_night") return "after_hours";
  if (p.kind === "private_event") return "celebrations";
  if (p.kind === "membership") return "club";
  return "happenings";
}

export const WEEKDAYS = [
  { day: 1, short: "Mon", name: "Monday" },
  { day: 2, short: "Tue", name: "Tuesday" },
  { day: 3, short: "Wed", name: "Wednesday" },
  { day: 4, short: "Thu", name: "Thursday" },
  { day: 5, short: "Fri", name: "Friday" },
  { day: 6, short: "Sat", name: "Saturday" },
  { day: 0, short: "Sun", name: "Sunday" },
];

/** True when this person is working on the given day (no workdays set means every day). */
export const worksOn = (workdays: number[], localDate = todayLA()) => !workdays.length || workdays.includes(weekdayOf(localDate));

/** "Every day", "Mon–Fri", or "Mon, Wed, Fri". */
export function workdaysLabel(workdays: number[]) {
  if (!workdays.length || workdays.length === 7) return "Every day";
  const set = new Set(workdays);
  if (workdays.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Mon–Fri";
  return WEEKDAYS.filter((w) => set.has(w.day)).map((w) => w.short).join(", ");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const parseList = (raw: unknown) => raw === undefined || raw === null ? [] : String(raw).split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e));

/** Everyone who should get an email about any of these topics. */
export async function teamRecipients(db: Executor, topics: NoticeTopic | NoticeTopic[]): Promise<string[]> {
  const want = new Set(Array.isArray(topics) ? topics : [topics]);
  if (!want.size) return [];
  const staff = await db.select({ email: staffUsers.email, status: staffUsers.status, notices: staffUsers.notices, workdays: staffUsers.workdays }).from(staffUsers);
  const today = todayLA();
  const accounts = new Set(staff.map((s) => s.email.toLowerCase()));
  const out = new Set<string>();
  const general = [...want].some((t) => !MEMBERSHIP_TOPICS.has(t));
  const membership = [...want].some((t) => MEMBERSHIP_TOPICS.has(t));
  if (general) for (const e of parseList(await getPolicy(db, "notifications.staffEmails"))) if (!accounts.has(e)) out.add(e);
  if (membership) for (const e of parseList(await getPolicy(db, "notifications.membershipEmails"))) if (!accounts.has(e)) out.add(e);
  for (const s of staff) if (s.status === "active" && worksOn(s.workdays, today) && s.notices.some((t) => want.has(t as NoticeTopic))) out.add(s.email.toLowerCase());
  return [...out];
}

/**
 * Of these recipients, the ones who may see money: staff whose role has billing permission, plus
 * addresses an owner typed into Settings → Notifications (those aren't staff accounts; an owner
 * chose them). Everyone else gets team emails without amounts.
 */
export async function seesMoney(db: Executor, emails: string[]): Promise<Set<string>> {
  const rows = await db
    .select({ email: staffUsers.email, permissions: roles.permissions })
    .from(staffUsers)
    .innerJoin(roles, eq(roles.id, staffUsers.roleId));
  const accounts = new Map(rows.map((r) => [r.email.toLowerCase(), r.permissions]));
  return new Set(emails.filter((e) => {
    const perms = accounts.get(e.toLowerCase());
    return perms ? perms.includes("billing.view") : true;
  }));
}

/** An owner chooses which team emails a person gets, and which Flex cohorts they're part of. */
export async function setStaffNotices(db: Executor, actor: Actor, staffId: string, input: { notices: string[]; flexCohorts: string[]; workdays?: (string | number)[] }) {
  const notices = [...new Set(input.notices.filter((t) => TOPIC_KEYS.has(t)))];
  const flexCohorts = [...new Set(input.flexCohorts.filter((k) => FLEX_GROUPS.some((g) => g.key === k)))];
  const days = [...new Set((input.workdays ?? []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  // Every day ticked is the same as none: always send.
  const workdays = days.length === 7 ? [] : days;
  const [u] = await db.update(staffUsers).set({ notices, flexCohorts, workdays, updatedAt: new Date() }).where(eq(staffUsers.id, staffId)).returning();
  if (!u) throw new OpsError("not_found", "Staff member not found.");
  const labels = notices.map((t) => NOTICE_TOPICS.find((x) => x.key === t)!.label);
  const cohorts = flexCohorts.map((k) => FLEX_GROUPS.find((g) => g.key === k)!.cohort);
  await audit(db, actor, {
    action: "staff.notices",
    entityType: "staff",
    entityId: staffId,
    summary: `${u.name} gets: ${labels.length ? labels.join(", ") : "no team emails"}${cohorts.length ? ` · drop-ins to ${cohorts.join(", ")}` : ""} · ${workdaysLabel(workdays)}`,
  });
  return u;
}

/* ───────────────────────── Flex drop-ins, for each cohort's team ───────────────────────── */

const teamName = (g: FlexGroup) => `${g.cohort.replace(/s$/, "")} team`;

/** "today", "tomorrow", or "on Monday, November 23". */
export function dayPhrase(localDate: string, today = todayLA()) {
  if (localDate === today) return "today";
  if (localDate === addDaysISO(today, 1)) return "tomorrow";
  return `on ${fmtDate(localDate, "EEEE, MMMM d")}`;
}

/** "a full day (8:30am–4:30pm)", "a half day (8:30am–12:00pm)", with Early Bird starting at 8:00am. */
export function dayLength(addons: string[]) {
  const half = addons.includes(HALF_DAY);
  const early = addons.includes(EARLY_BIRD);
  const start = early ? "8:00am" : "8:30am";
  return `a ${half ? "half" : "full"} day${early ? " with Early Bird" : ""} (${start}–${half ? "12:00pm" : "4:30pm"})`;
}

/** "Jane has no known allergies and takes no known medication." or what the family told us. */
export function careSentence(child: { firstName: string; preferredName: string | null; allergies: string | null; medicalNotes: string | null }) {
  const name = child.preferredName || child.firstName;
  const allergies = child.allergies?.trim();
  const medical = child.medicalNotes?.trim();
  if (!allergies && !medical) return `${name} has no known allergies and takes no known medication.`;
  return [allergies ? `Allergies: ${allergies}` : `${name} has no known allergies.`, medical ? `Medication and medical notes: ${medical}` : `${name} takes no known medication.`].join("\n");
}

/** The first Yalla Flex day on record for each child (confirmed bookings only). */
export async function firstFlexDays(db: Executor, childIds: string[]) {
  if (!childIds.length) return new Map<string, string>();
  const rows = await db
    .select({ childId: bookingItems.childId, first: sql<string>`min(${sessions.localDate})::text` })
    .from(bookingItems)
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(programs.slug, FLEX_SLUG), eq(bookingItems.status, "confirmed"), inArray(bookingItems.childId, childIds)))
    .groupBy(bookingItems.childId);
  return new Map(rows.map((r) => [r.childId!, r.first]));
}

async function flexItems(db: Executor, where: ReturnType<typeof and>) {
  const rows = await db
    .select({ item: bookingItems, session: sessions, child: children })
    .from(bookingItems)
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(programs.slug, FLEX_SLUG), where))
    .orderBy(sessions.localDate);
  return rows.flatMap((r) => {
    const group = flexGroupFor(r.session.minAgeMonths);
    return group ? [{ ...r, group }] : [];
  });
}

async function cohortTeam(db: Executor, key: string) {
  const rows = await db
    .select({ email: staffUsers.email, workdays: staffUsers.workdays })
    .from(staffUsers)
    .where(and(eq(staffUsers.status, "active"), sql`${key} = ANY(${staffUsers.flexCohorts})`));
  return [...new Set(rows.filter((r) => worksOn(r.workdays)).map((r) => r.email.toLowerCase()))];
}

type Row = Awaited<ReturnType<typeof flexItems>>[number];
function byChildAndCohort(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(`${r.group.key}:${r.child.id}`, [...(groups.get(`${r.group.key}:${r.child.id}`) ?? []), r]);
  return [...groups.values()];
}

/** A Flex booking was confirmed: tell each cohort's team who's dropping in, when, and what to know. */
export async function notifyCohortsOfDropIns(db: Executor, bookingId: string) {
  try {
    const today = todayLA();
    const rows = (await flexItems(db, and(eq(bookingItems.bookingId, bookingId), eq(bookingItems.status, "confirmed")))).filter((r) => r.session.localDate >= today);
    if (!rows.length) return;
    const { notifyStaff } = await import("@/lib/notify");
    const first = await firstFlexDays(db, [...new Set(rows.map((r) => r.child.id))]);
    for (const group of byChildAndCohort(rows)) {
      const { child, group: g } = group[0];
      const to = await cohortTeam(db, g.key);
      if (!to.length) continue;
      const name = `${child.preferredName || child.firstName} ${child.lastName}`;
      const isNew = !first.get(child.id) || first.get(child.id)! >= group[0].session.localDate;
      const when =
        group.length === 1
          ? `${name} will drop into ${g.cohort} ${dayPhrase(group[0].session.localDate, today)} for ${dayLength(group[0].item.addons)}.`
          : `${name} will drop into ${g.cohort} on these days:\n${group.map((r) => `• ${fmtDate(r.session.localDate, "EEEE, MMMM d")}${dayPhrase(r.session.localDate, today).startsWith("on ") ? "" : ` (${dayPhrase(r.session.localDate, today)})`}: ${dayLength(r.item.addons)}`).join("\n")}`;
      const details = [when, isNew ? "This is a new Flex friend." : "We have a returning Flex friend.", careSentence(child)].join("\n\n");
      const whenShort = group.length === 1 ? dayPhrase(group[0].session.localDate, today).replace(/^on /, "") : `${group.length} days from ${fmtDate(group[0].session.localDate, "MMM d")}`;
      for (const address of to)
        await notifyStaff(db, {
          key: "cohort_drop_in",
          to: address,
          vars: { team: teamName(g), cohort: g.cohort, child_name: name, when: whenShort, details, link: `${trustedBaseUrl()}/admin/drop-ins` },
          relatedType: "booking",
          relatedId: bookingId,
        });
    }
  } catch (e) {
    console.error("[cohort drop-in email failed]", (e as Error).message?.slice(0, 160));
  }
}

/** Flex days were cancelled: tell the cohort's team the child won't be coming after all. */
export async function notifyCohortsOfCancelledDropIns(db: Executor, itemIds: string[]) {
  try {
    if (!itemIds.length) return;
    const today = todayLA();
    const rows = (await flexItems(db, and(inArray(bookingItems.id, itemIds)))).filter((r) => r.session.localDate >= today);
    if (!rows.length) return;
    const { notifyStaff } = await import("@/lib/notify");
    for (const group of byChildAndCohort(rows)) {
      const { child, group: g } = group[0];
      const to = await cohortTeam(db, g.key);
      if (!to.length) continue;
      const name = `${child.preferredName || child.firstName} ${child.lastName}`;
      const days = group.map((r) => dayPhrase(r.session.localDate, today));
      const details =
        group.length === 1
          ? `${name} won’t be dropping into ${g.cohort} ${days[0]} after all. Their booking was cancelled.`
          : `${name} won’t be dropping into ${g.cohort} on these days after all:\n${group.map((r) => `• ${fmtDate(r.session.localDate, "EEEE, MMMM d")}`).join("\n")}`;
      for (const address of to)
        await notifyStaff(db, {
          key: "cohort_drop_in_cancelled",
          to: address,
          vars: { team: teamName(g), cohort: g.cohort, child_name: name, when: group.length === 1 ? days[0].replace(/^on /, "") : `${group.length} days`, details, link: `${trustedBaseUrl()}/admin/drop-ins` },
          relatedType: "booking",
          relatedId: group[0].item.bookingId,
        });
    }
  } catch (e) {
    console.error("[cohort cancellation email failed]", (e as Error).message?.slice(0, 160));
  }
}

/** Upcoming Flex drop-ins for the drop-ins page. `cohorts` null means every cohort. */
export async function upcomingDropIns(db: Executor, opts: { cohorts: string[] | null; from?: string; days?: number }) {
  const from = opts.from ?? todayLA();
  const until = addDaysISO(from, opts.days ?? 21);
  if (opts.cohorts && !opts.cohorts.length) return [];
  const rows = (
    await flexItems(db, and(eq(bookingItems.status, "confirmed"), sql`${sessions.localDate} >= ${from}`, lt(sessions.localDate, until)))
  ).filter((r) => !opts.cohorts || opts.cohorts.includes(r.group.key));
  const first = await firstFlexDays(db, [...new Set(rows.map((r) => r.child.id))]);
  return rows.map((r) => ({
    itemId: r.item.id,
    date: r.session.localDate,
    cohort: r.group,
    child: r.child,
    length: dayLength(r.item.addons),
    isNew: (first.get(r.child.id) ?? r.session.localDate) >= r.session.localDate,
  }));
}
