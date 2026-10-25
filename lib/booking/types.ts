/**
 * Booking domain model.
 *
 * These types are the contract between the UI and whatever backs it. Today a
 * preview adapter (./preview.ts) supplies sample data; in stage 2 the same
 * interface is implemented against Postgres (see lib/db/schema.ts) and Stripe.
 * See docs/ARCHITECTURE.md for the full picture.
 */

export type ProgramKind =
  | "membership" // Club Yalla
  | "drop_in" // Yalla Flex
  | "nature" // Yalla Outside
  | "camp" // Camp Yalla
  | "weekend" // Yalla Weekends
  | "happening" // Yalla Happenings
  | "parents_night" // Yalla After Hours
  | "private_event"; // Yalla Celebrations

/** How a family takes the next step for a program. */
export type BookingMode =
  | "instant" // pick sessions, pay, confirmed
  | "request" // pick sessions, Yalla approves, then pay
  | "enroll" // recurring enrollment via an application
  | "inquire"; // conversation first

export type Money = { amountCents: number; currency: "usd" };

export type AgeRange = { minMonths: number; maxMonths: number };

export interface Program {
  id: string;
  slug: string;
  kind: ProgramKind;
  name: string;
  bookingMode: BookingMode;
  ages: AgeRange | null;
  /** Whether a parent/caregiver works onsite during care. null = not yet confirmed. */
  parentOnsite: boolean | null;
}

/**
 * A bookable occurrence — one Flex day, one After Hours evening,
 * one weekend morning. Camps are a SessionGroup that books all days together.
 */
export interface Session {
  id: string;
  programId: string;
  groupId?: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  ages: AgeRange;
  /** Total capacity in "spaces". Infants can consume more than one space via ageWeights. */
  capacity: number;
  /** Confirmed + actively held spaces. */
  taken: number;
  price: Money | null;
  status: "open" | "closed" | "cancelled";
  room?: string;
}

export interface SessionGroup {
  id: string;
  programId: string;
  title: string;
  sessionIds: string[];
  price: Money | null;
}

export type Availability =
  | { state: "open"; remaining: number }
  | { state: "limited"; remaining: number }
  | { state: "full"; waitlist: boolean }
  | { state: "ineligible"; reason: string };

export interface Family {
  id: string;
  name: string;
  guardians: Guardian[];
  children: Child[];
}

export interface Guardian {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  isPrimary: boolean;
}

export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD
  allergies?: string;
  notes?: string;
}

export type FormStatus = "missing" | "submitted" | "approved" | "expiring" | "expired";

export interface RequiredForm {
  id: string;
  title: string;
  childId?: string; // family-level when absent
  status: FormStatus;
  dueBy?: string;
}

export type BookingStatus = "held" | "pending_payment" | "requested" | "confirmed" | "waitlisted" | "cancelled";

export interface BookingLine {
  id: string;
  sessionId: string;
  childId: string;
  status: BookingStatus;
  price: Money | null;
}

export interface Booking {
  id: string;
  familyId: string;
  createdAt: string;
  status: BookingStatus;
  lines: BookingLine[];
  /** Set for repeat bookings ("every Tuesday through June"). */
  recurrenceId?: string;
  /** Seat hold expiry while checking out — keeps availability honest in real time. */
  holdExpiresAt?: string;
}

export interface Recurrence {
  id: string;
  familyId: string;
  programId: string;
  childIds: string[];
  weekdays: number[]; // 0 = Sunday
  startsOn: string;
  endsOn?: string;
}

/** What the Book Care page asks the backend for. */
export interface AvailabilityQuery {
  from: string; // YYYY-MM-DD
  to: string;
  kinds?: ProgramKind[];
  childAgeMonths?: number;
}

export interface BookingProvider {
  listPrograms(): Promise<Program[]>;
  listSessions(q: AvailabilityQuery): Promise<Session[]>;
  /** Places short holds on sessions so capacity is reserved during checkout. */
  hold(input: { familyId: string; lines: { sessionId: string; childId: string }[] }): Promise<Booking>;
  confirm(bookingId: string): Promise<Booking>;
  cancelLine(bookingId: string, lineId: string): Promise<Booking>;
}
