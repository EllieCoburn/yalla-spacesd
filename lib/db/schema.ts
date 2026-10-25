/**
 * Postgres schema for families, programs, availability and bookings (stage 2).
 * Not connected yet — the site runs on lib/booking/preview.ts until DATABASE_URL is set.
 *
 * Key ideas
 * - A family account holds many guardians (logins) and many children.
 * - Programs define *what* is offered; schedule_rules generate concrete sessions.
 * - Capacity lives on sessions. "spaces_taken" counts confirmed lines plus live holds,
 *   and is updated inside the same transaction that locks the session row, so two
 *   families can never book the last space at once.
 * - Repeat bookings are a recurrence that materialises booking lines ahead of time.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey();
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const programKind = pgEnum("program_kind", [
  "membership",
  "drop_in",
  "nature",
  "camp",
  "weekend",
  "happening",
  "parents_night",
  "private_event",
]);
export const bookingMode = pgEnum("booking_mode", ["instant", "request", "enroll", "inquire"]);
export const bookingStatus = pgEnum("booking_status", ["held", "pending_payment", "requested", "confirmed", "waitlisted", "cancelled"]);
export const formStatus = pgEnum("form_status", ["missing", "submitted", "approved", "expiring", "expired"]);
export const membershipStatus = pgEnum("membership_status", ["applied", "offered", "active", "paused", "ended"]);

/* ───────── Families ───────── */

export const families = pgTable("families", {
  id: id(),
  name: text("name").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  ...timestamps,
});

export const guardians = pgTable(
  "guardians",
  {
    id: id(),
    familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("guardians_email_idx").on(t.email)],
);

export const children = pgTable("children", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthDate: date("birth_date").notNull(),
  allergies: text("allergies"),
  medicalNotes: text("medical_notes"),
  notes: text("notes"),
  ...timestamps,
});

export const authorizedPickups = pgTable("authorized_pickups", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship"),
  phone: text("phone"),
});

/* ───────── Forms ───────── */

export const formTemplates = pgTable("form_templates", {
  id: id(),
  title: text("title").notNull(),
  perChild: boolean("per_child").default(false).notNull(),
  /** Months until it must be renewed; null = never expires. */
  validForMonths: integer("valid_for_months"),
  requiredFor: programKind("required_for").array(),
});

export const formSubmissions = pgTable("form_submissions", {
  id: id(),
  templateId: text("template_id").notNull().references(() => formTemplates.id),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  childId: text("child_id").references(() => children.id, { onDelete: "cascade" }),
  status: formStatus("status").default("submitted").notNull(),
  data: jsonb("data"),
  fileUrl: text("file_url"),
  expiresOn: date("expires_on"),
  ...timestamps,
});

/* ───────── Programs & schedule ───────── */

export const programs = pgTable("programs", {
  id: id(),
  slug: text("slug").notNull().unique(),
  kind: programKind("kind").notNull(),
  name: text("name").notNull(),
  bookingMode: bookingMode("booking_mode").notNull(),
  minAgeMonths: integer("min_age_months"),
  maxAgeMonths: integer("max_age_months"),
  parentOnsite: boolean("parent_onsite"),
  /** Hours before start when cancellation stops being free. */
  cancellationWindowHours: integer("cancellation_window_hours"),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const priceOptions = pgTable("price_options", {
  id: id(),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  label: text("label").notNull(), // "Per day", "Full camp week", "10-day pack"
  amountCents: integer("amount_cents").notNull(),
  unit: text("unit").notNull(), // session | group | month | pack
  sessionsIncluded: integer("sessions_included"),
  stripePriceId: text("stripe_price_id"),
});

/** Generates sessions: "Weekdays 8:30–4:30, capacity 8, Jan–Jun". */
export const scheduleRules = pgTable("schedule_rules", {
  id: id(),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  weekdays: integer("weekdays").array().notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  capacity: integer("capacity").notNull(),
  minAgeMonths: integer("min_age_months"),
  maxAgeMonths: integer("max_age_months"),
  room: text("room"),
});

export const sessionGroups = pgTable("session_groups", {
  id: id(),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  priceOptionId: text("price_option_id").references(() => priceOptions.id),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").references(() => scheduleRules.id, { onDelete: "set null" }),
    groupId: text("group_id").references(() => sessionGroups.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull(),
    spacesTaken: integer("spaces_taken").default(0).notNull(),
    minAgeMonths: integer("min_age_months").notNull(),
    maxAgeMonths: integer("max_age_months").notNull(),
    status: text("status").default("open").notNull(),
    room: text("room"),
    ...timestamps,
  },
  (t) => [index("sessions_program_start_idx").on(t.programId, t.startsAt)],
);

/** Some age groups use more than one space (e.g. infants), configurable per program. */
export const ageWeights = pgTable(
  "age_weights",
  {
    programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
    maxAgeMonths: integer("max_age_months").notNull(),
    spaces: integer("spaces").notNull(),
  },
  (t) => [primaryKey({ columns: [t.programId, t.maxAgeMonths] })],
);

/* ───────── Bookings ───────── */

export const recurrences = pgTable("recurrences", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id),
  childIds: text("child_ids").array().notNull(),
  weekdays: integer("weekdays").array().notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const bookings = pgTable("bookings", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  status: bookingStatus("status").notNull(),
  recurrenceId: text("recurrence_id").references(() => recurrences.id, { onDelete: "set null" }),
  holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
  stripeCheckoutId: text("stripe_checkout_id"),
  totalCents: integer("total_cents"),
  ...timestamps,
});

export const bookingLines = pgTable(
  "booking_lines",
  {
    id: id(),
    bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    childId: text("child_id").notNull().references(() => children.id),
    status: bookingStatus("status").notNull(),
    spaces: integer("spaces").default(1).notNull(),
    priceCents: integer("price_cents"),
    ...timestamps,
  },
  (t) => [uniqueIndex("booking_lines_child_session_idx").on(t.childId, t.sessionId)],
);

export const waitlistEntries = pgTable("waitlist_entries", {
  id: id(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  childId: text("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  ...timestamps,
});

/* ───────── Membership (recurring enrollment) ───────── */

export const memberships = pgTable("memberships", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  childId: text("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id),
  weekdays: integer("weekdays").array().notNull(),
  earlyBird: boolean("early_bird").default(false).notNull(),
  status: membershipStatus("status").default("applied").notNull(),
  startsOn: date("starts_on"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  ...timestamps,
});

/* ───────── Payments ───────── */

export const payments = pgTable("payments", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  membershipId: text("membership_id").references(() => memberships.id, { onDelete: "set null" }),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(), // succeeded | refunded | failed
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  description: text("description"),
  ...timestamps,
});

export const familyCredits = pgTable("family_credits", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  programId: text("program_id").references(() => programs.id),
  sessionsRemaining: integer("sessions_remaining").notNull(),
  expiresOn: date("expires_on"),
  ...timestamps,
});

/* ───────── Relations ───────── */

export const familyRelations = relations(families, ({ many }) => ({
  guardians: many(guardians),
  children: many(children),
  bookings: many(bookings),
  memberships: many(memberships),
}));

export const bookingRelations = relations(bookings, ({ one, many }) => ({
  family: one(families, { fields: [bookings.familyId], references: [families.id] }),
  lines: many(bookingLines),
}));

export const bookingLineRelations = relations(bookingLines, ({ one }) => ({
  booking: one(bookings, { fields: [bookingLines.bookingId], references: [bookings.id] }),
  session: one(sessions, { fields: [bookingLines.sessionId], references: [sessions.id] }),
  child: one(children, { fields: [bookingLines.childId], references: [children.id] }),
}));
