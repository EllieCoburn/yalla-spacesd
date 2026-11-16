/**
 * Family Portal accounts.
 *
 * - There's no open sign-up. A family gets in by booking and paying on the website (they can open
 *   the portal straight from their confirmation page, and are emailed a link to confirm their email
 *   and choose a password), or by an invitation from the Yalla team (which proves the email; they
 *   add at least one child and a password, and are signed in straight away).
 * - Sessions last up to 30 days on that browser (7 days without use), and can be revoked.
 * - Emailed links (single use, 20 minutes, stored only as hashes) are used to set a password for
 *   an email Yalla already has (e.g. from an earlier booking) and to reset a forgotten password.
 * - Repeated wrong passwords lock that account for 15 minutes.
 * What a guardian can see follows their own flags (billing, sensitive care information).
 * Cookie handling lives in app/(site)/portal/session.ts.
 */
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { audit, OpsError, type Actor } from "@/lib/audit";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/auth/crypto";
import { addChild, createFamily } from "@/lib/ops/families";
import type { DB, Executor } from "@/lib/db";
import { bookings, children, families, familyAuthTokens, familyInvites, familySessions, guardians, messages, playPassSubscriptions } from "@/lib/db/schema";
import { validLinkKey } from "@/lib/links";
import { notificationsMode, notifyFamily, notifyStaff } from "@/lib/notify";
import { staffRecipients } from "@/lib/ops/enquiries";
import { fmtDate } from "@/lib/time";
import { allow } from "@/lib/rate-limit";

export const FAMILY_LINK_MS = 20 * 60 * 1000;
/** A family stays signed in on a browser for up to 30 days, and is signed out after 7 days unused. */
export const FAMILY_SESSION_MS = 30 * 24 * 3600 * 1000;
export const FAMILY_IDLE_MS = 7 * 24 * 3600 * 1000;
const LOCK_AFTER = 8;
const LOCK_MS = 15 * 60 * 1000;

export type GuardianContext = {
  sessionId: string;
  guardianId: string;
  familyId: string;
  familyName: string;
  firstName: string;
  lastName: string;
  email: string;
  canBook: boolean;
  canViewBilling: boolean;
  canViewSensitive: boolean;
  /** Has confirmed their email (by invitation or the confirmation email). */
  emailVerified: boolean;
  hasPassword: boolean;
};

/**
 * Sends a sign-in link if the email belongs to a guardian with portal access. The return value is
 * the same either way (so the form never reveals whether an email exists); `devLink` is only set
 * in local development while emails are captured instead of sent.
 */
/** Where a sign-in link may send the family afterwards (same-site pages only). */
export const safeNextPath = (n: unknown, fallback = "/portal/home") => (typeof n === "string" && /^\/(book|portal|play-passes)(\/|$|\?)/.test(n) && !n.startsWith("//") ? n : fallback);

export async function requestMagicLink(db: Executor, email: string, baseUrl: string, next?: string): Promise<{ devLink?: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(clean)) return {};
  // A few links an hour per email at most, so nobody can flood a family's inbox.
  if (!(await allow(db, "signInLinkEmail", clean))) return {};
  const [g] = await db
    .select()
    .from(guardians)
    .innerJoin(families, eq(families.id, guardians.familyId))
    .where(and(sql`lower(${guardians.email}) = ${clean}`, eq(guardians.portalAccess, true), eq(families.status, "active")));
  if (!g) return {};
  const token = randomToken();
  await db.insert(familyAuthTokens).values({ guardianId: g.guardians.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + FAMILY_LINK_MS) });
  const after = next ? safeNextPath(next, "") : "";
  const link = `${baseUrl}/portal/verify?token=${token}${after ? `&next=${encodeURIComponent(after)}` : ""}`;
  await notifyFamily(db, { key: "family_sign_in", familyId: g.guardians.familyId, guardianIds: [g.guardians.id], vars: { link }, related: { type: "guardian", id: g.guardians.id } });
  return notificationsMode() === "test" && process.env.NODE_ENV !== "production" ? { devLink: link } : {};
}

/** Exchanges a link for a session. Returns the session token, or null if invalid/expired/used. */
export async function redeemMagicLink(db: Executor, token: string): Promise<string | null> {
  return (await redeemFamilyLink(db, token))?.session ?? null;
}

