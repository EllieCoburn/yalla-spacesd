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
  scheduleSeries,
  sessions,
} from "@/lib/db/schema";
import { requestMagicLink, guardianActor, type GuardianContext } from "@/lib/family-auth";
import { activeProvider } from "@/lib/payments/provider";
import { ageInMonths, fmtDate } from "@/lib/time";
import { invoiceTotals, familyLedger } from "./billing";
import { bookingLines, cancelBooking, createHold, describeLine, startCheckout } from "./bookings";
import { availabilityFor, publicState, type PublicState } from "./capacity";
import { addChild, createFamily, findGuardianByEmail, updateChild } from "./families";
import { applicableTemplates, paperworkStatus, submitForm, type PaperworkItem } from "./forms";
import { joinWaitlist } from "./waitlist";
import { ageFits, sessionAges } from "@/lib/booking/ages";

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
  ages: { min: number | null; max: number | null };
  eligible: boolean;
  seriesId: string | null;
  bookAsSeries: boolean;
  bookingUnit: string;
  approvalRequired: boolean;
};

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
  return rows.map(({ s, p, c, series }) => {
    const remaining = avail.get(s.id)?.remaining ?? 0;
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
      state: publicState(s, p, remaining, now),
      priceCents: pickPrice(s, p, table),
      ages: { min: minAge, max: maxAge },
      eligible,
      seriesId: s.seriesId,
      bookAsSeries: !!series?.bookAsSeries || p.seriesMode === "full_series",
      bookingUnit: p.bookingUnit,
      approvalRequired: p.bookingMode === "request",
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
};

type ChildRef = { key: string; existingId?: string | null; firstName: string };

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
  const programIds = [...new Set((await db.select({ p: sessions.programId }).from(sessions).where(inArray(sessions.id, sessionIds))).map((r) => r.p))];
  const existingIds = input.children.map((c) => c.existingId).filter(Boolean) as string[];
  const reqs = await applicableTemplates(db, { familyId: input.familyId ?? "00000000-none", childIds: existingIds, programIds, sessionIds });
  const blockingTemplates = new Map<string, (typeof reqs)[number]["t"]>();
  for (const r of reqs) if (r.t.enforcement === "blocks_booking") blockingTemplates.set(r.t.id, r.t);
  if (!blockingTemplates.size) return [];

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
    const base = { templateId: t.id, title: t.title, kind: t.kind, body: v?.body ?? "", version: v?.version ?? 1, requiresSignature: t.requiresSignature, perChild: t.perChild, completableOnline: t.kind !== "upload" };
    if (t.perChild) {
      for (const c of input.children) {
        if (c.existingId && done.has(`${t.id}:${c.existingId}`)) continue;
        out.push({ ...base, childKey: c.key });
      }
    } else if (!done.has(`${t.id}:family`)) out.push({ ...base, childKey: null });
  }
  return out;
}

/* ───────────────────────── Submitting a booking ───────────────────────── */

export type PublicBookingInput = {
  signedIn?: GuardianContext | null;
  guardian: { firstName: string; lastName: string; email: string; phone?: string };
  children: (ChildRef & { lastName: string; birthDate: string; allergies?: string })[];
  lines: { sessionId: string; childKeys: string[]; addons?: Record<string, string[]> }[];
  signatures: { templateId: string; childKey: string | null; signatureText?: string; consent: boolean }[];
  meta: { ip?: string; userAgent?: string };
  baseUrl: string;
};

export type PublicBookingResult =
  | { ok: true; url: string; reference: string }
  | { ok: false; code: string; error: string; agreements?: Agreement[]; devLink?: string };

