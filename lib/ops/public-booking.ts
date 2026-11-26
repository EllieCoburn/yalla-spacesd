/**
 * Public booking and Family Portal operations.
 *
 * - Availability shown to families comes from live inventory (capacity.ts), never sample data.
 * - Families are matched by guardian email. If an email already belongs to a family, the visitor
 *   must sign in (we send a link) — this avoids duplicate families and stops anyone attaching
 *   bookings or children to someone else's account.
 * - Capacity, age and paperwork problems surface before payment.
 * - Payment status only changes through verified provider webhooks.
 */
import { and, asc, desc, eq, gt, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { OpsError, type Actor } from "@/lib/audit";
import type { DB, Executor } from "@/lib/db";
import {
  bookingItems,
  bookings,
  children,
  cohorts,
  families,
  formRequirements,
  formSubmissions,
  formTemplates,
  formVersions,
  guardians,
  invoices,
  memberships,
  payments,
  programPrices,
  programs,
  refunds,
  scheduleSeries,
  sessions,
  messages,
  waitlistEntries,
} from "@/lib/db/schema";
import { requestMagicLink, guardianActor, type GuardianContext } from "@/lib/family-auth";
import { activeProvider } from "@/lib/payments/provider";
import { ageInMonths, fmtDate, fmtTime, todayLA } from "@/lib/time";
import { invoiceTotals, familyLedger, refundPayment, usd } from "./billing";
import { getPolicy } from "./settings";
import { notifyFamily } from "@/lib/notify";
import { addonsFor, childDay } from "@/lib/booking/addons";
import { heldReservation } from "@/lib/playpass/wallet";
import { itemValue, returnPaid } from "./credits";
import { findCoupon } from "./coupons";
import { bookingConfirmationVars, bookingLines, cancelBooking, checkoutLabel, createHold, describeLine, releaseEarlierAttempts, startCheckout } from "./bookings";
import { availabilityFor, publicState, type PublicState } from "./capacity";
import { addChild, CARE_REQUIRED, careAnswered, careValid, createFamily, findGuardianByEmail, phoneProblem, recordCareAnswers, updateChild } from "./families";
import { applicableTemplates, effectiveFields, paperworkStatus, submitForm, type PaperworkItem } from "./forms";
import type { Answers, FormField } from "@/lib/forms/fields";
import { joinWaitlist } from "./waitlist";
import { submitEnquiry } from "./enquiries";
import { topicForProgram } from "./team-notices";
import { FLEX_SLUG, HALF_DAY, flexGroupFor } from "@/lib/booking/flex";
import { flexHoldName } from "@/lib/booking/flex-hold";
import { earlyBirdByDate } from "./flex";
import { ageFits, sessionAges } from "@/lib/booking/ages";
import { bookingStatusPath } from "@/lib/links";

const PUBLIC: Actor = { type: "system", name: "Public booking" };
const BOOKABLE_MODES = ["instant", "request"];

/* ───────────────────────── Availability ───────────────────────── */

export type PublicSession = {
  id: string;
  programId: string;
  programName: string;
  programSlug: string;
  kind: string;
  title: string;
  cohort: string | null;
  localDate: string;
  startsAt: string;
  endsAt: string;
  state: PublicState;
  priceCents: number | null;
  /** Yalla Flex: the half-day price (a full day is priceCents). */
  halfPriceCents: number | null;
  /** Closed for one of Yalla's closure days (e.g. "Labor Day"). */
  closure: string | null;
  /** On a closure day: Camp Yalla runs that day, so families can be pointed there. */
  campToday: boolean;
  /** Yalla Flex: staff have opened Early Bird seats this day and some are left. */
  earlyBirdOpen: boolean;
  ages: { min: number | null; max: number | null };
  eligible: boolean;
  seriesId: string | null;
  bookAsSeries: boolean;
  bookingUnit: string;
  approvalRequired: boolean;
  /** Play Pass funds can be spent on it (program setting, or the session's own override). */
  playPassEligible: boolean;
};

/** What families see: whether there's room, never how many places are booked or remain. */
function withoutCounts(st: PublicState): PublicState {
  if (st.state === "available") return { state: "available", remaining: null };
  if (st.state === "limited") return { state: "limited", remaining: 0, showCount: false };
  return st;
}

type PriceRow = typeof programPrices.$inferSelect;

/** Same precedence as bookings.priceFor, with the price table loaded once. */
function pickPrice(session: typeof sessions.$inferSelect, program: typeof programs.$inferSelect, table: PriceRow[]): number | null {
  if (session.priceCents != null) return session.priceCents;
  const hours = (session.endsAt.getTime() - session.startsAt.getTime()) / 3600_000;
  const dayLength = hours > 5 ? "full" : "half";
  const rows = table.filter((p) => p.programId === program.id && p.unit === "session" && p.active);
  const m =
    rows.find((p) => p.cohortId === session.cohortId && p.dayLength === dayLength) ??
    rows.find((p) => p.cohortId === session.cohortId && !p.dayLength) ??
    rows.find((p) => !p.cohortId && p.dayLength === dayLength) ??
    rows.find((p) => !p.cohortId && !p.dayLength);
  return m?.amountCents ?? program.priceCents ?? null;
}

export async function listPublicSessions(db: Executor, q: { from: string; to: string; kinds?: string[]; ageMonths?: number | null; now?: Date }): Promise<PublicSession[]> {
  const now = q.now ?? new Date();
  const rows = await db
    .select({ s: sessions, p: programs, c: cohorts, series: scheduleSeries })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .leftJoin(cohorts, eq(cohorts.id, sessions.cohortId))
    .leftJoin(scheduleSeries, eq(scheduleSeries.id, sessions.seriesId))
    .where(
      and(
        gte(sessions.localDate, q.from),
        lte(sessions.localDate, q.to),
        eq(programs.status, "published"),
        inArray(programs.bookingMode, BOOKABLE_MODES),
        ne(programs.kind, "membership"),
        q.kinds?.length ? inArray(programs.kind, q.kinds) : undefined,
        gt(sessions.endsAt, now),
        // Cancelled sessions aren't offered, so they aren't listed.
        ne(sessions.status, "cancelled"),
      ),
    )
    .orderBy(asc(sessions.startsAt), asc(sessions.minAgeMonths));
  if (!rows.length) return [];
  const avail = await availabilityFor(
    db,
    rows.map((r) => r.s.id),
    now,
  );
  const table = await db
    .select()
    .from(programPrices)
    .where(inArray(programPrices.programId, [...new Set(rows.map((r) => r.p.id))]));
  // Days with a camp running, to point families there when Yalla is otherwise closed.
  const closureDates = [...new Set(rows.filter((r) => r.s.status === "closed" && r.s.notes?.startsWith("Closed: ")).map((r) => r.s.localDate))];
  const campDays = new Set(
    closureDates.length
      ? (
          await db
            .select({ d: sessions.localDate })
            .from(sessions)
            .innerJoin(programs, eq(programs.id, sessions.programId))
            .where(and(inArray(sessions.localDate, closureDates), eq(programs.kind, "camp"), eq(programs.status, "published"), eq(sessions.status, "scheduled")))
        ).map((r) => r.d)
      : [],
  );
  // Yalla Flex Early Bird seats left per day.
  const flexDates = [...new Set(rows.filter((r) => r.p.kind === "drop_in").map((r) => r.s.localDate))];
  const early = await earlyBirdByDate(db, flexDates);
  return rows.map(({ s, p, c, series }) => {
    const remaining = avail.get(s.id)?.remaining ?? 0;
    const closure = s.status === "closed" && s.notes?.startsWith("Closed: ") ? s.notes.slice("Closed: ".length) : null;
    const { min: minAge, max: maxAge } = sessionAges(s, p);
    const eligible = q.ageMonths == null || ((minAge == null || q.ageMonths >= minAge) && (maxAge == null || q.ageMonths <= maxAge));
    return {
      id: s.id,
      programId: p.id,
      programName: p.name,
      programSlug: p.slug,
      kind: p.kind,
      title: s.title ?? series?.title ?? p.name,
      cohort: c?.name ?? null,
      localDate: s.localDate,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      state: withoutCounts(publicState(s, p, remaining, now, (avail.get(s.id)?.occupancy.booked ?? 0) + (avail.get(s.id)?.occupancy.held ?? 0))),
      priceCents: pickPrice(s, p, table),
      halfPriceCents: p.kind === "drop_in" ? (flexGroupFor(s.minAgeMonths)?.halfCents ?? null) : null,
      closure,
      campToday: !!closure && campDays.has(s.localDate),
      earlyBirdOpen: p.kind === "drop_in" && (early.get(s.localDate)?.seats ?? 0) > (early.get(s.localDate)?.booked ?? 0),
      ages: { min: minAge, max: maxAge },
      eligible,
      seriesId: s.seriesId,
      bookAsSeries: !!series?.bookAsSeries || p.seriesMode === "full_series",
      bookingUnit: p.bookingUnit,
      approvalRequired: p.bookingMode === "request",
      playPassEligible: p.walletRedemptionAllowed && (s.playPassEligible ?? p.playPassEligible),
    };
  });
}

/* ───────────────────────── Agreements (blocking paperwork) ───────────────────────── */

export type Agreement = {
  templateId: string;
  title: string;
  kind: string;
  body: string;
  version: number;
  requiresSignature: boolean;
  perChild: boolean;
  /** For per-child forms: the child key from the booking form. */
  childKey: string | null;
  /** Can this be completed online, or must the family contact Yalla (e.g. uploads)? */
  completableOnline: boolean;
  /** Online forms with questions, initials and a drawn signature (e.g. the Yalla Flex admission agreement). */
  fields: FormField[] | null;
  /** How long a signature stays on file, if it expires. */
  validForMonths: number | null;
  /** Signed for the sessions in this booking only (e.g. Camp Yalla); asked again on each purchase. */
  perBooking: boolean;
};

type ChildRef = { key: string; existingId?: string | null; firstName: string; birthDate?: string };

async function expandSeries(db: Executor, sessionIds: string[]) {
  const rows = await db
    .select({ s: sessions, series: scheduleSeries, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .leftJoin(scheduleSeries, eq(scheduleSeries.id, sessions.seriesId))
    .where(inArray(sessions.id, sessionIds));
  const out = new Set(sessionIds);
  for (const r of rows) {
    if (!r.s.seriesId || !(r.series?.bookAsSeries || r.p.seriesMode === "full_series")) continue;
    const siblings = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.seriesId, r.s.seriesId), eq(sessions.status, "scheduled"), gt(sessions.endsAt, new Date())));
    for (const x of siblings) out.add(x.id);
  }
  return [...out];
}

