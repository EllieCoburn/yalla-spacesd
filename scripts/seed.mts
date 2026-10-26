/**
 * Seeds SYNTHETIC development data: invented families (example.com emails, 555 numbers),
 * Yalla's programs, cohorts and published rates, a schedule for the coming weeks, memberships,
 * bookings, payments through the test provider, forms, a waitlist and staff accounts.
 *
 * Usage: npm run db:seed          (refuses to run on a database that already has families)
 *        npm run db:seed -- --reset   (wipes the database first — local/preview only)
 *
 * Staff password: SEED_STAFF_PASSWORD, or a local-only default when the database is on localhost.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import * as s from "@/lib/db/schema";
import { SYSTEM, type Actor } from "@/lib/audit";
import { ensureDefaultRoles, createStaff } from "@/lib/auth/staff";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import { createSeries, addBlackout } from "@/lib/ops/schedule";
import { createFamily, addChild, addGuardian, setPickup, setEmergencyContact } from "@/lib/ops/families";
import { createMembership } from "@/lib/ops/memberships";
import { createHold, confirmAdminBooking, startCheckout, cancelBooking } from "@/lib/ops/bookings";
import { createTemplate, addRequirement, submitForm } from "@/lib/ops/forms";
import { joinWaitlist } from "@/lib/ops/waitlist";
import { processEvent } from "@/lib/payments/webhooks";
import { DEFAULT_TEMPLATES } from "@/lib/notify/index";
import { addDaysISO, ageInMonths, todayLA, weekdayOf } from "@/lib/time";

const url = process.env.DATABASE_URL ?? "";
const local = /localhost|127\.0\.0\.1/.test(url);
const password = process.env.SEED_STAFF_PASSWORD ?? (local ? "yalla-local-dev-only" : "");
if (!url) throw new Error("DATABASE_URL is required.");
if (!password) throw new Error("Set SEED_STAFF_PASSWORD (at least 12 characters) to seed a non-local database.");
if (process.env.VERCEL_ENV === "production") throw new Error("Refusing to seed synthetic data into production.");

const db = getDb();
const admin: Actor = { type: "staff", id: "seed", name: "Seed script", permissions: ALL_PERMISSIONS };

if (process.argv.includes("--reset")) {
  const tables = await db.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '__drizzle%'`);
  await db.execute(sql.raw(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`));
  console.log("Reset database.");
}
const [{ n }] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM families`);
if (n > 0) {
  console.log("Database already has families — skipping seed. Use --reset to start over.");
  process.exit(0);
}

await ensureDefaultRoles(db);

/* Staff */
const staff = [
  { email: "owner@yalla.test", name: "Olivia Owner (sample)", roleKey: "owner" },
  { email: "ops@yalla.test", name: "Omar Operations (sample)", roleKey: "operations" },
  { email: "educator@yalla.test", name: "Eden Educator (sample)", roleKey: "educator" },
  { email: "billing@yalla.test", name: "Bea Billing (sample)", roleKey: "billing" },
];
for (const st of staff) await createStaff(db, SYSTEM, { ...st, password });

/* Location, cohorts, pools */
const [loc] = await db
  .insert(s.locations)
  .values({ name: "Yalla Bankers Hill", address: null, arrivalInstructions: "Please check in at the front desk. (Sample — replace with real arrival details.)" })
  .returning();