/** Like redeemMagicLink, and says which kind of link it was (a confirmation link also confirms the email). */
export async function redeemFamilyLink(db: Executor, token: string): Promise<{ session: string; purpose: string } | null> {
  const [t] = await db
    .update(familyAuthTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(familyAuthTokens.tokenHash, sha256(token)), isNull(familyAuthTokens.usedAt), gt(familyAuthTokens.expiresAt, new Date())))
    .returning();
  if (!t) return null;
  const [g] = await db.select().from(guardians).where(eq(guardians.id, t.guardianId));
  if (!g?.portalAccess) return null;
  if (t.purpose === "confirm_email" && !g.emailVerifiedAt) await db.update(guardians).set({ emailVerifiedAt: new Date() }).where(eq(guardians.id, g.id));
  const session = randomToken();
  await db.insert(familySessions).values({ guardianId: g.id, tokenHash: sha256(session), expiresAt: new Date(Date.now() + FAMILY_SESSION_MS) });
  await audit(db, { type: "family", id: g.id, name: `${g.firstName} ${g.lastName}` }, { action: "family.sign_in", entityType: "family", entityId: g.familyId, summary: t.purpose === "confirm_email" ? "Confirmed their email and signed in" : "Signed in to the Family Portal" });
  return { session, purpose: t.purpose };
}

export async function resolveFamilySession(db: Executor, token: string | null | undefined): Promise<GuardianContext | null> {
  if (!token) return null;
  const [row] = await db
    .select({ s: familySessions, g: guardians, f: families })
    .from(familySessions)
    .innerJoin(guardians, eq(guardians.id, familySessions.guardianId))
    .innerJoin(families, eq(families.id, guardians.familyId))
    .where(and(eq(familySessions.tokenHash, sha256(token)), isNull(familySessions.revokedAt), gt(familySessions.expiresAt, new Date())));
  if (!row || !row.g.portalAccess || row.f.status !== "active") return null;
  if (Date.now() - row.s.lastSeenAt.getTime() > FAMILY_IDLE_MS) return null;
  // Also caps sessions issued before the 30-day limit (they were given a year).
  if (Date.now() - row.s.createdAt.getTime() > FAMILY_SESSION_MS) return null;
  if (Date.now() - row.s.lastSeenAt.getTime() > 60_000) await db.update(familySessions).set({ lastSeenAt: new Date() }).where(eq(familySessions.id, row.s.id));
  return {
    sessionId: row.s.id,
    guardianId: row.g.id,
    familyId: row.g.familyId,
    familyName: row.f.name,
    firstName: row.g.firstName,
    lastName: row.g.lastName,
    email: row.g.email,
    canBook: row.g.canBook,
    canViewBilling: row.g.canViewBilling,
    canViewSensitive: row.g.canViewSensitive,
    emailVerified: !!row.g.emailVerifiedAt,
    hasPassword: !!row.g.passwordHash,
  };
}

export async function revokeFamilySession(db: Executor, sessionId: string) {
  await db.update(familySessions).set({ revokedAt: new Date() }).where(eq(familySessions.id, sessionId));
}

export const guardianActor = (g: Pick<GuardianContext, "guardianId" | "firstName" | "lastName">) => ({ type: "family" as const, id: g.guardianId, name: `${g.firstName} ${g.lastName}` });

/* ───────────────────────── Passwords ───────────────────────── */

const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwertyuiop", "iloveyou", "yallayalla", "letmein123"]);

export function familyPasswordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters for your password.";
  if (password.length > 200) return "That password is too long.";
  if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) return "Choose a less common password.";
  return null;
}

async function startSession(db: Executor, guardianId: string) {
  const session = randomToken();
  await db.insert(familySessions).values({ guardianId, tokenHash: sha256(session), expiresAt: new Date(Date.now() + FAMILY_SESSION_MS) });
  return session;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type NewAccount = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  children: { firstName: string; lastName?: string; birthDate: string }[];
};