export async function submitPublicBooking(db: DB, input: PublicBookingInput): Promise<PublicBookingResult> {
  const lines = input.lines.filter((l) => l.childKeys.length);
  if (!lines.length) return { ok: false, code: "empty", error: "Choose at least one session and who’s coming." };

  // 1. Who is booking?
  let familyId: string;
  let guardianId: string;
  let actor: Actor;
  let createdFamily = false;
  if (input.signedIn) {
    if (!input.signedIn.canBook) return { ok: false, code: "forbidden", error: "Your account can’t make bookings. Ask the primary guardian." };
    familyId = input.signedIn.familyId;
    guardianId = input.signedIn.guardianId;
    actor = guardianActor(input.signedIn);
  } else {
    const email = input.guardian.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, code: "invalid", error: "Enter a valid email address." };
    if (!input.guardian.firstName.trim() || !input.guardian.lastName.trim()) return { ok: false, code: "invalid", error: "Enter your first and last name." };
    const existing = await findGuardianByEmail(db, email);
    if (existing) {
      const { devLink } = await requestMagicLink(db, email, input.baseUrl);
      return {
        ok: false,
        code: "sign_in_required",
        error: "This email is already part of a Yalla family. We’ve sent a sign-in link so you can book with your saved details — your selection is kept here.",
        devLink,
      };
    }
    for (const c of input.children) {
      if (!c.firstName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(c.birthDate)) return { ok: false, code: "invalid", error: "Add each child’s first name and date of birth." };
    }
    // Validate capacity and ages before creating any records.
    const pre = await precheck(db, input);
    if (pre) return pre;
    const created = await createFamily(db, PUBLIC, { guardian: { firstName: input.guardian.firstName, lastName: input.guardian.lastName, email, phone: input.guardian.phone } });
    familyId = created.family.id;
    guardianId = created.guardian.id;
    actor = guardianActor({ guardianId, firstName: created.guardian.firstName, lastName: created.guardian.lastName });
    createdFamily = true;
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
      } else {
        if (!c.firstName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(c.birthDate)) throw new OpsError("invalid", "Add each child’s first name and date of birth.");
        const { child } = await addChild(db, actor, familyId, { firstName: c.firstName, lastName: c.lastName || input.guardian.lastName, birthDate: c.birthDate, allergies: c.allergies });
        childIdByKey.set(c.key, child.id);
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
    const refs = input.children.filter((c) => childIdByKey.has(c.key)).map((c) => ({ key: c.key, existingId: childIdByKey.get(c.key)!, firstName: c.firstName }));
    let needed = await previewAgreements(db, { familyId, sessionIds: items.map((i) => i.sessionId), children: refs });
    for (const a of needed) {
      const sig = input.signatures.find((s) => s.templateId === a.templateId && (s.childKey ?? null) === a.childKey);
      if (!sig || !a.completableOnline) continue;
      await submitForm(db, actor, {
        templateId: a.templateId,
        familyId,
        childId: a.childKey ? childIdByKey.get(a.childKey) : null,
        signerGuardianId: guardianId,
        signatureText: sig.signatureText ?? null,
        consent: sig.consent,
        data: a.requiresSignature ? undefined : { confirmed: sig.consent },
        ip: input.meta.ip,
        userAgent: input.meta.userAgent,
      });
    }
    needed = await previewAgreements(db, { familyId, sessionIds: items.map((i) => i.sessionId), children: refs });
    if (needed.length) {
      throw new OpsError(
        "agreements",
        needed.some((a) => !a.completableOnline)
          ? `Before booking, Yalla needs: ${[...new Set(needed.map((a) => a.title))].join(", ")}. Please get in touch and we’ll help.`
          : "Please review and sign the agreements below to continue.",
        { agreements: needed },
      );
    }

    // 5. Hold the spots (transactional capacity check) and start payment.
    const hold = await createHold(db, actor, { familyId, items, source: "public" });
    if (hold.booking.status === "requested") return { ok: true, url: `${input.baseUrl}/book/confirmation/${hold.booking.reference}`, reference: hold.booking.reference };
    const checkout = await startCheckout(db, actor, hold.booking.id, { base: input.baseUrl });
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
    const st = publicState(s, p, avail.get(s.id)?.remaining ?? 0);
    const label = `${p.name} on ${fmtDate(s.localDate)}`;
    if (st.state === "closed" || st.state === "not_offered") return { ok: false, code: "closed", error: `${label}: ${st.state === "closed" ? st.reason : "not offered"}.` };
    const n = p.bookingUnit === "per_child" ? (need.get(s.id) ?? 0) : 1;
    const remaining = avail.get(s.id)?.remaining ?? 0;
    if (n > remaining)
      return {
        ok: false,
        code: "capacity",
        error: remaining === 0 ? `${label} is fully booked.` : `Only ${remaining} ${remaining === 1 ? "spot remains" : "spots remain"} for ${label}, and this booking needs ${n}.`,
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
  if (pending[0]?.checkoutRef) return { url: provider.name === "test" ? `${baseUrl}/pay/test/${pending[0].checkoutRef}` : (pending[0].providerRef ?? `${baseUrl}/book/confirmation/${b.reference}`), free: false };
  const t = (await invoiceTotals(db, [inv.id])).get(inv.id)!;
  const attempts = (await db.select({ id: payments.id }).from(payments).where(eq(payments.invoiceId, inv.id))).length;
  const [primary] = await db.select().from(guardians).where(and(eq(guardians.familyId, b.familyId), eq(guardians.isPrimary, true)));
  const paymentId = crypto.randomUUID();
  const idem = `checkout:${b.id}:${inv.id}:attempt-${attempts + 1}`;
  const checkout = await provider.createCheckout({
    paymentId,
    amountCents: t.balance,
    description: `Yalla booking ${b.reference}`,
    customerEmail: primary?.email,
    successUrl: `${baseUrl}/book/confirmation/${b.reference}`,
    cancelUrl: `${baseUrl}/book/confirmation/${b.reference}?cancelled=1`,
    expiresAt: b.holdExpiresAt,
    idempotencyKey: idem,
  });
  await db.insert(payments).values({
    id: paymentId,
    invoiceId: inv.id,
    familyId: b.familyId,
    amountCents: t.balance,
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
    status: b.status,
    source: b.source,
    holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
    lines: rows.map((r) => ({ id: r.item.id, label: describeLine(r), status: r.item.status, priceCents: r.item.priceCents })),
    totalCents: total,
    balanceCents: balance,
    latestPayment: pays[0] ? { status: pays[0].status, failureReason: pays[0].failureReason, provider: pays[0].provider } : null,
  };
}

/* ───────────────────────── Public waitlist ───────────────────────── */

export async function joinPublicWaitlist(
  db: DB,
  input: { signedIn?: GuardianContext | null; guardian: { firstName: string; lastName: string; email: string }; child: { existingId?: string | null; firstName: string; birthDate: string }; sessionId: string; baseUrl: string },
): Promise<{ ok: true } | { ok: false; code: string; error: string; devLink?: string }> {
  try {
    let familyId: string;
    let actor: Actor;
    if (input.signedIn) {
      familyId = input.signedIn.familyId;
      actor = guardianActor(input.signedIn);
    } else {
      const email = input.guardian.email.trim().toLowerCase();
      if (await findGuardianByEmail(db, email)) {
        const { devLink } = await requestMagicLink(db, email, input.baseUrl);
        return { ok: false, code: "sign_in_required", error: "This email is already part of a Yalla family. We’ve sent a sign-in link — join the waitlist once you’re signed in.", devLink };
      }
      const created = await createFamily(db, PUBLIC, { guardian: { firstName: input.guardian.firstName, lastName: input.guardian.lastName, email } });
      familyId = created.family.id;
      actor = guardianActor({ guardianId: created.guardian.id, firstName: created.guardian.firstName, lastName: created.guardian.lastName });
    }
    let childId = input.child.existingId ?? null;
    if (childId) {
      const [c] = await db.select().from(children).where(and(eq(children.id, childId), eq(children.familyId, familyId)));
      if (!c) throw new OpsError("invalid", "That child isn’t part of your family.");
    } else {
      const { child } = await addChild(db, actor, familyId, { firstName: input.child.firstName, lastName: input.guardian.lastName, birthDate: input.child.birthDate });
      childId = child.id;
    }
    await joinWaitlist(db, actor, { familyId, sessionId: input.sessionId, childIds: [childId] });
    return { ok: true };
  } catch (e) {
    if (e instanceof OpsError) return { ok: false, code: e.code, error: e.message };
    throw e;
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
  const mapItem = (x: (typeof items)[number]) => {
    const deadline = x.p.cancellationDeadlineHours;
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
      endsAt: x.s.endsAt.toISOString(),
      child: x.i.childId ? (childName.get(x.i.childId) ?? "") : "",
      canCancel: x.i.status === "confirmed" && deadline != null && hoursAhead >= deadline,
      cancelNote: deadline == null ? "To change this booking, please contact Yalla." : hoursAhead < deadline ? `Changes close ${deadline} hours before the start. Please contact Yalla.` : `Free to cancel until ${deadline} hours before.`,
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

export async function familyCancelItem(db: DB, g: GuardianContext, itemId: string) {
  const [x] = await db
    .select({ i: bookingItems, b: bookings, s: sessions, p: programs })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .innerJoin(sessions, eq(sessions.id, bookingItems.sessionId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(eq(bookingItems.id, itemId));
  if (!x || x.b.familyId !== g.familyId) throw new OpsError("not_found", "Booking not found.");
  if (!g.canBook) throw new OpsError("forbidden", "Your account can’t change bookings.");
  const deadline = x.p.cancellationDeadlineHours;
  if (deadline == null) throw new OpsError("contact", "This booking can’t be cancelled online. Please contact Yalla.");
  if ((x.s.startsAt.getTime() - Date.now()) / 3600_000 < deadline) throw new OpsError("deadline", `Online cancellation closed ${deadline} hours before the start. Please contact Yalla.`);
  await cancelBooking(db, guardianActor(g), { bookingId: x.b.id, itemIds: [itemId], reason: "Cancelled by family in the portal", notify: true });
}

export async function familySignForm(db: Executor, g: GuardianContext, input: { templateId: string; childId: string | null; signatureText: string; consent: boolean; ip?: string; userAgent?: string }) {
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
    data: t.requiresSignature ? undefined : { confirmed: true },
    ip: input.ip,
    userAgent: input.userAgent,
  });
}