const cohortDefs = [
  { name: "Seedlings", ratio: "1:4", maxSize: 8, flex: [18000, 9000], tuition: [[5, 280000, 160000], [4, 260000, 130000], [3, 210000, 100000], [2, 140000, 71500], [1, 72000, 37000]] },
  { name: "Saplings", ratio: "1:4", maxSize: 8, flex: [16000, 8000], tuition: [[5, 270000, 135000], [4, 242500, 121500], [3, 208000, 104000], [2, 140000, 70000], [1, 72000, 36000]] },
  { name: "Sprouts", ratio: "1:6", maxSize: 12, flex: [15000, 7500], tuition: [[5, 240000, 120000], [4, 225000, 112500], [3, 182000, 91000], [2, 125000, 62500], [1, 63000, 31500]] },
  { name: "Wildflowers", ratio: "1:8", maxSize: 12, flex: [15000, 7500], tuition: [[5, 210000, 105000], [4, 197500, 98500], [3, 150000, 75000], [2, 100000, 50000], [1, 55000, 27500]] },
] as const;
const cohorts: (typeof s.cohorts.$inferSelect)[] = [];
const pools: (typeof s.capacityPools.$inferSelect)[] = [];
for (const [i, c] of cohortDefs.entries()) {
  const [row] = await db.insert(s.cohorts).values({ name: c.name, ratio: c.ratio, maxSize: c.maxSize, locationId: loc.id, sortOrder: i }).returning();
  const [pool] = await db.insert(s.capacityPools).values({ name: `${c.name} room`, capacity: c.maxSize, locationId: loc.id, description: "Shared by Club Yalla and Yalla Flex" }).returning();
  cohorts.push(row);
  pools.push(pool);
}

/* Programs */
// A program may already exist when a migration created it (e.g. Yalla After Hours); reuse it then.
const P = async (v: Partial<typeof s.programs.$inferInsert> & { slug: string; name: string; kind: string }) =>
  (await db.insert(s.programs).values({ locationId: loc.id, status: "published", ...v }).onConflictDoNothing({ target: s.programs.slug }).returning())[0] ??
  (await db.select().from(s.programs).where(eq(s.programs.slug, v.slug)))[0];
const club = await P({ slug: "club-yalla", name: "Club Yalla", kind: "membership", tagline: "Your weekly childcare rhythm", parentPresence: "required", bookingMode: "enroll", minAgeMonths: 4, maxAgeMonths: 66, priceUnit: "month" });
const flex = await P({ slug: "yalla-flex", name: "Yalla Flex", kind: "drop_in", tagline: "Drop-in childcare", parentPresence: "required", minAgeMonths: 4, maxAgeMonths: 66, minNoticeHours: 12, cancellationDeadlineHours: 24, advanceBookingDays: 60 });
const weekends = await P({ slug: "yalla-weekends", name: "Yalla Weekends", kind: "weekend", tagline: "A little room in your weekend", parentPresence: "not_required", minAgeMonths: 12, maxAgeMonths: 66, priceCents: 9500, minNoticeHours: 24 });
const after = await P({ slug: "yalla-after-hours", name: "Yalla After Hours", kind: "parents_night", tagline: "Their evening of play. Your night out.", parentPresence: "not_required", minAgeMonths: 18, maxAgeMonths: 131, priceCents: 6500, defaultCapacity: 26 });
const camp = await P({ slug: "camp-yalla", name: "Camp Yalla", kind: "camp", tagline: "Seasonal adventures for children", parentPresence: "not_required", seriesMode: "full_series", minAgeMonths: 24, maxAgeMonths: 66, priceCents: 14000 });
const happenings = await P({ slug: "yalla-happenings", name: "Yalla Happenings", kind: "happening", tagline: "Pop-ups, workshops & community gatherings", parentPresence: "required", bookingUnit: "per_family", priceCents: 3500 });
await P({ slug: "yalla-celebrations", name: "Yalla Celebrations", kind: "private_event", tagline: "Private parties & special occasions", bookingUnit: "private_event", bookingMode: "inquire", parentPresence: "required" });
await P({ slug: "yalla-outside", name: "Yalla Outside", kind: "nature", tagline: "Nature exploration in Balboa Park", status: "draft", bookingMode: "request" });