/** What a family must agree to before booking these sessions (blocking requirements only). */
export async function previewAgreements(db: Executor, input: { familyId?: string | null; sessionIds: string[]; children: ChildRef[] }): Promise<Agreement[]> {
  const sessionIds = await expandSeries(db, input.sessionIds);
  if (!sessionIds.length) return [];
  const sessRows = await db.select({ p: sessions.programId, d: sessions.localDate }).from(sessions).where(inArray(sessions.id, sessionIds));
  const programIds = [...new Set(sessRows.map((r) => r.p))];
  // Ages are taken on the first day booked, not today: a child who turns 18 months before camp is
  // asked for the forms that fit them then.
  const firstDay = sessRows.map((r) => r.d).sort()[0];
  const existingIds = input.children.map((c) => c.existingId).filter(Boolean) as string[];
  const reqs = await applicableTemplates(db, { familyId: input.familyId ?? "00000000-none", childIds: existingIds, programIds, sessionIds, onDate: firstDay });
  const blockingTemplates = new Map<string, (typeof reqs)[number]["t"]>();
  for (const r of reqs) if (r.t.enforcement === "blocks_booking") blockingTemplates.set(r.t.id, r.t);
  if (!blockingTemplates.size) return [];
  // Per-child forms narrowed by age (e.g. one Flex agreement per age group) apply only to children who
  // fit. Saved children are checked against their record; new children by the birth date entered.
  const today = firstDay ?? todayLA();
  const forChild = (templateId: string, c: ChildRef) =>
    reqs
      .filter((r) => r.t.id === templateId)
      .some((r) => {
        if (c.existingId) return r.appliesToChild(c.existingId);
        if (r.r.scope === "child" || r.r.scope === "membership") return false;
        if (r.r.minAgeMonths == null && r.r.maxAgeMonths == null) return true;
        if (!c.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(c.birthDate)) return false;
        const age = ageInMonths(c.birthDate, today);
        return (r.r.minAgeMonths == null || age >= r.r.minAgeMonths) && (r.r.maxAgeMonths == null || age <= r.r.maxAgeMonths);
      });

  let done = new Set<string>();
  if (input.familyId) {
    const status = await paperworkStatus(db, { familyId: input.familyId, childIds: existingIds, programIds, sessionIds });
    done = new Set(
      [...status.entries()].flatMap(([k, items]) => items.filter((i) => i.state === "complete").map((i) => `${i.templateId}:${k === "family" ? "family" : k}`)),
    );
  }
  const versions = await db.select().from(formVersions).where(inArray(formVersions.templateId, [...blockingTemplates.keys()]));
  const out: Agreement[] = [];
  for (const t of blockingTemplates.values()) {
    const v = versions.find((x) => x.id === t.currentVersionId);
    const fields = v && Array.isArray(v.fields) && (v.fields as unknown[]).length ? effectiveFields(v, t.requiresSignature) : null;
    const base = { templateId: t.id, title: t.title, kind: t.kind, body: v?.body ?? "", version: v?.version ?? 1, requiresSignature: t.requiresSignature, perChild: t.perChild, completableOnline: t.kind !== "upload", fields, validForMonths: t.validForMonths, perBooking: t.frequency === "per_booking" };
    if (t.perChild) {
      for (const c of input.children) {
        if (c.existingId && done.has(`${t.id}:${c.existingId}`)) continue;
        if (!forChild(t.id, c)) continue;
        out.push({ ...base, childKey: c.key });
      }
    } else if (!done.has(`${t.id}:family`)) out.push({ ...base, childKey: null });
  }
  return out;
}

/**
 * What a held booking still needs signed before payment (e.g. a waitlist offer: the Camp Yalla
 * agreement for that purchase, or a Flex agreement that has expired), with the online form for each.
 */