/** How long an invitation to create an account works. */
export const FAMILY_INVITE_MS = 14 * 24 * 3600 * 1000;
/** How long the "confirm your email" link (sent after a first booking) works. */
export const FAMILY_CONFIRM_MS = 7 * 24 * 3600 * 1000;
/** How long after booking a new family can open their portal straight from the confirmation page. */
export const PORTAL_CLAIM_WINDOW_MS = 48 * 3600 * 1000;

/**
 * Who can have a Family Portal account: families who book and pay through the website (the payment
 * is their way in), and families Yalla invites (e.g. after a tour request). There's no open sign-up.
 */

type Invite = typeof familyInvites.$inferSelect;

async function validInvite(db: Executor, token: string): Promise<Invite | null> {
  if (!token) return null;
  const [inv] = await db
    .select()
    .from(familyInvites)
    .where(and(eq(familyInvites.tokenHash, sha256(token)), isNull(familyInvites.usedAt), gt(familyInvites.expiresAt, new Date())));
  return inv ?? null;
}

/** What the join page shows for an invitation link (or null if it's invalid, used or expired). */
export async function inviteDetails(db: Executor, token: string) {
  const inv = await validInvite(db, token);
  if (!inv) return null;
  const [g] = inv.guardianId ? await db.select().from(guardians).where(eq(guardians.id, inv.guardianId)) : [];
  const kids = g ? await db.select({ id: children.id }).from(children).where(eq(children.familyId, g.familyId)) : [];
  const [first, ...rest] = (inv.name ?? "").trim().split(/\s+/);
  return { email: inv.email, firstName: g?.firstName ?? first ?? "", lastName: g?.lastName ?? rest.join(" "), existing: !!g, hasChildren: kids.length > 0 };
}

/**
 * Invite someone to create a Family Portal account (Admin → Inbox or a family's page). The email
 * carries a link that works once, for 14 days. Inviting again replaces an earlier, unused invitation.
 */
export async function inviteToPortal(db: DB, actor: Actor, input: { email: string; name?: string; enquiryId?: string | null }, baseUrl: string) {
  const { email, name, existing, link } = await createInvite(db, actor, input, baseUrl);
  await notifyStaff(db, { key: "family_invite", to: email, vars: { name: name.split(" ")[0] || "there", link }, relatedType: "invite", relatedId: existing?.familyId });
  await audit(db, actor, { action: "family.invited", entityType: existing ? "family" : "enquiry", entityId: existing?.familyId ?? input.enquiryId ?? email, summary: `Invited ${email} to create a Family Portal account` });
  return { email, devLink: notificationsMode() === "test" && process.env.NODE_ENV !== "production" ? link : undefined };
}

/** Makes a single-use invitation link (replacing any unused one for that email); doesn't send it. */
async function createInvite(db: Executor, actor: Actor, input: { email: string; name?: string; enquiryId?: string | null; ttlMs?: number }, baseUrl: string) {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new OpsError("invalid", "That email address doesn’t look right.");
  const [existing] = await db.select().from(guardians).where(sql`lower(${guardians.email}) = ${email}`);
  if (existing?.passwordHash && existing.portalAccess) throw new OpsError("exists", "This family already has a Family Portal account.");
  await db.delete(familyInvites).where(and(eq(familyInvites.email, email), isNull(familyInvites.usedAt)));
  const token = randomToken();
  const name = input.name?.trim() || (existing ? `${existing.firstName} ${existing.lastName}` : "");
  await db.insert(familyInvites).values({ tokenHash: sha256(token), email, name: name || null, guardianId: existing?.id ?? null, enquiryId: input.enquiryId ?? null, invitedBy: actor.name, expiresAt: new Date(Date.now() + (input.ttlMs ?? FAMILY_INVITE_MS)) });
  return { email, name, existing, link: `${baseUrl}/portal/join?invite=${token}` };
}

/**
 * The email for a booking the team made for a family (by email or in person). A family already in
 * the Family Portal gets a short confirmation pointing to it; a family new to the portal gets a
 * welcome with a link to set up their account (it works once, for 30 days). The portal doesn't
 * open by itself: they set up their account from the link.
 */