for (const [i, c] of cohortDefs.entries()) {
  await db.insert(s.programCohorts).values([{ programId: club.id, cohortId: cohorts[i].id }, { programId: flex.id, cohortId: cohorts[i].id }]);
  await db.insert(s.programPrices).values([
    { programId: flex.id, label: `${c.name} full day`, amountCents: c.flex[0], unit: "session", cohortId: cohorts[i].id, dayLength: "full" },
    { programId: flex.id, label: `${c.name} half day`, amountCents: c.flex[1], unit: "session", cohortId: cohorts[i].id, dayLength: "half" },
    ...c.tuition.flatMap(([days, full, half]) => [
      { programId: club.id, label: `${c.name} · ${days} full days/week`, amountCents: full, unit: "month", cohortId: cohorts[i].id, dayLength: "full", daysPerWeek: days },
      { programId: club.id, label: `${c.name} · ${days} half days/week`, amountCents: half, unit: "month", cohortId: cohorts[i].id, dayLength: "half", daysPerWeek: days },
    ]),
  ]);
}

/* Schedule: four weeks back, eight weeks ahead */
const today = todayLA();
const start = addDaysISO(today, -28);
const end = addDaysISO(today, 56);
for (const [i, c] of cohortDefs.entries()) {
  const common = { weekdays: [1, 2, 3, 4, 5], startsOn: start, endsOn: end, cohortId: cohorts[i].id, capacityPoolId: pools[i].id, locationId: loc.id };
  await createSeries(db, admin, { ...common, programId: club.id, title: `Club Yalla · ${c.name}`, startTime: "08:30", endTime: "16:30", capacity: c.maxSize, hardCapacity: c.maxSize });
  await createSeries(db, admin, { ...common, programId: flex.id, title: `Flex · ${c.name}`, startTime: "08:30", endTime: "16:30", capacity: c.maxSize, hardCapacity: c.maxSize });
}
await createSeries(db, admin, { programId: weekends.id, title: "Weekend morning", weekdays: [6], startTime: "09:00", endTime: "12:30", startsOn: start, endsOn: end, capacity: 10, hardCapacity: 12, locationId: loc.id });
// After Hours: second Friday of each month, three age groups (the 0003 migration does the same in production).
const afterHoursGroups = [
  { title: "Yalla After Hours · 18 months – 4 years", minAgeMonths: 18, maxAgeMonths: 47, capacity: 8 },
  { title: "Yalla After Hours · 4 – 6 years", minAgeMonths: 48, maxAgeMonths: 83, capacity: 8 },
  { title: "Yalla After Hours · 7 – 10 years", minAgeMonths: 84, maxAgeMonths: 131, capacity: 10 },
];
const [afterHoursMonthly] = await db.select({ id: s.scheduleSeries.id }).from(s.scheduleSeries).where(and(eq(s.scheduleSeries.programId, after.id), isNotNull(s.scheduleSeries.monthWeek)));
if (!afterHoursMonthly)
  for (const g of afterHoursGroups)
    await createSeries(db, admin, { programId: after.id, ...g, weekdays: [5], monthWeek: 2, startTime: "17:00", endTime: "21:00", startsOn: start, endsOn: addDaysISO(today, 365), hardCapacity: g.capacity, locationId: loc.id });
await createSeries(db, admin, { programId: happenings.id, title: "Pop-up workshop", weekdays: [0], startTime: "10:00", endTime: "11:30", startsOn: addDaysISO(today, 3), endsOn: addDaysISO(today, 45), capacity: 14, locationId: loc.id });
let campStart = addDaysISO(today, 21);
while (weekdayOf(campStart) !== 1) campStart = addDaysISO(campStart, 1);
await createSeries(db, admin, { programId: camp.id, title: "Little Builders week", weekdays: [1, 2, 3, 4, 5], startTime: "08:30", endTime: "15:00", startsOn: campStart, endsOn: addDaysISO(campStart, 4), capacity: 10, hardCapacity: 10, bookAsSeries: true, locationId: loc.id });
let thanksgiving = "2026-11-26";
if (thanksgiving < today) thanksgiving = addDaysISO(today, 40);
await addBlackout(db, admin, { startsOn: thanksgiving, endsOn: addDaysISO(thanksgiving, 1), reason: "Thanksgiving (sample closure)", confirmAffected: true });