export async function agreementsForBooking(db: Executor, bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) return [];
  const rows = (await bookingLines(db, bookingId)).filter((r) => r.item.status === "held" || r.item.status === "confirmed");
  const childIds = [...new Set(rows.map((r) => r.item.childId).filter(Boolean) as string[])];
  const status = await paperworkStatus(db, { familyId: b.familyId, childIds, programIds: [...new Set(rows.map((r) => r.program.id))], sessionIds: rows.map((r) => r.session.id), bookingId });
  const missing = [...status.values()].flat().filter((i) => i.enforcement === "blocks_booking" && i.state !== "complete");
  if (!missing.length) return [];
  const templates = await db.select().from(formTemplates).where(inArray(formTemplates.id, [...new Set(missing.map((m) => m.templateId))]));
  const versions = await db.select().from(formVersions).where(inArray(formVersions.templateId, templates.map((t) => t.id)));
  const kids = childIds.length ? await db.select().from(children).where(inArray(children.id, childIds)) : [];
  return missing.map((m) => {
    const t = templates.find((x) => x.id === m.templateId)!;
    const v = versions.find((x) => x.id === t.currentVersionId);
    const fields = v && Array.isArray(v.fields) && (v.fields as unknown[]).length ? effectiveFields(v, t.requiresSignature) : null;
    const child = kids.find((c) => c.id === m.childId);
    return {
      templateId: t.id,
      title: t.title,
      body: v?.body ?? "",
      version: v?.version ?? 1,
      childId: m.childId,
      childName: child ? child.preferredName || child.firstName : null,
      completableOnline: t.kind !== "upload",
      fields,
      perBooking: t.frequency === "per_booking",
      validForMonths: t.validForMonths,
    };
  });
}

/** Signs what a held booking needs (from agreementsForBooking), recording each signature against it. */
export async function signForBooking(
  db: DB,
  actor: Actor,
  input: { bookingId: string; signatures: { templateId: string; childId: string | null; signatureText?: string; consent: boolean; answers?: Answers }[]; ip?: string; userAgent?: string },
) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!b) throw new OpsError("not_found", "Booking not found.");
  const needed = await agreementsForBooking(db, b.id);
  const [g] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, b.familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  for (const a of needed) {
    const sig = input.signatures.find((x) => x.templateId === a.templateId && (x.childId ?? null) === (a.childId ?? null));
    if (!sig || !a.completableOnline) continue;
    if (!sig.consent) throw new OpsError("invalid", `Please agree to sign ${a.title} electronically.`);
    await submitForm(db, actor, {
      templateId: a.templateId,
      familyId: b.familyId,
      childId: a.childId,
      bookingId: a.perBooking ? b.id : null,
      signerGuardianId: g?.id ?? null,
      signatureText: sig.signatureText ?? null,
      consent: sig.consent,
      answers: a.fields ? (sig.answers ?? {}) : undefined,
      data: a.fields ? undefined : { confirmed: sig.consent },
      ip: input.ip,
      userAgent: input.userAgent,
    });
  }
}

/* ───────────────────────── Submitting a booking ───────────────────────── */

export type PublicBookingInput = {
  signedIn?: GuardianContext | null;
  guardian: { firstName: string; lastName: string; email: string; phone?: string };
  /** allergies / medications: "" for none known, the details, or null if not answered. */
  children: (ChildRef & { lastName: string; birthDate: string; allergies?: string | null; medications?: string | null })[];
  lines: { sessionId: string; childKeys: string[]; addons?: Record<string, string[]> }[];
  signatures: { templateId: string; childKey: string | null; signatureText?: string; consent: boolean; answers?: Answers }[];
  meta: { ip?: string; userAgent?: string };
  baseUrl: string;
  /** A coupon code entered at checkout (optional). */
  couponCode?: string | null;
};

export type PublicBookingResult =
  | { ok: true; url: string; reference: string }
  | { ok: false; code: string; error: string; agreements?: Agreement[]; devLink?: string };

