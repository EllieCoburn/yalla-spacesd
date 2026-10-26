/**
 * Yalla operations database (Postgres).
 *
 * Conventions
 * - Text ids (UUIDs) generated in the app; money in integer cents; times as timestamptz (UTC).
 * - Local operating dates (America/Los_Angeles) are stored separately as `date` where they matter.
 * - Statuses that mean different things stay in different columns: booking status, attendance,
 *   payment and paperwork are never folded together.
 * - Records with bookings, payments or signed paperwork are archived, not deleted.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").defaultNow().notNull();
const updatedAt = () => ts("updated_at").defaultNow().notNull();

/* ───────────────────────── Staff, roles & sessions ───────────────────────── */

export const roles = pgTable("roles", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const staffUsers = pgTable("staff_users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
  status: text("status").notNull().default("active"), // active | disabled
  mfaSecretEnc: text("mfa_secret_enc"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: id(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("staff_sessions_staff_idx").on(t.staffId)],
);

/** Password reset & staff invitation tokens (stored hashed). */
export const authTokens = pgTable("auth_tokens", {
  id: id(),
  staffId: text("staff_id")
    .notNull()
    .references(() => staffUsers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // password_reset | invite
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    at: ts("at").defaultNow().notNull(),
    actorType: text("actor_type").notNull(), // staff | family | system | webhook
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(), // e.g. booking.cancel
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    /** Field-level before/after with sensitive values redacted. */
    changes: jsonb("changes"),
    ip: text("ip"),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_at_idx").on(t.at)],
);

/* ───────────────────────── Settings, locations, cohorts ───────────────────────── */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
  updatedBy: text("updated_by"),
});

export const locations = pgTable("locations", {
  id: id(),
  name: text("name").notNull(),
  address: text("address"),
  arrivalInstructions: text("arrival_instructions"),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const cohorts = pgTable("cohorts", {
  id: id(),
  name: text("name").notNull(),
  minAgeMonths: integer("min_age_months"),
  maxAgeMonths: integer("max_age_months"),
  ratio: text("ratio"),
  maxSize: integer("max_size"),
  locationId: text("location_id").references(() => locations.id),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

/** Shared capacity across programs using the same room or staffing. */
export const capacityPools = pgTable("capacity_pools", {
  id: id(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  locationId: text("location_id").references(() => locations.id),
  description: text("description"),
  createdAt: createdAt(),
});

/* ───────────────────────── Programs ───────────────────────── */

export const programs = pgTable("programs", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // membership | drop_in | nature | camp | weekend | happening | parents_night | private_event
  tagline: text("tagline"),
  description: text("description"),
  imageUrl: text("image_url"),
  locationId: text("location_id").references(() => locations.id),
  arrivalInstructions: text("arrival_instructions"),
  minAgeMonths: integer("min_age_months"),
  maxAgeMonths: integer("max_age_months"),
  parentPresence: text("parent_presence").notNull().default("not_required"), // required | optional | not_required
  bookingUnit: text("booking_unit").notNull().default("per_child"), // per_child | per_family | per_adult | private_event
  bookingMode: text("booking_mode").notNull().default("instant"), // instant | request | enroll | inquire
  seriesMode: text("series_mode").notNull().default("individual"), // individual | full_series | either
  status: text("status").notNull().default("draft"), // draft | published | paused | archived
  defaultCapacity: integer("default_capacity"),
  showRemaining: boolean("show_remaining").notNull().default(true),
  lowAvailabilityThreshold: integer("low_availability_threshold").notNull().default(2),
  waitlistEnabled: boolean("waitlist_enabled").notNull().default(true),
  waitlistAutoOffer: boolean("waitlist_auto_offer").notNull().default(false),
  offerWindowHours: integer("offer_window_hours").notNull().default(24),
  /** How far ahead families may book (days). null = no limit. */
  advanceBookingDays: integer("advance_booking_days"),
  minNoticeHours: integer("min_notice_hours").notNull().default(0),
  cancellationDeadlineHours: integer("cancellation_deadline_hours"),
  priceCents: integer("price_cents"),
  priceUnit: text("price_unit").notNull().default("session"), // session | series | hour | month | event
  depositCents: integer("deposit_cents"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: ts("archived_at"),
});

export const programCohorts = pgTable(
  "program_cohorts",
  {
    programId: text("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.programId, t.cohortId] })],
);

/** Price table entries (e.g. Club Yalla tuition by cohort/days, Flex rates by cohort). */
export const programPrices = pgTable("program_prices", {
  id: id(),
  programId: text("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  amountCents: integer("amount_cents").notNull(),
  unit: text("unit").notNull(), // session | month | series | event
  cohortId: text("cohort_id").references(() => cohorts.id),
  dayLength: text("day_length"), // full | half
  daysPerWeek: integer("days_per_week"),
  active: boolean("active").notNull().default(true),
});

/* ───────────────────────── Scheduling ───────────────────────── */

/** A repeating weekly schedule (or a camp's run of days) that generates sessions. */
export const scheduleSeries = pgTable("schedule_series", {
  id: id(),
  programId: text("program_id")
    .notNull()
    .references(() => programs.id),
  title: text("title"),
  weekdays: integer("weekdays").array().notNull(), // 0 = Sunday
  /** Monthly repeat: only the nth matching weekday of each month (1–4, or 5 = last). null = every week. */
  monthWeek: integer("month_week"),
  startTime: text("start_time").notNull(), // HH:MM local
  endTime: text("end_time").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  capacity: integer("capacity").notNull(),
  hardCapacity: integer("hard_capacity"),
  locationId: text("location_id").references(() => locations.id),
  cohortId: text("cohort_id").references(() => cohorts.id),
  capacityPoolId: text("capacity_pool_id").references(() => capacityPools.id),
  /** Age group for these sessions, overriding the program's age range (e.g. After Hours groups). */
  minAgeMonths: integer("min_age_months"),
  maxAgeMonths: integer("max_age_months"),
  /** Whole series must be booked together (e.g. a camp week). */
  bookAsSeries: boolean("book_as_series").notNull().default(false),
  priceCents: integer("price_cents"),
  bookingOpensAt: ts("booking_opens_at"),
  bookingClosesAt: ts("booking_closes_at"),
  createdAt: createdAt(),
  archivedAt: ts("archived_at"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    seriesId: text("series_id").references(() => scheduleSeries.id),
    title: text("title"),
    localDate: date("local_date").notNull(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    capacity: integer("capacity").notNull(),
    /** Licensing/staffing ceiling that even an authorized override cannot exceed. */
    hardCapacity: integer("hard_capacity"),
    reservedSpots: integer("reserved_spots").notNull().default(0),
    locationId: text("location_id").references(() => locations.id),
    cohortId: text("cohort_id").references(() => cohorts.id),
    capacityPoolId: text("capacity_pool_id").references(() => capacityPools.id),
    /** Age group for this session, overriding the program's age range. */
    minAgeMonths: integer("min_age_months"),
    maxAgeMonths: integer("max_age_months"),
    status: text("status").notNull().default("scheduled"), // scheduled | closed | cancelled
    /** Detached from its series: later "all"/"future" edits skip it. */
    isException: boolean("is_exception").notNull().default(false),
    priceCents: integer("price_cents"),
    bookingOpensAt: ts("booking_opens_at"),
    bookingClosesAt: ts("booking_closes_at"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("sessions_program_start_idx").on(t.programId, t.startsAt),
    index("sessions_date_idx").on(t.localDate),
    index("sessions_series_idx").on(t.seriesId),
  ],
);

export const blackoutDates = pgTable("blackout_dates", {
  id: id(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  locationId: text("location_id").references(() => locations.id),
  programId: text("program_id").references(() => programs.id),
  reason: text("reason").notNull(),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

/* ───────────────────────── Families & children ───────────────────────── */

export const families = pgTable("families", {
  id: id(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"), // active | archived
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  communicationPrefs: jsonb("communication_prefs").notNull().default({ email: true, sms: false }),
  providerCustomerId: text("provider_customer_id"),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: ts("archived_at"),
});

export const guardians = pgTable(
  "guardians",
  {
    id: id(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    relationship: text("relationship"),
    isPrimary: boolean("is_primary").notNull().default(false),
    canBook: boolean("can_book").notNull().default(true),
    canViewBilling: boolean("can_view_billing").notNull().default(false),
    canViewSensitive: boolean("can_view_sensitive").notNull().default(false),
    portalAccess: boolean("portal_access").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("guardians_email_idx").on(sql`lower(${t.email})`)],
);

export const children = pgTable(
  "children",
  {
    id: id(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    preferredName: text("preferred_name"),
    birthDate: date("birth_date").notNull(),
    cohortId: text("cohort_id").references(() => cohorts.id),
    /** Family-provided care information. */
    allergies: text("allergies"),
    medicalNotes: text("medical_notes"),
    careNotes: text("care_notes"),
    infoUpdatedAt: ts("info_updated_at"),
    infoUpdatedBy: text("info_updated_by"),
    /** Staff-only notes, gated by permission. */
    staffNotes: text("staff_notes"),
    staffNotesUpdatedAt: ts("staff_notes_updated_at"),
    staffNotesUpdatedBy: text("staff_notes_updated_by"),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [index("children_family_idx").on(t.familyId)],
);

export const emergencyContacts = pgTable("emergency_contacts", {
  id: id(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id),
  childId: text("child_id").references(() => children.id),
  name: text("name").notNull(),
  relationship: text("relationship"),
  phone: text("phone").notNull(),
  priority: integer("priority").notNull().default(1),
  updatedAt: updatedAt(),
});

export const authorizedPickups = pgTable("authorized_pickups", {
  id: id(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id),
  /** null = authorized for every child in the family. */
  childId: text("child_id").references(() => children.id),
  name: text("name").notNull(),
  relationship: text("relationship"),
  phone: text("phone"),
  /** A restricted person must NOT collect the child. */
  isRestricted: boolean("is_restricted").notNull().default(false),
  restrictionNote: text("restriction_note"),
  updatedAt: updatedAt(),
  updatedBy: text("updated_by"),
});

export const familyNotes = pgTable("family_notes", {
  id: id(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id),
  childId: text("child_id").references(() => children.id),
  bookingId: text("booking_id"),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("staff"), // staff | care
  authorId: text("author_id"),
  authorName: text("author_name"),
  createdAt: createdAt(),
});

/* ───────────────────────── Memberships (Club Yalla) ───────────────────────── */

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    childId: text("child_id")
      .notNull()
      .references(() => children.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => cohorts.id),
    weekdays: integer("weekdays").array().notNull(),
    dayLength: text("day_length").notNull().default("full"), // full | half
    earlyBird: boolean("early_bird").notNull().default(false),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    status: text("status").notNull().default("upcoming"), // upcoming | active | paused | ended
    priceCents: integer("price_cents").notNull(),
    billingFrequency: text("billing_frequency").notNull().default("monthly"), // monthly | weekly | term
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("memberships_cohort_idx").on(t.cohortId)],
);

export const membershipChanges = pgTable("membership_changes", {
  id: id(),
  membershipId: text("membership_id")
    .notNull()
    .references(() => memberships.id),
  effectiveOn: date("effective_on").notNull(),
  changes: jsonb("changes").notNull(),
  status: text("status").notNull().default("planned"), // planned | applied | cancelled
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

export const membershipExceptions = pgTable(
  "membership_exceptions",
  {
    id: id(),
    membershipId: text("membership_id")
      .notNull()
      .references(() => memberships.id),
    date: date("date").notNull(),
    kind: text("kind").notNull(), // absence | closure | pause | makeup
    /** Only true when the configured policy allows releasing the spot for resale. */
    releasesSpot: boolean("releases_spot").notNull().default(false),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_exception_day_idx").on(t.membershipId, t.date)],
);

/* ───────────────────────── Bookings ───────────────────────── */

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    reference: text("reference").notNull().unique(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    status: text("status").notNull(), // held | pending_payment | requested | confirmed | cancelled | expired | needs_attention
    source: text("source").notNull().default("public"), // public | admin | waitlist
    holdExpiresAt: ts("hold_expires_at"),
    createdByStaffId: text("created_by_staff_id"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("bookings_family_idx").on(t.familyId), index("bookings_status_idx").on(t.status)],
);

export const bookingItems = pgTable(
  "booking_items",
  {
    id: id(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    childId: text("child_id").references(() => children.id),
    adults: integer("adults").notNull().default(0),
    spots: integer("spots").notNull().default(1),
    status: text("status").notNull(), // held | confirmed | cancelled | moved
    attendance: text("attendance").notNull().default("expected"), // expected | present | absent | no_show | late_cancel
    priceCents: integer("price_cents"),
    /** Optional extras for this child on this day, e.g. Camp Yalla Early Bird or late stay (see lib/booking/addons.ts). */
    addons: text("addons").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [index("booking_items_session_idx").on(t.sessionId, t.status), index("booking_items_child_idx").on(t.childId)],
);

export const bookingEvents = pgTable(
  "booking_events",
  {
    id: id(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    at: ts("at").defaultNow().notNull(),
    actorName: text("actor_name"),
    type: text("type").notNull(),
    detail: jsonb("detail"),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId)],
);

/** Explicit, recorded capacity overrides (never past hard capacity). */
export const capacityOverrides = pgTable("capacity_overrides", {
  id: id(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  bookingId: text("booking_id").references(() => bookings.id),
  staffId: text("staff_id").notNull(),
  extraSpots: integer("extra_spots").notNull(),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    childId: text("child_id")
      .notNull()
      .references(() => children.id),
    bookingItemId: text("booking_item_id").references(() => bookingItems.id),
    membershipId: text("membership_id").references(() => memberships.id),
    status: text("status").notNull().default("expected"), // expected | checked_in | checked_out | absent
    checkedInAt: ts("checked_in_at"),
    checkedInBy: text("checked_in_by"),
    checkedOutAt: ts("checked_out_at"),
    checkedOutBy: text("checked_out_by"),
    collectedByPickupId: text("collected_by_pickup_id"),
    collectedByName: text("collected_by_name"),
    notes: text("notes"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("attendance_session_child_idx").on(t.sessionId, t.childId)],
);

/* ───────────────────────── Waitlist ───────────────────────── */

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: id(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    sessionId: text("session_id").references(() => sessions.id),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    childIds: text("child_ids").array().notNull().default(sql`'{}'::text[]`),
    partySize: integer("party_size").notNull().default(1),
    status: text("status").notNull().default("waiting"), // waiting | offered | accepted | expired | declined | removed
    offeredAt: ts("offered_at"),
    offerExpiresAt: ts("offer_expires_at"),
    offerBookingId: text("offer_booking_id"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("waitlist_session_idx").on(t.sessionId, t.status)],
);

/* ───────────────────────── Forms, waivers & documents ───────────────────────── */

export const formTemplates = pgTable("form_templates", {
  id: id(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("form"), // waiver | form | policy | upload
  description: text("description"),
  perChild: boolean("per_child").notNull().default(true),
  requiresSignature: boolean("requires_signature").notNull().default(false),
  frequency: text("frequency").notNull().default("once"), // once | periodic | per_booking
  validForMonths: integer("valid_for_months"),
  enforcement: text("enforcement").notNull().default("before_attendance"), // blocks_booking | before_attendance | informational
  currentVersionId: text("current_version_id"),
  status: text("status").notNull().default("active"), // active | archived
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Published versions are immutable. Edits create a new version. */
export const formVersions = pgTable(
  "form_versions",
  {
    id: id(),
    templateId: text("template_id")
      .notNull()
      .references(() => formTemplates.id),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    fields: jsonb("fields").notNull().default([]),
    contentHash: text("content_hash").notNull(),
    /** Whether families who signed an earlier version must sign again. */
    requiresResign: boolean("requires_resign").notNull().default(true),
    status: text("status").notNull().default("published"), // published | superseded
    publishedAt: ts("published_at").defaultNow().notNull(),
    publishedBy: text("published_by"),
  },
  (t) => [uniqueIndex("form_versions_template_version_idx").on(t.templateId, t.version)],
);

export const formRequirements = pgTable("form_requirements", {
  id: id(),
  templateId: text("template_id")
    .notNull()
    .references(() => formTemplates.id),
  scope: text("scope").notNull(), // all | program | membership | family | child | session
  programId: text("program_id").references(() => programs.id),
  familyId: text("family_id").references(() => families.id),
  childId: text("child_id").references(() => children.id),
  sessionId: text("session_id").references(() => sessions.id),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const documents = pgTable("documents", {
  id: id(),
  familyId: text("family_id").references(() => families.id),
  childId: text("child_id").references(() => children.id),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  uploadedBy: text("uploaded_by"),
  createdAt: createdAt(),
});

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: id(),
    templateId: text("template_id")
      .notNull()
      .references(() => formTemplates.id),
    versionId: text("version_id")
      .notNull()
      .references(() => formVersions.id),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    childId: text("child_id").references(() => children.id),
    bookingId: text("booking_id").references(() => bookings.id),
    status: text("status").notNull(), // submitted | signed | superseded | rejected
    data: jsonb("data"),
    /** Snapshot of the exact text signed. */
    versionBody: text("version_body").notNull(),
    contentHash: text("content_hash").notNull(),
    signerGuardianId: text("signer_guardian_id").references(() => guardians.id),
    signerName: text("signer_name"),
    signerRelationship: text("signer_relationship"),
    signatureText: text("signature_text"),
    signedAt: ts("signed_at"),
    signerIp: text("signer_ip"),
    signerUserAgent: text("signer_user_agent"),
    documentId: text("document_id").references(() => documents.id),
    expiresOn: date("expires_on"),
    recordedByStaffId: text("recorded_by_staff_id"),
    createdAt: createdAt(),
  },
  (t) => [index("form_submissions_family_idx").on(t.familyId), index("form_submissions_child_idx").on(t.childId)],
);

/* ───────────────────────── Billing ───────────────────────── */

export const discounts = pgTable("discounts", {
  id: id(),
  code: text("code").unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // percent | fixed
  value: integer("value").notNull(), // percent (0-100) or cents
  programId: text("program_id").references(() => programs.id),
  siblingDiscount: boolean("sibling_discount").notNull().default(false),
  active: boolean("active").notNull().default(true),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  maxUses: integer("max_uses"),
  createdAt: createdAt(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    number: text("number").notNull().unique(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    bookingId: text("booking_id").references(() => bookings.id),
    membershipId: text("membership_id").references(() => memberships.id),
    status: text("status").notNull().default("open"), // draft | open | paid | void | uncollectible
    description: text("description"),
    issuedAt: ts("issued_at").defaultNow().notNull(),
    dueOn: date("due_on"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("invoices_family_idx").on(t.familyId)],
);

/** Line items. Corrections are new "adjustment" lines — never edits to settled lines. */
export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  kind: text("kind").notNull(), // charge | discount | fee | tax | adjustment
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitCents: integer("unit_cents").notNull(),
  amountCents: integer("amount_cents").notNull(),
  bookingItemId: text("booking_item_id"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

export const payments = pgTable(
  "payments",
  {
    id: id(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull(), // card | offline_cash | offline_check | offline_other | credit
    status: text("status").notNull(), // pending | succeeded | failed | cancelled
    provider: text("provider").notNull(), // test | stripe | offline | credit
    providerRef: text("provider_ref"),
    checkoutRef: text("checkout_ref"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    failureReason: text("failure_reason"),
    disputeStatus: text("dispute_status"),
    recordedBy: text("recorded_by"),
    createdAt: createdAt(),
    succeededAt: ts("succeeded_at"),
    failedAt: ts("failed_at"),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId), index("payments_checkout_idx").on(t.checkoutRef)],
);

export const refunds = pgTable("refunds", {
  id: id(),
  paymentId: text("payment_id")
    .notNull()
    .references(() => payments.id),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(), // pending | succeeded | failed
  reason: text("reason").notNull(),
  providerRef: text("provider_ref"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  failureReason: text("failure_reason"),
  requestedBy: text("requested_by"),
  createdAt: createdAt(),
  completedAt: ts("completed_at"),
});

/** Account credit ledger: positive = granted, negative = applied. */
export const credits = pgTable("credits", {
  id: id(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason").notNull(),
  invoiceId: text("invoice_id").references(() => invoices.id),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

export const scheduledCharges = pgTable("scheduled_charges", {
  id: id(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id),
  membershipId: text("membership_id").references(() => memberships.id),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  scheduledFor: date("scheduled_for").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled | invoiced | skipped
  invoiceId: text("invoice_id").references(() => invoices.id),
  createdAt: createdAt(),
});

/** Provider webhook events, recorded once (idempotency). */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // provider event id
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("received"), // received | processed | failed | ignored
  error: text("error"),
  receivedAt: ts("received_at").defaultNow().notNull(),
  processedAt: ts("processed_at"),
});

/* ───────────────────────── Communications ───────────────────────── */

export const messageTemplates = pgTable("message_templates", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  /** Essential service messages are sent regardless of marketing preferences. */
  essential: boolean("essential").notNull().default(true),
  updatedAt: updatedAt(),
  updatedBy: text("updated_by"),
});

export const messages = pgTable(
  "messages",
  {
    id: id(),
    templateKey: text("template_key"),
    familyId: text("family_id").references(() => families.id),
    guardianId: text("guardian_id").references(() => guardians.id),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    mode: text("mode").notNull(), // test | live
    status: text("status").notNull(), // queued | captured | sent | delivered | failed
    relatedType: text("related_type"),
    relatedId: text("related_id"),
    providerRef: text("provider_ref"),
    error: text("error"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    sentAt: ts("sent_at"),
  },
  (t) => [index("messages_family_idx").on(t.familyId), index("messages_related_idx").on(t.relatedType, t.relatedId)],
);

/* ───────────────────────── Family portal sign-in ───────────────────────── */

/** Passwordless sign-in links for guardians (stored hashed, single use, short-lived). */
export const familyAuthTokens = pgTable("family_auth_tokens", {
  id: id(),
  guardianId: text("guardian_id")
    .notNull()
    .references(() => guardians.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

/** Each guardian signs in separately; access to billing/sensitive data follows their own flags. */
export const familySessions = pgTable(
  "family_sessions",
  {
    id: id(),
    guardianId: text("guardian_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("family_sessions_guardian_idx").on(t.guardianId)],
);