/* Forms */
const placeholder = "[Placeholder text — Yalla must supply reviewed language before this form is used with families.]";
const forms = {
  enrollment: await createTemplate(db, admin, { title: "Enrollment agreement", kind: "policy", perChild: false, requiresSignature: true, frequency: "once", enforcement: "blocks_booking", body: placeholder }),
  emergency: await createTemplate(db, admin, { title: "Emergency & departure contacts", kind: "form", perChild: false, requiresSignature: false, frequency: "periodic", validForMonths: 12, enforcement: "before_attendance", body: "Please confirm emergency contacts and authorized pickup adults." }),
  health: await createTemplate(db, admin, { title: "Health & immunization record", kind: "upload", perChild: true, requiresSignature: false, frequency: "periodic", validForMonths: 12, enforcement: "before_attendance", body: "Upload a current health and immunization record." }),
  photo: await createTemplate(db, admin, { title: "Photo & media preferences", kind: "form", perChild: true, requiresSignature: false, frequency: "once", enforcement: "informational", body: "Tell us how we may share photos of your child." }),
  weekendWaiver: await createTemplate(db, admin, { title: "Weekend & evening care waiver", kind: "waiver", perChild: true, requiresSignature: true, frequency: "once", enforcement: "blocks_booking", body: placeholder }),
};
await addRequirement(db, admin, { templateId: forms.enrollment.template.id, scope: "all" });
await addRequirement(db, admin, { templateId: forms.emergency.template.id, scope: "all" });
await addRequirement(db, admin, { templateId: forms.health.template.id, scope: "all" });
await addRequirement(db, admin, { templateId: forms.photo.template.id, scope: "all" });
await addRequirement(db, admin, { templateId: forms.weekendWaiver.template.id, scope: "program", programId: weekends.id });
await addRequirement(db, admin, { templateId: forms.weekendWaiver.template.id, scope: "program", programId: after.id });

/* Message templates */
for (const [key, t] of Object.entries(DEFAULT_TEMPLATES)) await db.insert(s.messageTemplates).values({ key, name: t.name, subject: t.subject, body: t.body, essential: t.essential }).onConflictDoNothing();