export async function submitPublicBooking(db: DB, input: PublicBookingInput): Promise<PublicBookingResult> {
  const lines = input.lines.filter((l) => l.childKeys.length);
  if (!lines.length) return { ok: false, code: "empty", error: "Choose at least one session and who’s coming." };
  // Every child's known allergies and medications are asked before payment.
  // (A saved child may come with neither: that means "keep what's on file", checked below.)
  const keepOnFile = (c: (typeof input.children)[number]) => !!c.existingId && c.allergies == null && c.medications == null;
  if (input.children.some((c) => lines.some((l) => l.childKeys.includes(c.key)) && !keepOnFile(c) && !(careValid(c.allergies) && careValid(c.medications))))
    return { ok: false, code: "care", error: CARE_REQUIRED };
  // A family trying again (back from the payment page): their own earlier unpaid attempt at these days
  // is let go first, so it doesn't count against them in the checks below. Guests are matched by email,
  // only on a family record with no portal account (anyone with an account signs in instead).
  const returning = input.signedIn?.familyId ?? (await (async () => {
    const g = await findGuardianByEmail(db, input.guardian.email.trim().toLowerCase());
    return g && !g.portalAccess && !g.passwordHash ? g.familyId : null;
  })());
  if (returning)
    await releaseEarlierAttempts(db, returning, (await Promise.all(lines.map((l) => expandSeries(db, [l.sessionId])))).flat(), {
      children: input.signedIn ? undefined : input.children.map((c) => ({ firstName: c.firstName, birthDate: c.birthDate })),
    });
  // A coupon is checked before anything is created, so a bad code books nothing.
  let couponId: string | null = null;
  if (input.couponCode?.trim()) {
    try {
      couponId = (await findCoupon(db, input.couponCode, lines.map((l) => l.sessionId), { familyId: input.signedIn?.familyId })).id;
    } catch (e) {
      if (e instanceof OpsError) return { ok: false, code: "coupon", error: e.message };
      throw e;
    }
  }

  // 1. Who is booking?
  let familyId: string;
  let guardianId: string;
  let actor: Actor;
  let createdFamily = false;
  if (input.signedIn) {
    if (!input.signedIn.canBook) return { ok: false, code: "forbidden", error: "Your account can’t make bookings. Ask the primary guardian." };
    // Yalla needs a phone number for every family; one missing from an older account is asked for here.
    const [me] = await db.select({ phone: guardians.phone }).from(guardians).where(eq(guardians.id, input.signedIn.guardianId));
    if (!me?.phone?.trim()) {
      const problem = phoneProblem(input.guardian.phone);
      if (problem) return { ok: false, code: "invalid", error: problem };
      await db.update(guardians).set({ phone: input.guardian.phone!.trim() }).where(eq(guardians.id, input.signedIn.guardianId));
    }
    familyId = input.signedIn.familyId;
    guardianId = input.signedIn.guardianId;
    actor = guardianActor(input.signedIn);
  } else {
    const email = input.guardian.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, code: "invalid", error: "Enter a valid email address." };
    if (!input.guardian.firstName.trim() || !input.guardian.lastName.trim()) return { ok: false, code: "invalid", error: "Enter your first and last name." };
    const phoneIssue = phoneProblem(input.guardian.phone);
    if (phoneIssue) return { ok: false, code: "invalid", error: phoneIssue };
    const existing = await findGuardianByEmail(db, email);
    // Someone who started a booking before (or joined a waitlist) but never paid has no portal
    // account to sign in to, so they simply continue as a guest on the same family record.
    const unclaimed = existing && !existing.portalAccess && !existing.passwordHash ? existing : null;
    if (existing && !unclaimed) {
      const { devLink } = await requestMagicLink(db, email, input.baseUrl);
      return {
        ok: false,
        code: "sign_in_required",
        error: "This email is already part of a Yalla family. We’ve sent a sign-in link so you can book with your saved details — your selection is kept here.",
        devLink,
      };
    }
    for (const c of input.children) {
      if (!c.firstName.trim() || !c.lastName?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(c.birthDate)) return { ok: false, code: "invalid", error: "Add each child’s first name, last name and date of birth." };
    }
    // Validate capacity and ages before creating any records.
    const pre = await precheck(db, input);
    if (pre) return pre;
    if (unclaimed) {
      familyId = unclaimed.familyId;
      guardianId = unclaimed.id;
      actor = guardianActor({ guardianId, firstName: unclaimed.firstName, lastName: unclaimed.lastName });
      if (input.guardian.phone?.trim()) await db.update(guardians).set({ phone: input.guardian.phone.trim() }).where(eq(guardians.id, unclaimed.id));
    } else {
      // No portal access until they pay: the payment is their way into the Family Portal.
      const created = await createFamily(db, PUBLIC, { guardian: { firstName: input.guardian.firstName, lastName: input.guardian.lastName, email, phone: input.guardian.phone, portalAccess: false } });
      familyId = created.family.id;
      guardianId = created.guardian.id;
      actor = guardianActor({ guardianId, firstName: created.guardian.firstName, lastName: created.guardian.lastName });
      createdFamily = true;
    }
  }

  try {
    // 2. Children: existing ones must belong to this family; new ones are matched by name + birth date.
    const childIdByKey = new Map<string, string>();
    for (const c of input.children) {
      if (!lines.some((l) => l.childKeys.includes(c.key))) continue;
      if (c.existingId) {
        const [row] = await db.select().from(children).where(and(eq(children.id, c.existingId), eq(children.familyId, familyId)));
        if (!row) throw new OpsError("invalid", "One of the selected children isn’t part of your family.");
        childIdByKey.set(c.key, row.id);
        if (keepOnFile(c)) {
          // Nothing sent: only allowed when answers are already on file, which are then left as they are.
          if (row.allergies === null || row.medicalNotes === null) throw new OpsError("care", CARE_REQUIRED);
        } else if (input.signedIn && !input.signedIn.canViewSensitive && row.allergies !== null && row.medicalNotes !== null) {
          // A guardian who can't see care details never overwrites what's on file.
        } else {
          await recordCareAnswers(db, actor, row.id, { allergies: c.allergies ?? "", medications: c.medications ?? "" });
        }
      } else {
        if (!c.firstName.trim() || !c.lastName?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(c.birthDate)) throw new OpsError("invalid", "Add each child’s first name, last name and date of birth.");
        const { child } = await addChild(db, actor, familyId, { firstName: c.firstName, lastName: c.lastName.trim(), birthDate: c.birthDate });
        childIdByKey.set(c.key, child.id);
        await recordCareAnswers(db, actor, child.id, { allergies: c.allergies ?? "", medications: c.medications ?? "" });
      }
    }

    // 3. Series-booked programs (e.g. camps) take every day together.
    const items: { sessionId: string; childId: string; addons?: string[] }[] = [];
    for (const l of lines) {
      const ids = await expandSeries(db, [l.sessionId]);
      for (const sid of ids)
        for (const key of l.childKeys)
          if (childIdByKey.has(key) && !items.some((i) => i.sessionId === sid && i.childId === childIdByKey.get(key)))
            items.push({ sessionId: sid, childId: childIdByKey.get(key)!, addons: l.addons?.[key] });
    }

    // 4. Blocking agreements: sign what was provided, report what's still needed.
    const refs = input.children.filter((c) => childIdByKey.has(c.key)).map((c) => ({ key: c.key, existingId: childIdByKey.get(c.key)!, firstName: c.firstName, birthDate: c.birthDate }));
    let needed = await previewAgreements(db, { familyId, sessionIds: items.map((i) => i.sessionId), children: refs });
    // Agreements signed for each purchase are attached to the booking once it exists (step 5).
    const signedForThisBooking: { submissionId: string; key: string }[] = [];
    for (const a of needed) {
      const sig = input.signatures.find((s) => s.templateId === a.templateId && (s.childKey ?? null) === a.childKey);
      if (!sig || !a.completableOnline) continue;
      const submission = await submitForm(db, actor, {
        templateId: a.templateId,
        familyId,
        childId: a.childKey ? childIdByKey.get(a.childKey) : null,
        signerGuardianId: guardianId,
        signatureText: sig.signatureText ?? null,
        consent: sig.consent,
        data: a.requiresSignature || a.fields ? undefined : { confirmed: sig.consent },
        // Online agreements carry their answers: initials, printed name and the drawn signature.
        answers: a.fields ? (sig.answers ?? {}) : undefined,
        ip: input.meta.ip,
        userAgent: input.meta.userAgent,
      });
      if (a.perBooking) signedForThisBooking.push({ submissionId: submission.id, key: `${a.templateId}:${a.childKey ?? ""}` });
    }
    needed = (await previewAgreements(db, { familyId, sessionIds: items.map((i) => i.sessionId), children: refs })).filter(
      (a) => !(a.perBooking && signedForThisBooking.some((x) => x.key === `${a.templateId}:${a.childKey ?? ""}`)),
    );
    if (needed.length) {
      throw new OpsError(
        "agreements",
        needed.some((a) => !a.completableOnline)
          ? `Before booking, Yalla needs: ${[...new Set(needed.map((a) => a.title))].join(", ")}. Please get in touch and we’ll help.`
          : "Please review and sign the agreements below to continue.",
        { agreements: needed },
      );
    }

    // The family's own earlier unpaid attempt at these days (they came back from the payment page and
    // started again) is let go, so it doesn't hold the spot or the code against them.
    await releaseEarlierAttempts(db, familyId, items.map((i) => i.sessionId), {
      children: input.signedIn ? undefined : input.children.map((c) => ({ firstName: c.firstName, birthDate: c.birthDate })),
    });
    // A once-per-family code is checked again now that the family is known (guests too).
    if (couponId && input.couponCode) await findCoupon(db, input.couponCode, items.map((i) => i.sessionId), { familyId });

    // 5. Hold the spots (transactional capacity check) and start payment.
    const hold = await createHold(db, actor, { familyId, items, source: "public" });
    if (signedForThisBooking.length)
      await db
        .update(formSubmissions)
        .set({ bookingId: hold.booking.id })
        .where(
          inArray(
            formSubmissions.id,
            signedForThisBooking.map((x) => x.submissionId),
          ),
        );
    if (couponId) await db.update(bookings).set({ discountId: couponId }).where(eq(bookings.id, hold.booking.id));
    if (hold.booking.status === "requested") return { ok: true, url: `${input.baseUrl}${bookingStatusPath(hold.booking.reference)}`, reference: hold.booking.reference };
    let checkout: Awaited<ReturnType<typeof startCheckout>>;
    try {
      checkout = await startCheckout(db, actor, hold.booking.id, { base: input.baseUrl });
    } catch (e) {
      // The payment page couldn't be opened: let the spots go, so "nothing was booked" is true.
      console.error("[public booking: checkout failed]", (e as Error).message?.slice(0, 200));
      await releaseEarlierAttempts(db, familyId, items.map((i) => i.sessionId));
      throw new OpsError("payment_unavailable", "We couldn’t open the payment page just now, so nothing was booked or charged. Please try again in a moment.");
    }
    return { ok: true, url: checkout.url, reference: hold.booking.reference };
  } catch (e) {
    if (createdFamily) await removeFreshFamily(db, familyId);
    if (e instanceof OpsError) {
      const details = e.details as { agreements?: Agreement[] } | undefined;
      return { ok: false, code: e.code, error: e.message, agreements: details?.agreements };
    }
    throw e;
  }
}