export async function sendTeamBookingEmail(db: DB, actor: Actor, input: { familyId: string; bookingId: string; vars: Record<string, string> }, baseUrl: string) {
  const [g] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, input.familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  if (!g) return;
  const related = { type: "booking", id: input.bookingId };
  if (g.portalAccess || g.passwordHash) {
    await notifyFamily(db, { key: "booking_confirmed_team", familyId: input.familyId, vars: { ...input.vars, portal_link: `${baseUrl}/portal/home?tab=bookings` }, related });
    return;
  }
  const inv = await createInvite(db, actor, { email: g.email, name: `${g.firstName} ${g.lastName}`, ttlMs: 30 * 24 * 3600 * 1000 }, baseUrl);
  await notifyFamily(db, { key: "booking_welcome_team", familyId: input.familyId, guardianIds: [g.id], vars: { ...input.vars, link: inv.link }, related });
  await audit(db, actor, { action: "family.invited", entityType: "family", entityId: input.familyId, summary: `Sent ${g.email} a welcome with a link to set up their Family Portal (booking made by the team)` });
  return { devLink: notificationsMode() === "test" && process.env.NODE_ENV !== "production" ? inv.link : undefined };
}

/** For Admin: whether each email already has a portal account, or an invitation out (and when). */
export async function portalStatusByEmail(db: Executor, emails: string[]) {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, { account: boolean; invitedAt?: Date; inviteExpired?: boolean }>();
  if (!list.length) return out;
  const gs = await db
    .select({ email: guardians.email, passwordHash: guardians.passwordHash, portalAccess: guardians.portalAccess, verified: guardians.emailVerifiedAt })
    .from(guardians)
    .where(inArray(sql`lower(${guardians.email})`, list));
  for (const g of gs) if (g.portalAccess && (g.passwordHash || g.verified)) out.set(g.email.toLowerCase(), { account: true });
  const invs = await db.select().from(familyInvites).where(inArray(familyInvites.email, list)).orderBy(desc(familyInvites.createdAt));
  for (const i of invs) if (!out.has(i.email)) out.set(i.email, { account: !!i.usedAt, invitedAt: i.createdAt, inviteExpired: !i.usedAt && i.expiresAt < new Date() });
  return out;
}

/**
 * Create a Family Portal account from an invitation, and sign in straight away (the invitation link
 * proves the email address). At least one child with first and last name and date of birth is
 * required, unless the family is already on file with children.
 */
export async function registerFamilyAccount(db: DB, input: NewAccount & { inviteToken: string }, baseUrl: string): Promise<{ session: string }> {
  const inv = await validInvite(db, input.inviteToken);
  if (!inv) throw new OpsError("invite", "This invitation has expired or was already used. Please ask Yalla for a new one, or sign in if you already have an account.");
  if (!input.firstName.trim() || !input.lastName.trim()) throw new OpsError("invalid", "Enter your first and last name.");
  const problem = familyPasswordProblem(input.password);
  if (problem) throw new OpsError("invalid", problem);
  const kids = input.children.filter((c) => c.firstName.trim() || c.lastName?.trim() || c.birthDate);
  const today = new Date().toISOString().slice(0, 10);
  for (const c of kids) {
    if (!c.firstName.trim() || !c.lastName?.trim() || !DATE.test(c.birthDate)) throw new OpsError("invalid", "Add each child’s first name, last name and date of birth.");
    if (c.birthDate > today) throw new OpsError("invalid", `${c.firstName.trim()}’s date of birth is in the future.`);
  }

  const created = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(familyInvites).set({ usedAt: new Date() }).where(and(eq(familyInvites.id, inv.id), isNull(familyInvites.usedAt))).returning();
    if (!claimed) throw new OpsError("invite", "This invitation was already used.");
    const actor = { type: "system" as const, name: "Family Portal invitation" };
    let guardian: typeof guardians.$inferSelect;
    let familyId: string;
    let isNew = false;
    const [existing] = inv.guardianId ? await tx.select().from(guardians).where(eq(guardians.id, inv.guardianId)) : await tx.select().from(guardians).where(sql`lower(${guardians.email}) = ${inv.email}`);
    if (existing) {
      if (existing.passwordHash && existing.portalAccess) throw new OpsError("exists", "There’s already an account with this email. Sign in instead, or reset your password.");
      guardian = existing;
      familyId = existing.familyId;
      const [have] = await tx.select({ id: children.id }).from(children).where(eq(children.familyId, familyId)).limit(1);
      if (!have && !kids.length) throw new OpsError("invalid", "Add at least one child with their first name, last name and date of birth.");
    } else {
      if (!kids.length) throw new OpsError("invalid", "Add at least one child with their first name, last name and date of birth.");
      const made = await createFamily(tx, actor, { guardian: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: inv.email } });
      guardian = made.guardian;
      familyId = made.family.id;
      isNew = true;
    }
    await tx.update(guardians).set({ passwordHash: hashPassword(input.password), portalAccess: true, emailVerifiedAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(guardians.id, guardian.id));
    for (const c of kids)
      await addChild(tx, { type: "family", id: guardian.id, name: `${guardian.firstName} ${guardian.lastName}` }, familyId, { firstName: c.firstName.trim(), lastName: c.lastName!.trim(), birthDate: c.birthDate });
    await audit(tx, { type: "family", id: guardian.id, name: `${guardian.firstName} ${guardian.lastName}` }, { action: "family.account_created", entityType: "family", entityId: familyId, summary: `Created a Family Portal account from an invitation${kids.length ? ` with ${kids.length} ${kids.length === 1 ? "child" : "children"}` : ""}` });
    return { session: await startSession(tx, guardian.id), familyId, guardianId: guardian.id, guardian, isNew };
  });

  await announceNewMember(db, { familyId: created.familyId, guardianId: created.guardianId, baseUrl, via: "Invitation from Yalla" });
  return { session: created.session };
}