/* Families (synthetic) */
const first = ["Ava", "Leo", "Mila", "Theo", "Isla", "Noah", "Luna", "Ezra", "Nora", "Kai", "Iris", "Milo", "Zoe", "Arlo", "June", "Remy", "Cleo", "Otis", "Wren", "Jude", "Ines", "Sami", "Lila", "Omar", "Rosa", "Felix", "Hana", "Ari"];
const adults = ["Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Rowan", "Sasha", "Devon", "Emerson", "Hayden"];
const last = ["Sample", "Example", "Placeholder", "Testwood", "Demo", "Fictional", "Mockridge", "Sandbox", "Specimen", "Prototype", "Trial", "Pilot", "Draftley", "Modelson"];
const allergies = [null, null, null, "Peanuts (EpiPen in bag)", null, "Dairy", null, null, "Egg", null];
const famRows: { familyId: string; guardianId: string; children: (typeof s.children.$inferSelect)[] }[] = [];
let k = 0;
for (let i = 0; i < 28; i++) {
  const ln = `${last[i % last.length]}${i >= last.length ? " II" : ""}`;
  const { family, guardian } = await createFamily(db, admin, {
    name: `${ln} family`,
    guardian: { firstName: adults[i % adults.length], lastName: ln, email: `family${i + 1}@example.com`, phone: `(619) 555-01${String(i).padStart(2, "0")}`, relationship: "Parent" },
    isSample: true,
    marketingOptIn: i % 3 === 0,
  });
  if (i % 4 === 0) await addGuardian(db, admin, family.id, { firstName: adults[(i + 5) % adults.length], lastName: ln, email: `family${i + 1}.second@example.com`, relationship: "Parent", canViewBilling: false });
  const kidCount = i % 5 === 0 ? 2 : 1;
  const kids: (typeof s.children.$inferSelect)[] = [];
  for (let j = 0; j < kidCount; j++) {
    const ageMonths = 6 + ((i * 7 + j * 19) % 54);
    const b = new Date();
    b.setMonth(b.getMonth() - ageMonths);
    const birth = b.toISOString().slice(0, 10);
    const cohortIdx = ageMonths < 18 ? 0 : ageMonths < 30 ? 1 : ageMonths < 42 ? 2 : 3;
    const { child } = await addChild(db, admin, family.id, { firstName: first[k++ % first.length], lastName: ln, birthDate: birth, allergies: allergies[(i + j) % allergies.length] ?? undefined, cohortId: cohorts[cohortIdx].id, careNotes: j === 0 && i % 6 === 0 ? "Rests best with a white-noise machine. (sample)" : undefined });
    kids.push(child);
  }
  await setPickup(db, admin, family.id, { name: `Grandparent ${ln}`, relationship: "Grandparent", phone: `(619) 555-02${String(i).padStart(2, "0")}` });
  if (i === 7) await setPickup(db, admin, family.id, { name: "Pat Restricted (sample)", relationship: "Other", isRestricted: true, restrictionNote: "Not permitted to collect. Court order on file (sample)." });
  await setEmergencyContact(db, admin, family.id, { name: `Neighbor ${ln}`, relationship: "Neighbor", phone: `(619) 555-03${String(i).padStart(2, "0")}` });
  famRows.push({ familyId: family.id, guardianId: guardian.id, children: kids });

  // Paperwork: most complete, some gaps.
  if (i % 7 !== 3) await submitForm(db, admin, { templateId: forms.enrollment.template.id, familyId: family.id, signerGuardianId: guardian.id, signatureText: `${adults[i % adults.length]} ${ln}`, consent: true });
  if (i % 5 !== 2) await submitForm(db, admin, { templateId: forms.emergency.template.id, familyId: family.id, consent: true, data: { confirmed: true } });
  for (const c of kids) {
    if ((i + c.firstName.length) % 6 !== 0) await submitForm(db, admin, { templateId: forms.health.template.id, familyId: family.id, childId: c.id, consent: true, data: { note: "Sample record" } });
    if (i % 3 === 0) await submitForm(db, admin, { templateId: forms.weekendWaiver.template.id, familyId: family.id, childId: c.id, signerGuardianId: guardian.id, signatureText: `${adults[i % adults.length]} ${ln}`, consent: true });
  }
}

/* Memberships: fill cohorts partially, leaving a few drop-in spots */
const weekdayPlans = [[1, 2, 3, 4, 5], [1, 3, 5], [2, 4], [1, 2, 3, 4], [1, 2, 3], [3, 4, 5]];
let mi = 0;
for (const f of famRows.slice(0, 18)) {
  const c = f.children[0];
  const cohortIdx = cohorts.findIndex((x) => x.id === c.cohortId);
  const days = weekdayPlans[mi % weekdayPlans.length];
  const price = cohortDefs[cohortIdx].tuition.find(([d]) => d === days.length)![1];
  try {
    await createMembership(db, admin, { familyId: f.familyId, childId: c.id, programId: club.id, cohortId: c.cohortId!, weekdays: days, dayLength: mi % 5 === 4 ? "half" : "full", earlyBird: mi % 4 === 0, startsOn: addDaysISO(start, mi % 3 === 0 ? 0 : 14), priceCents: price, billingFrequency: "monthly" });
  } catch (e) {
    console.log(`Skipped a membership: ${(e as Error).message}`);
  }
  mi++;
}