/** Ages and live capacity, before a brand-new family is created. */
async function precheck(db: Executor, input: PublicBookingInput): Promise<PublicBookingResult | null> {
  const need = new Map<string, number>();
  const all: string[] = [];
  for (const l of input.lines) {
    const ids = await expandSeries(db, [l.sessionId]);
    for (const id of ids) {
      need.set(id, (need.get(id) ?? 0) + l.childKeys.length);
      all.push(id);
    }
  }
  const rows = await db
    .select({ s: sessions, p: programs })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(inArray(sessions.id, [...new Set(all)]));
  const avail = await availabilityFor(
    db,
    rows.map((r) => r.s.id),
  );
  for (const { s, p } of rows) {
    const st = publicState(s, p, avail.get(s.id)?.remaining ?? 0, new Date(), (avail.get(s.id)?.occupancy.booked ?? 0) + (avail.get(s.id)?.occupancy.held ?? 0));
    const label = `${p.name} on ${fmtDate(s.localDate)}`;
    if (st.state === "closed" || st.state === "not_offered") return { ok: false, code: "closed", error: `${label}: ${st.state === "closed" ? st.reason : "not offered"}.` };
    if (st.state === "full") return { ok: false, code: "capacity", error: `${label} is now full. You can join the waitlist.` };
    const n = p.bookingUnit === "per_child" ? (need.get(s.id) ?? 0) : 1;
    const remaining = avail.get(s.id)?.remaining ?? 0;
    if (n > remaining)
      return {
        ok: false,
        code: "capacity",
        error: remaining === 0 ? `${label} is now full. You can join the waitlist.` : `There isn’t room for everyone in this booking on ${label}. Try fewer children or another date.`,
      };
    for (const l of input.lines.filter((x) => x.sessionId === s.id)) {
      for (const key of l.childKeys) {
        const c = input.children.find((x) => x.key === key);
        if (!c) continue;
        const age = ageInMonths(c.birthDate, s.localDate);
        if (!ageFits(age, sessionAges(s, p)))
          return { ok: false, code: "age", error: `${c.firstName} will be ${age} months old on ${fmtDate(s.localDate)}, outside the age range for ${s.title ?? p.name}.` };
      }
    }
  }
  return null;
}

/** Undo a family created moments ago by this request when the booking couldn't be held. */
async function removeFreshFamily(db: Executor, familyId: string) {
  const [b] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.familyId, familyId)).limit(1);
  if (b) return; // anything booked stays
  await db.delete(formSubmissions).where(eq(formSubmissions.familyId, familyId));
  await db.delete(children).where(eq(children.familyId, familyId));
  await db.delete(guardians).where(eq(guardians.familyId, familyId));
  await db.delete(families).where(eq(families.id, familyId));
}

/* ───────────────────────── Retrying payment ───────────────────────── */

/**
 * Starts a fresh checkout after a failed payment while the hold is still valid. Each attempt gets
 * its own idempotency key so a declined attempt doesn't block the next one.
 */
export async function retryCheckout(db: DB, reference: string, baseUrl: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, reference));
  if (!b) throw new OpsError("not_found", "Booking not found.");
  if (!["held", "pending_payment"].includes(b.status) || !b.holdExpiresAt || b.holdExpiresAt <= new Date()) throw new OpsError("expired", "This hold has ended. Please choose your sessions again.");
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.bookingId, b.id), ne(invoices.status, "void")));
  if (!inv) return startCheckout(db, PUBLIC, b.id, { base: baseUrl });
  const pending = await db.select().from(payments).where(and(eq(payments.invoiceId, inv.id), eq(payments.status, "pending")));
  const provider = activeProvider();
  if (pending[0]?.checkoutRef) return { url: provider.name === "test" ? `${baseUrl}/pay/test/${pending[0].checkoutRef}` : (pending[0].providerRef ?? `${baseUrl}${bookingStatusPath(b.reference)}`), free: false };
  const t = (await invoiceTotals(db, [inv.id])).get(inv.id)!;
  // Play Pass funds already set aside for this booking stay applied; the card covers the rest.
  const due = t.balance - ((await heldReservation(db, b.id))?.amountCents ?? 0);
  if (due <= 0) return startCheckout(db, PUBLIC, b.id, { base: baseUrl });
  const attempts = (await db.select({ id: payments.id }).from(payments).where(eq(payments.invoiceId, inv.id))).length;
  const [primary] = await db.select().from(guardians).where(and(eq(guardians.familyId, b.familyId), eq(guardians.isPrimary, true)));
  const paymentId = crypto.randomUUID();
  const idem = `checkout:${b.id}:${inv.id}:attempt-${attempts + 1}`;
  const label = await checkoutLabel(db, b.id, { walletCents: t.balance - due });
  const checkout = await provider.createCheckout({
    paymentId,
    amountCents: due,
    description: label.name,
    details: label.details,
    customerEmail: primary?.email,
    successUrl: `${baseUrl}${bookingStatusPath(b.reference)}`,
    cancelUrl: `${baseUrl}${bookingStatusPath(b.reference, { cancelled: "1" })}`,
    expiresAt: b.holdExpiresAt,
    idempotencyKey: idem,
  });
  await db.insert(payments).values({
    id: paymentId,
    invoiceId: inv.id,
    familyId: b.familyId,
    amountCents: due,
    method: "card",
    status: "pending",
    provider: provider.name,
    checkoutRef: checkout.checkoutRef,
    providerRef: provider.name === "stripe" ? checkout.url : null,
    idempotencyKey: idem,
  });
  await db.update(bookings).set({ status: "pending_payment", updatedAt: new Date() }).where(eq(bookings.id, b.id));
  return { url: provider.name === "test" ? `${baseUrl}${checkout.url}` : checkout.url, free: false };
}

/* ───────────────────────── Confirmation & offers ───────────────────────── */

export async function bookingStatusView(db: Executor, reference: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, reference));
  if (!b) return null;
  const rows = (await bookingLines(db, b.id)).filter((r) => r.item.status !== "moved");
  const invs = await db.select().from(invoices).where(and(eq(invoices.bookingId, b.id), ne(invoices.status, "void")));
  const totals = await invoiceTotals(
    db,
    invs.map((i) => i.id),
  );
  const pays = invs.length
    ? await db
        .select()
        .from(payments)
        .where(
          inArray(
            payments.invoiceId,
            invs.map((i) => i.id),
          ),
        )
        .orderBy(desc(payments.createdAt))
    : [];
  const total = [...totals.values()].reduce((s, t) => s + t.total, 0);
  const balance = [...totals.values()].reduce((s, t) => s + t.balance, 0);
  return {
    reference: b.reference,
    /** For access checks only; never shown. */
    familyId: b.familyId,
    status: b.status,
    source: b.source,
    holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
    lines: rows.map((r) => ({ id: r.item.id, sessionId: r.session.id, label: describeLine(r), status: r.item.status, priceCents: r.item.priceCents })),
    /** Flex and camp come with a packing list in the Family Portal. */
    hasPackingList: rows.some((r) => r.program.slug === "yalla-flex" || r.program.kind === "camp"),
    totalCents: total,
    balanceCents: balance,
    walletCents: [...totals.values()].reduce((s, t) => s + t.walletApplied, 0),
    cardCents: [...totals.values()].reduce((s, t) => s + t.paid, 0),
    latestPayment: pays[0] ? { status: pays[0].status, failureReason: pays[0].failureReason, provider: pays[0].provider } : null,
  };
}