/** Welcome email to the family and "joined the portal" notice to the team. Never blocks anything. */
async function announceNewMember(db: DB, input: { familyId: string; guardianId: string; baseUrl: string; welcome?: boolean; via: string }) {
  const [g] = await db.select().from(guardians).where(eq(guardians.id, input.guardianId));
  const kids = await db.select().from(children).where(eq(children.familyId, input.familyId));
  if (input.welcome !== false)
    await notifyFamily(db, { key: "family_welcome", familyId: input.familyId, guardianIds: [input.guardianId], vars: { portal_link: `${input.baseUrl}/portal/home` }, related: { type: "guardian", id: input.guardianId } }).catch((e) =>
    console.error("[welcome email failed]", (e as Error).message?.slice(0, 120)),
  );
  const details = [
    `Joined: ${input.via}`,
    `Parent: ${g.firstName} ${g.lastName}`,
    `Email: ${g.email}`,
    ...(kids.length ? kids.map((c, i) => `${kids.length > 1 ? `Child ${i + 1}` : "Child"}: ${c.firstName}, born ${fmtDate(c.birthDate, "MMM d, yyyy")}`) : ["Children: none added yet"]),
  ].join("\n");
  for (const to of await staffRecipients(db).catch(() => [] as string[]))
    await notifyStaff(db, { key: "staff_family_joined", to, vars: { family_name: g.lastName.trim(), details, link: `${input.baseUrl}/admin/families/${input.familyId}` }, relatedId: input.familyId }).catch((e) =>
      console.error("[family joined email failed]", (e as Error).message?.slice(0, 120)),
    );
}

/**
 * After a family's purchase on the website goes through (a booking, or a Play Pass), they're a client,
 * so the primary guardian gets portal access. A family seeing this for the first time is welcomed and
 * asked to confirm their email (which also lets them sign in anytime); nothing waits on them doing so.
 */
export async function welcomeNewClient(db: DB, familyId: string, baseUrl: string, via: "booking" | "playpass" = "booking") {
  const [g] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  if (!g) return;
  if (!g.portalAccess) await db.update(guardians).set({ portalAccess: true }).where(eq(guardians.id, g.id));
  if (g.passwordHash || g.emailVerifiedAt) return;
  const [sent] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.templateKey, "family_confirm_email"), eq(messages.relatedId, g.id)))
    .limit(1);
  if (sent) return;
  await sendEmailConfirmation(db, g.id, baseUrl, via === "playpass" ? "Your Play Pass is active" : "Your booking is confirmed");
  // The confirmation email doubles as their welcome, so no separate welcome email.
  await announceNewMember(db, { familyId, guardianId: g.id, baseUrl, welcome: false, via: via === "playpass" ? "Play Pass bought on the website" : "First booking on the website" });
}