/* Bookings */
const flexSessions = await db.execute<{ id: string; local_date: string; cohort_id: string }>(sql`SELECT id, local_date, cohort_id FROM sessions WHERE program_id = ${flex.id} AND local_date >= ${today} ORDER BY local_date LIMIT 60`);
const weekendSessions = await db.execute<{ id: string }>(sql`SELECT id FROM sessions WHERE program_id = ${weekends.id} AND local_date >= ${today} AND status = 'scheduled' ORDER BY local_date LIMIT 4`);
// The next After Hours evening: one session per age group.
const afterSessions = await db.execute<{ id: string; local_date: string; min_age_months: number; max_age_months: number }>(
  sql`SELECT id, local_date, min_age_months, max_age_months FROM sessions WHERE program_id = ${after.id} AND local_date = (SELECT min(local_date) FROM sessions WHERE program_id = ${after.id} AND local_date >= ${today} AND status = 'scheduled') ORDER BY min_age_months`,
);
let paid = 0;
for (const [i, f] of famRows.slice(18).entries()) {
  for (const c of f.children) {
    const options = flexSessions.filter((x) => x.cohort_id === c.cohortId);
    const sess = options[i % Math.max(options.length, 1)];
    if (!sess) continue;
    try {
      const hold = await createHold(db, admin, { familyId: f.familyId, items: [{ sessionId: sess.id, childId: c.id }], source: "admin", acknowledgePaperwork: true });
      if (i % 3 === 0) {
        // Paid online through the test provider and verified by webhook.
        await startCheckout(db, admin, hold.booking.id, { base: "http://localhost:3000" });
        const [p] = await db.execute<{ checkout_ref: string; amount_cents: number }>(sql`SELECT checkout_ref, amount_cents FROM payments WHERE status='pending' ORDER BY created_at DESC LIMIT 1`);
        await processEvent(db, "test", { id: `seed_evt_${paid++}`, type: "payment.succeeded", checkoutRef: p.checkout_ref, providerRef: `pi_seed_${paid}`, amountCents: p.amount_cents });
      } else {
        await confirmAdminBooking(db, admin, hold.booking.id, { createInvoice: true, notify: false });
      }
    } catch (e) {
      console.log(`Skipped a booking: ${(e as Error).message}`);
    }
  }
}
for (const [i, f] of famRows.filter((_, i) => i % 3 === 0).entries()) {
  const sess = weekendSessions[i % weekendSessions.length];
  if (!sess) continue;
  try {
    const hold = await createHold(db, admin, { familyId: f.familyId, items: f.children.map((c) => ({ sessionId: sess.id, childId: c.id })), source: "admin", acknowledgePaperwork: true });
    await confirmAdminBooking(db, admin, hold.booking.id, { createInvoice: true, notify: false });
    if (i === 1) await cancelBooking(db, admin, { bookingId: hold.booking.id, reason: "Family travelling (sample)", notify: false });
  } catch (e) {
    console.log(`Skipped a weekend booking: ${(e as Error).message}`);
  }
}
// Fill an After Hours evening to show "nearly full" and a waitlist; each child joins the group for their age.
const groupFor = (birthDate: string) => {
  const months = ageInMonths(birthDate, afterSessions[0].local_date);
  return afterSessions.find((g) => months >= g.min_age_months && months <= g.max_age_months);
};
const night = afterSessions[0];
if (night) {
  for (const f of famRows.filter((_, i) => i % 3 === 0)) {
    const items = f.children.flatMap((c) => {
      const g = groupFor(c.birthDate);
      return g ? [{ sessionId: g.id, childId: c.id }] : [];
    });
    if (!items.length) continue;
    try {
      const hold = await createHold(db, admin, { familyId: f.familyId, items, source: "admin", acknowledgePaperwork: true });
      await confirmAdminBooking(db, admin, hold.booking.id, { createInvoice: true, notify: false });
    } catch {
      /* full */
    }
  }
  for (const f of famRows.filter((_, i) => i % 3 === 1).slice(0, 3)) {
    try {
      await joinWaitlist(db, admin, { familyId: f.familyId, sessionId: night.id, childIds: f.children.map((c) => c.id) });
    } catch {
      /* ignore */
    }
  }
}

console.log(`Seeded synthetic data: ${famRows.length} families, ${staff.length} staff.`);
console.log(`Staff sign-in: ${staff.map((s) => s.email).join(", ")}${local ? ` · password: ${password}` : " · password from SEED_STAFF_PASSWORD"}`);
process.exit(0);