/* ───────────────────────── Public waitlist ───────────────────────── */

export async function joinPublicWaitlist(
  db: DB,
  input: { signedIn?: GuardianContext | null; guardian: { firstName: string; lastName: string; email: string; phone?: string }; child: { existingId?: string | null; firstName: string; lastName?: string; birthDate: string }; sessionId: string; baseUrl: string; dayLength?: string | null },
): Promise<{ ok: true } | { ok: false; code: string; error: string; devLink?: string }> {
  try {
    // Every family on file has a parent's full name, email and phone, and each child's full name and birthday.
    if (!input.child.existingId && (!input.child.firstName.trim() || !input.child.lastName?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.child.birthDate)))
      return { ok: false, code: "invalid", error: "Add your child’s first name, last name and date of birth." };
    if (input.signedIn) {
      const [me] = await db.select({ phone: guardians.phone }).from(guardians).where(eq(guardians.id, input.signedIn.guardianId));
      if (!me?.phone?.trim()) {
        const problem = phoneProblem(input.guardian.phone);
        if (problem) return { ok: false, code: "invalid", error: problem };
        await db.update(guardians).set({ phone: input.guardian.phone!.trim() }).where(eq(guardians.id, input.signedIn.guardianId));
      }
    } else {
      if (!input.guardian.firstName.trim() || !input.guardian.lastName.trim()) return { ok: false, code: "invalid", error: "Enter your first and last name." };
      const problem = phoneProblem(input.guardian.phone);
      if (problem) return { ok: false, code: "invalid", error: problem };
    }
    let familyId: string;
    let actor: Actor;
    /** No Family Portal account yet (new to Yalla, or only ever waitlisted): they get the welcome email. */
    let newFamily = false;
    if (input.signedIn) {
      familyId = input.signedIn.familyId;
      actor = guardianActor(input.signedIn);
    } else {
      const email = input.guardian.email.trim().toLowerCase();
      const existing = await findGuardianByEmail(db, email);
      if (existing && !existing.portalAccess && !existing.passwordHash) {
        familyId = existing.familyId;
        newFamily = true;
        if (input.guardian.phone?.trim()) await db.update(guardians).set({ phone: input.guardian.phone.trim() }).where(eq(guardians.id, existing.id));
        actor = guardianActor({ guardianId: existing.id, firstName: existing.firstName, lastName: existing.lastName });
      } else if (existing) {
        const { devLink } = await requestMagicLink(db, email, input.baseUrl);
        return { ok: false, code: "sign_in_required", error: "This email is already part of a Yalla family. We’ve sent a sign-in link — join the waitlist once you’re signed in.", devLink };
      } else {
        // Joining a waitlist doesn't open the Family Portal (only a paid booking or an invitation does).
        const created = await createFamily(db, PUBLIC, { guardian: { firstName: input.guardian.firstName, lastName: input.guardian.lastName, email, phone: input.guardian.phone, portalAccess: false } });
        familyId = created.family.id;
        newFamily = true;
        actor = guardianActor({ guardianId: created.guardian.id, firstName: created.guardian.firstName, lastName: created.guardian.lastName });
      }
    }
    let childId = input.child.existingId ?? null;
    if (childId) {
      const [c] = await db.select().from(children).where(and(eq(children.id, childId), eq(children.familyId, familyId)));
      if (!c) throw new OpsError("invalid", "That child isn’t part of your family.");
      // A child held in a Flex cohort can't wait for another cohort's Flex day.
      if (c.flexHold) {
        const [ws] = await db.select({ s: sessions, p: programs }).from(sessions).innerJoin(programs, eq(programs.id, sessions.programId)).where(eq(sessions.id, input.sessionId));
        if (ws && ws.p.slug === FLEX_SLUG && flexGroupFor(ws.s.minAgeMonths)?.key !== c.flexHold)
          throw new OpsError("flex_hold", `${c.preferredName || c.firstName} is staying in ${flexHoldName(c.flexHold)} for Yalla Flex for now. Ask us when they’re ready to move up.`);
      }
    } else {
      const { child } = await addChild(db, actor, familyId, { firstName: input.child.firstName, lastName: input.child.lastName!.trim(), birthDate: input.child.birthDate });
      childId = child.id;
    }
    const entry = await joinWaitlist(db, actor, { familyId, sessionId: input.sessionId, childIds: [childId], dayLength: input.dayLength });
    await emailWaitlistJoined(db, { familyId, entryId: entry.id, newFamily, baseUrl: input.baseUrl }).catch((e) => console.error("[waitlist email failed]", (e as Error).message?.slice(0, 120)));
    // Let the team know (Admin → Inbox and email). The waitlist itself is in Admin → Waitlist.
    const [sx] = await db.select({ s: sessions, p: programs }).from(sessions).innerJoin(programs, eq(programs.id, sessions.programId)).where(eq(sessions.id, input.sessionId));
    const [kid] = await db.select().from(children).where(eq(children.id, childId));
    const who = input.signedIn ? { name: `${input.signedIn.firstName} ${input.signedIn.lastName}`, email: input.signedIn.email } : { name: `${input.guardian.firstName} ${input.guardian.lastName}`, email: input.guardian.email };
    await submitEnquiry(db, {
      kind: "waitlist",
      name: who.name,
      email: who.email,
      familyId,
      baseUrl: input.baseUrl,
      confirmToFamily: false,
      topic: sx ? topicForProgram(sx.p) : undefined,
      details: [
        { label: "Session", value: sx ? `${sx.s.title ?? sx.p.name}, ${fmtDate(sx.s.localDate, "EEE MMM d")}` : input.sessionId },
        { label: "Child", value: kid ? `${kid.firstName}, born ${kid.birthDate}` : "" },
      ],
    }).catch((e) => console.error("[waitlist notice failed]", (e as Error).message?.slice(0, 120)));
    return { ok: true };
  } catch (e) {
    if (e instanceof OpsError) return { ok: false, code: e.code, error: e.message };
    throw e;
  }
}

/**
 * Tells a family they're on the waitlist. A family new to Yalla (no Family Portal account) gets a warm
 * welcome with a link to set up their account, once; after that, and for returning families, a short
 * "you're on the waitlist" note.
 */