/** Sends (or re-sends) the "confirm your email" link; using it confirms the address and signs in. */
export async function sendEmailConfirmation(db: DB, guardianId: string, baseUrl: string, purchaseSummary = "Your booking is confirmed") {
  const [g] = await db.select().from(guardians).where(eq(guardians.id, guardianId));
  if (!g || g.emailVerifiedAt) return {};
  const token = randomToken();
  await db.insert(familyAuthTokens).values({ guardianId: g.id, tokenHash: sha256(token), purpose: "confirm_email", expiresAt: new Date(Date.now() + FAMILY_CONFIRM_MS) });
  const link = `${baseUrl}/portal/verify?token=${token}&next=${encodeURIComponent("/portal/home?welcome=confirmed")}`;
  await notifyFamily(db, { key: "family_confirm_email", familyId: g.familyId, guardianIds: [g.id], vars: { link, purchase_summary: purchaseSummary }, related: { type: "guardian", id: g.id } });
  return { devLink: notificationsMode() === "test" && process.env.NODE_ENV !== "production" ? link : undefined };
}

/**
 * Whether the primary guardian of a family that's brand new with this purchase can open their portal
 * straight from the purchase's confirmation page: they haven't set a password or opened it this way
 * before, and the family has no earlier confirmed booking or Play Pass. A family already on file
 * opens the portal from the confirmation email instead, which proves the email.
 */
async function newClientGuardian(db: Executor, familyId: string, purchasedAt: Date, except: { bookingId?: string; subscriptionId?: string }) {
  if (Date.now() - purchasedAt.getTime() > PORTAL_CLAIM_WINDOW_MS) return null;
  const [g] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.familyId, familyId), eq(guardians.isPrimary, true)))
    .limit(1);
  if (!g || !g.portalAccess || g.passwordHash || g.portalClaimedAt) return null;
  const [f] = await db.select().from(families).where(eq(families.id, familyId));
  if (!f || purchasedAt.getTime() - f.createdAt.getTime() > PORTAL_CLAIM_WINDOW_MS) return null;
  const [otherBooking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.familyId, familyId), eq(bookings.status, "confirmed"), except.bookingId ? ne(bookings.id, except.bookingId) : undefined))
    .limit(1);
  if (otherBooking) return null;
  const [otherPass] = await db
    .select({ id: playPassSubscriptions.id })
    .from(playPassSubscriptions)
    .where(and(eq(playPassSubscriptions.familyId, familyId), ne(playPassSubscriptions.status, "pending"), ne(playPassSubscriptions.status, "abandoned"), except.subscriptionId ? ne(playPassSubscriptions.id, except.subscriptionId) : undefined))
    .limit(1);
  if (otherPass) return null;
  return { guardianId: g.id, firstName: g.firstName };
}

/** For a booking's confirmation page (holding its private link): can a new family open their portal? */
export async function portalClaimFor(db: Executor, reference: string, key: string | null | undefined) {
  if (!validLinkKey("booking", reference, key)) return null;
  const [b] = await db.select().from(bookings).where(eq(bookings.reference, reference));
  if (!b || b.status !== "confirmed" || b.source === "admin") return null;
  return newClientGuardian(db, b.familyId, b.createdAt, { bookingId: b.id });
}

/** For the Play Pass welcome page (holding its private link): can a new member open their portal? */
export async function portalClaimForPass(db: Executor, subscriptionId: string, key: string | null | undefined) {
  if (!validLinkKey("playpass", subscriptionId, key)) return null;
  const [sub] = await db.select().from(playPassSubscriptions).where(eq(playPassSubscriptions.id, subscriptionId));
  if (!sub || sub.status !== "active") return null;
  return newClientGuardian(db, sub.familyId, sub.createdAt, { subscriptionId: sub.id });
}