async function emailWaitlistJoined(db: DB, input: { familyId: string; entryId: string; newFamily: boolean; baseUrl: string }) {
  const [row] = await db
    .select({ e: waitlistEntries, s: sessions, p: programs })
    .from(waitlistEntries)
    .innerJoin(sessions, eq(sessions.id, waitlistEntries.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(eq(waitlistEntries.id, input.entryId));
  if (!row) return;
  const [g] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, input.familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  if (!g) return;
  const kids = row.e.childIds.length ? await db.select().from(children).where(inArray(children.id, row.e.childIds)) : [];
  const names = kids.map((k) => (k.preferredName || k.firstName).trim());
  const isFlex = row.p.slug === FLEX_SLUG;
  const day = childDay(row.p, row.s, row.e.dayLength === "half" ? [HALF_DAY] : []);
  const what = row.s.title ?? row.p.name;
  const details = `>> ${what}\n${fmtDate(row.s.localDate, "EEEE, MMMM d, yyyy")} · ${fmtTime(day.startsAt)}–${fmtTime(day.endsAt)}${day.label ? ` · ${day.label}` : ""}${names.length ? ` · for ${names.join(" and ")}` : ""}`;
  const how = isFlex
    ? "If a spot opens, we’ll email you right away with a link to book. Families are offered the spot in the order they joined, and each has 15 minutes to book before the next family is offered it too. Nothing is charged unless you book."
    : "If a spot opens, we’ll email you right away with a link to book. Spots are offered in the order families joined, and nothing is charged unless you book.";
  // A short hello written for what they're waiting for (a Flex family wants one good day, not a membership pitch).
  const welcome_intro =
    isFlex
      ? "We’re so glad you found us! Yalla Flex is childcare by the day for the days you need it most: daycare is closed, the nanny is sick, or a deadline won’t wait. Your little one plays in a small group with warm, experienced caregivers while you get work done in our coworking space just down the hall."
      : row.p.kind === "camp"
        ? "We’re so glad you found us! Camp Yalla fills the days school and childcare are closed with play, art and time outdoors, in small groups led by warm, experienced caregivers. Early Bird and late stay help it fit around your workday."
        : "We’re so glad you found us! Yalla Happenings are playful sessions for little ones, from weekend mornings to evenings out for the grown-ups, in small groups led by warm, experienced caregivers.";
  const vars = { welcome_intro, guardian_first_name: g.firstName, program: row.p.name, date: fmtDate(row.s.localDate, "EEE, MMM d"), child_names: names.join(" and ") || "your family", waitlist_details: details, waitlist_how: how };
  // The welcome goes once per family: a family who has had it before gets the short note.
  let welcome = input.newFamily && !g.passwordHash;
  if (welcome) {
    const [sent] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.familyId, input.familyId), eq(messages.templateKey, "waitlist_welcome"))).limit(1);
    if (sent) welcome = false;
  }
  if (welcome) {
    const { waitlistSetupLink } = await import("@/lib/family-auth");
    const link = await waitlistSetupLink(db, PUBLIC, { email: g.email, name: `${g.firstName} ${g.lastName}` }, input.baseUrl);
    await notifyFamily(db, { key: "waitlist_welcome", familyId: input.familyId, guardianIds: [g.id], vars: { ...vars, link }, related: { type: "waitlist", id: input.entryId } });
  } else {
    await notifyFamily(db, { key: "waitlist_joined", familyId: input.familyId, guardianIds: [g.id], vars, related: { type: "waitlist", id: input.entryId } });
  }
}

/* ───────────────────────── Family Portal ───────────────────────── */

export async function familyPortalData(db: Executor, g: GuardianContext) {
  const kids = await db.select().from(children).where(and(eq(children.familyId, g.familyId), eq(children.status, "active"))).orderBy(asc(children.birthDate));
  const cohortRows = await db.select().from(cohorts);
  const items = await db
    .select({ i: bookingItems, b: bookings, s: sessions, p: programs })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(bookings.familyId, g.familyId), inArray(bookingItems.status, ["confirmed", "held", "cancelled"]), inArray(bookings.status, ["confirmed", "pending_payment", "held", "requested", "cancelled", "needs_attention"])))
    .orderBy(asc(sessions.startsAt));
  const now = new Date();
  const childName = new Map(kids.map((k) => [k.id, k.preferredName || k.firstName]));
  const creditHours = await getPolicy(db, "booking.creditCutoffHours");
  const mapItem = (x: (typeof items)[number]) => {
    const hoursAhead = (x.s.startsAt.getTime() - now.getTime()) / 3600_000;
    return {
      itemId: x.i.id,
      bookingId: x.b.id,
      reference: x.b.reference,
      bookingStatus: x.b.status,
      itemStatus: x.i.status,
      program: x.p.name,
      title: x.s.title ?? x.p.name,
      localDate: x.s.localDate,
      startsAt: x.s.startsAt.toISOString(),
      // The child's own day: a half day ends at 12:00pm.
      endsAt: childDay(x.p, x.s, x.i.addons).endsAt.toISOString(),
      dayLabel: childDay(x.p, x.s, x.i.addons).label,
      child: x.i.childId ? (childName.get(x.i.childId) ?? "") : "",
      canCancel: x.i.status === "confirmed" && hoursAhead > 0,
      /** Cancelling now returns what was paid to the Yalla Wallet. */
      creditOnCancel: hoursAhead >= creditHours,
      cancelNote:
        hoursAhead >= creditHours
          ? `Cancel at least ${creditHours} hours ahead to get Yalla Wallet credit.`
          : `Less than ${creditHours} hours away: cancelling now isn’t eligible for credit. Unwell? Please contact us.`,
    };
  };
  const upcoming = items.filter((x) => x.s.endsAt > now && x.i.status !== "cancelled").map(mapItem);
  const past = items
    .filter((x) => x.s.endsAt <= now || x.i.status === "cancelled")
    .map(mapItem)
    .reverse()
    .slice(0, 20);

  const programIds = [...new Set(items.filter((x) => x.s.endsAt > now).map((x) => x.p.id))];
  const paperwork = await paperworkStatus(db, {
    familyId: g.familyId,
    childIds: kids.map((k) => k.id),
    programIds,
  });
  const templateIds = [...new Set([...paperwork.values()].flat().map((i) => i.templateId))];
  const tmpl = templateIds.length ? await db.select().from(formTemplates).where(inArray(formTemplates.id, templateIds)) : [];
  const versions = tmpl.length
    ? await db
        .select()
        .from(formVersions)
        .where(
          inArray(
            formVersions.id,
            tmpl.map((t) => t.currentVersionId!).filter(Boolean),
          ),
        )
    : [];
  const forms = [...paperwork.entries()].flatMap(([key, list]) =>
    list.map((i: PaperworkItem) => {
      const t = tmpl.find((x) => x.id === i.templateId)!;
      const v = versions.find((x) => x.id === t.currentVersionId);
      return { ...i, forChild: key === "family" ? null : (childName.get(key) ?? null), requiresSignature: t.requiresSignature, body: v?.body ?? "", version: v?.version ?? 1, completableOnline: t.kind !== "upload" };
    }),
  );

  const mems = await db.select().from(memberships).where(and(eq(memberships.familyId, g.familyId), inArray(memberships.status, ["active", "upcoming", "paused"])));
  const billing = g.canViewBilling ? await familyLedger(db, g.familyId) : null;

  return {
    children: kids.map((k) => ({
      id: k.id,
      firstName: k.firstName,
      lastName: k.lastName,
      preferredName: k.preferredName,
      birthDate: k.birthDate,
      cohort: cohortRows.find((c) => c.id === k.cohortId)?.name ?? null,
      care: g.canViewSensitive ? { allergies: k.allergies, medicalNotes: k.medicalNotes, careNotes: k.careNotes, updatedAt: k.infoUpdatedAt?.toISOString() ?? null } : null,
    })),
    memberships: mems.map((m) => ({ id: m.id, child: childName.get(m.childId) ?? "", weekdays: m.weekdays, dayLength: m.dayLength, startsOn: m.startsOn, endsOn: m.endsOn, status: m.status })),
    upcoming,
    past,
    forms,
    billing: billing
      ? {
          outstandingCents: billing.outstanding,
          creditCents: billing.credit,
          invoices: billing.invoices.map((i) => ({ id: i.id, number: i.number, description: i.description, issuedAt: i.issuedAt.toISOString(), status: i.status, totalCents: i.totals.total, paidCents: i.totals.paid + i.totals.creditApplied, refundedCents: i.totals.refunded, balanceCents: i.totals.balance })),
        }
      : null,
  };
}