/** Opens a new family's portal from their purchase confirmation (once), and signs them in. */
export async function claimPortal(db: DB, what: { booking?: string; playPass?: string }, key: string | null | undefined): Promise<string | null> {
  const c = what.booking ? await portalClaimFor(db, what.booking, key) : what.playPass ? await portalClaimForPass(db, what.playPass, key) : null;
  if (!c) return null;
  const [g] = await db.update(guardians).set({ portalClaimedAt: new Date() }).where(and(eq(guardians.id, c.guardianId), isNull(guardians.portalClaimedAt))).returning();
  if (!g) return null;
  await audit(db, { type: "family", id: g.id, name: `${g.firstName} ${g.lastName}` }, { action: "family.sign_in", entityType: "family", entityId: g.familyId, summary: `Opened their new Family Portal from their ${what.booking ? "booking confirmation" : "Play Pass welcome page"}` });
  return startSession(db, g.id);
}

export const claimPortalFromBooking = (db: DB, reference: string, key: string | null | undefined) => claimPortal(db, { booking: reference }, key);

/**
 * Sign in with email and password. A guardian who has never set a password is emailed a link to
 * set one. Wrong passwords count toward a short lockout; the message never says which part was wrong.
 */
export async function signInWithPassword(db: Executor, input: { email: string; password: string; baseUrl: string; ip?: string }): Promise<{ session: string } | { emailed: true; devLink?: string }> {
  const email = input.email.trim().toLowerCase();
  const wrong = new OpsError("invalid", "That email and password don’t match. Try again, or reset your password.");
  const [row] = await db
    .select({ g: guardians, f: families })
    .from(guardians)
    .innerJoin(families, eq(families.id, guardians.familyId))
    .where(sql`lower(${guardians.email}) = ${email}`);
  if (!row || !row.g.portalAccess || row.f.status !== "active") {
    verifyPassword(input.password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86)); // even out timing
    throw wrong;
  }
  const g = row.g;
  if (g.lockedUntil && g.lockedUntil > new Date()) throw new OpsError("locked", "Too many attempts. Please wait 15 minutes, or reset your password.");
  if (!g.passwordHash) {
    const { devLink } = await requestMagicLink(db, email, input.baseUrl, "/portal/account?welcome=1");
    return { emailed: true, devLink };
  }
  if (!verifyPassword(input.password, g.passwordHash)) {
    const failed = g.failedLogins + 1;
    await db.update(guardians).set({ failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null }).where(eq(guardians.id, g.id));
    if (failed >= LOCK_AFTER) await audit(db, { type: "system", name: "System" }, { action: "family.locked", entityType: "family", entityId: g.familyId, summary: `Portal sign-in paused for ${g.email} after ${failed} wrong passwords`, ip: input.ip });
    throw wrong;
  }
  await db.update(guardians).set({ failedLogins: 0, lockedUntil: null }).where(eq(guardians.id, g.id));
  await audit(db, { type: "family", id: g.id, name: `${g.firstName} ${g.lastName}` }, { action: "family.sign_in", entityType: "family", entityId: g.familyId, summary: "Signed in to the Family Portal", ip: input.ip });
  return { session: await startSession(db, g.id) };
}

/** Set or change the signed-in guardian's password (they're already verified by their session). */
export async function setFamilyPassword(db: Executor, g: GuardianContext, password: string) {
  const problem = familyPasswordProblem(password);
  if (problem) throw new OpsError("invalid", problem);
  await db.update(guardians).set({ passwordHash: hashPassword(password), failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(guardians.id, g.guardianId));
  // A new password signs out every other device.
  await revokeOtherFamilySessions(db, g.guardianId, g.sessionId);
  await audit(db, { type: "family", id: g.guardianId, name: `${g.firstName} ${g.lastName}` }, { action: "family.password_set", entityType: "family", entityId: g.familyId, summary: "Set a Family Portal password; other devices signed out" });
}

/** Signs a guardian out everywhere except (optionally) the current session. */
export async function revokeOtherFamilySessions(db: Executor, guardianId: string, exceptSessionId?: string) {
  await db
    .update(familySessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(familySessions.guardianId, guardianId), isNull(familySessions.revokedAt), exceptSessionId ? sql`${familySessions.id} <> ${exceptSessionId}` : undefined));
}

export async function hasPassword(db: Executor, guardianId: string) {
  const [g] = await db.select({ h: guardians.passwordHash }).from(guardians).where(eq(guardians.id, guardianId));
  return !!g?.h;
}