export async function familyUpdateCare(db: Executor, g: GuardianContext, childId: string, patch: { allergies: string; medicalNotes: string; careNotes: string }) {
  if (!g.canViewSensitive) throw new OpsError("forbidden", "Your account can’t edit care information. Ask the primary guardian.");
  const [c] = await db.select().from(children).where(and(eq(children.id, childId), eq(children.familyId, g.familyId)));
  if (!c) throw new OpsError("not_found", "Child not found.");
  await updateChild(db, guardianActor(g), childId, { allergies: patch.allergies.trim() || null, medicalNotes: patch.medicalNotes.trim() || null, careNotes: patch.careNotes.trim() || null });
}

/**
 * A family cancels one booked child-session from the portal, any time before it starts. Cancelling
 * 24+ hours ahead returns what was paid to their Yalla Wallet (Play Pass funds to their balance,
 * card payments as credit valid 24 months); later cancellations aren't credited. No cash refunds.
 */
export async function familyCancelItem(db: DB, g: GuardianContext, itemId: string, now = new Date()) {
  const [x] = await db
    .select({ i: bookingItems, b: bookings, s: sessions, p: programs })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(eq(bookingItems.id, itemId));
  if (!x || x.b.familyId !== g.familyId) throw new OpsError("not_found", "Booking not found.");
  if (!g.canBook) throw new OpsError("forbidden", "Your account can’t change bookings.");
  if (x.i.status !== "confirmed") throw new OpsError("invalid", "This booking is already cancelled.");
  const hoursAhead = (x.s.startsAt.getTime() - now.getTime()) / 3600_000;
  if (hoursAhead <= 0) throw new OpsError("started", "This session has already started. Please contact Yalla.");
  const cutoff = await getPolicy(db, "booking.creditCutoffHours");
  const kid = x.i.childId ? (await db.select({ first: children.firstName, preferred: children.preferredName }).from(children).where(eq(children.id, x.i.childId)))[0] : undefined;
  const childName = kid ? kid.preferred || kid.first : null;
  await cancelBooking(db, guardianActor(g), { bookingId: x.b.id, itemIds: [itemId], reason: "Cancelled by family in the portal", notify: false });
  const credited =
    hoursAhead >= cutoff
      ? (
          await returnPaid(db, guardianActor(g), {
            bookingId: x.b.id,
            amountCents: itemValue(x.i, x.p.kind, x.p.slug),
            key: `family-cancel:${x.i.id}`,
            reason: "Cancelled by the family",
            to: "wallet",
            familyReason: `You cancelled ${x.s.title ?? x.p.name} on ${fmtDate(x.s.localDate, "EEEE, MMMM d")}${childName ? ` for ${childName}` : ""} at least ${cutoff} hours before it began, so what you paid for it was returned to your Yalla Wallet.`,
          })
        ).total
      : 0;
  const { cancellationVars } = await import("./bookings");
  await notifyFamily(db, {
    key: "booking_cancellation",
    familyId: x.b.familyId,
    vars: await cancellationVars(db, x.b.id, [itemId], {
      walletCents: credited,
      note:
        hoursAhead >= cutoff
          ? "Nothing was paid for this booking, so there’s nothing to return."
          : `Because this was cancelled less than ${cutoff} hours before it began, it isn’t eligible for credit. If your child is unwell or something unexpected came up, just reply to this email and let us know.`,
    }),
    related: { type: "booking", id: x.b.id },
  });
  const { notifyTeamOfCancellation } = await import("./staff-notices");
  await notifyTeamOfCancellation(db, {
    bookingId: x.b.id,
    itemIds: [itemId],
    actor: guardianActor(g),
    walletCents: credited,
    money: credited
      ? `We returned ${usd(credited)} to their Yalla Wallet.`
      : hoursAhead >= cutoff
        ? "Nothing had been paid for this booking, so nothing was returned."
        : `They cancelled less than ${cutoff} hours before it began, so no credit was given.`,
  });
  return { credited, late: hoursAhead < cutoff };
}

export async function familySignForm(db: Executor, g: GuardianContext, input: { templateId: string; childId: string | null; signatureText: string; consent: boolean; answers?: Record<string, string>; ip?: string; userAgent?: string }) {
  if (input.childId) {
    const [c] = await db.select().from(children).where(and(eq(children.id, input.childId), eq(children.familyId, g.familyId)));
    if (!c) throw new OpsError("not_found", "Child not found.");
  }
  const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, input.templateId));
  if (!t) throw new OpsError("not_found", "Form not found.");
  if (t.kind === "upload") throw new OpsError("invalid", "This form needs a document. Please send it to Yalla.");
  if (!input.consent) throw new OpsError("invalid", t.requiresSignature ? "Please agree to sign electronically." : "Please confirm before submitting.");
  // Only forms that actually apply to this family can be submitted here.
  const reqs = await applicableTemplates(db, { familyId: g.familyId, childIds: input.childId ? [input.childId] : [], programIds: [] });
  const allReqs = await db.select({ id: formRequirements.templateId }).from(formRequirements).where(and(eq(formRequirements.templateId, t.id), eq(formRequirements.active, true)));
  if (!reqs.some((r) => r.t.id === t.id) && !allReqs.length) throw new OpsError("invalid", "This form isn’t required for your family.");
  return submitForm(db, guardianActor(g), {
    templateId: t.id,
    familyId: g.familyId,
    childId: input.childId,
    signerGuardianId: g.guardianId,
    signatureText: t.requiresSignature ? input.signatureText : null,
    consent: input.consent,
    data: t.requiresSignature || input.answers ? undefined : { confirmed: true },
    answers: input.answers,
    ip: input.ip,
    userAgent: input.userAgent,
  });
}

/** Children in a booking whose allergies and medications haven't been answered yet (asked before payment). */
export async function careNeededForBooking(db: Executor, bookingId: string) {
  const rows = await db
    .selectDistinct({ child: children })
    .from(bookingItems)
    .innerJoin(children, eq(children.id, bookingItems.childId))
    .where(and(eq(bookingItems.bookingId, bookingId), inArray(bookingItems.status, ["held", "confirmed"])));
  return rows.filter((r) => !careAnswered(r.child)).map((r) => ({ childId: r.child.id, name: r.child.preferredName || r.child.firstName }));
}

/** Saves the allergy and medication answers for the children in a booking (from a waitlist offer page). */
export async function saveBookingCare(db: Executor, bookingId: string, answers: { childId: string; allergies: unknown; medications: unknown }[]) {
  const needed = await careNeededForBooking(db, bookingId);
  for (const n of needed) {
    const a = answers.find((x) => x.childId === n.childId);
    if (!a || !careValid(a.allergies) || !careValid(a.medications)) throw new OpsError("invalid", CARE_REQUIRED);
    await recordCareAnswers(db, { type: "system", name: "Waitlist offer" }, n.childId, { allergies: a.allergies, medications: a.medications });
  }
}

