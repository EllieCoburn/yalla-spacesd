-- Yalla's closure days from the 2026–27 and 2027–28 cohort year calendars, recorded as closures
-- for Yalla Flex (Flex fills cohort vacancies, so there's none when Yalla is closed). Camp Yalla
-- runs on some of these days and isn't affected. Flex days on these dates are closed; the website
-- shows "Yalla closed" and links to camp when there is one. Safe to re-run.
WITH "p" AS (SELECT "id" FROM "programs" WHERE "slug" = 'yalla-flex'),
"c" ("starts_on", "ends_on", "reason") AS (
  VALUES
    (DATE '2026-09-07', DATE '2026-09-07', 'Labor Day'),
    (DATE '2026-10-09', DATE '2026-10-09', 'Staff Development Day'),
    (DATE '2026-10-12', DATE '2026-10-12', 'Indigenous Peoples’ Day'),
    (DATE '2026-11-11', DATE '2026-11-11', 'Veterans Day'),
    (DATE '2026-11-25', DATE '2026-11-27', 'Fall Family Break'),
    (DATE '2026-12-21', DATE '2027-01-01', 'Winter Family Break'),
    (DATE '2027-01-18', DATE '2027-01-18', 'Martin Luther King Jr. Day'),
    (DATE '2027-02-15', DATE '2027-02-15', 'Presidents Day'),
    (DATE '2027-04-16', DATE '2027-04-16', 'Staff Development Day'),
    (DATE '2027-05-31', DATE '2027-05-31', 'Memorial Day'),
    (DATE '2027-07-05', DATE '2027-07-05', 'Fourth of July'),
    (DATE '2027-07-22', DATE '2027-07-30', 'Summer Family Break'),
    (DATE '2027-09-06', DATE '2027-09-06', 'Labor Day'),
    (DATE '2027-10-08', DATE '2027-10-08', 'Staff Development Day'),
    (DATE '2027-10-11', DATE '2027-10-11', 'Indigenous Peoples’ Day'),
    (DATE '2027-11-11', DATE '2027-11-11', 'Veterans Day'),
    (DATE '2027-11-24', DATE '2027-11-26', 'Fall Family Break'),
    (DATE '2027-12-20', DATE '2027-12-31', 'Winter Family Break'),
    (DATE '2028-01-17', DATE '2028-01-17', 'Martin Luther King Jr. Day'),
    (DATE '2028-02-21', DATE '2028-02-21', 'Presidents Day'),
    (DATE '2028-04-14', DATE '2028-04-14', 'Staff Development Day'),
    (DATE '2028-05-29', DATE '2028-05-29', 'Memorial Day'),
    (DATE '2028-06-19', DATE '2028-06-19', 'Juneteenth'),
    (DATE '2028-07-03', DATE '2028-07-04', 'Fourth of July'),
    (DATE '2028-07-27', DATE '2028-08-04', 'Summer Family Break')
)
INSERT INTO "blackout_dates" ("id", "starts_on", "ends_on", "program_id", "reason", "created_by")
SELECT gen_random_uuid()::text, "c"."starts_on", "c"."ends_on", "p"."id", "c"."reason", 'Cohort year calendar'
FROM "p", "c"
WHERE NOT EXISTS (
  SELECT 1 FROM "blackout_dates" "b" WHERE "b"."program_id" = "p"."id" AND "b"."starts_on" = "c"."starts_on" AND "b"."ends_on" = "c"."ends_on"
);
--> statement-breakpoint
UPDATE "sessions" SET "status" = 'closed', "notes" = 'Closed: ' || "b"."reason"
FROM "blackout_dates" "b"
WHERE "sessions"."program_id" = "b"."program_id"
  AND "b"."program_id" IN (SELECT "id" FROM "programs" WHERE "slug" = 'yalla-flex')
  AND "sessions"."local_date" BETWEEN "b"."starts_on" AND "b"."ends_on"
  AND "sessions"."status" = 'scheduled';
--> statement-breakpoint
-- Cohorts need 30 minutes to prepare for a child: Flex booking closes at 8:00am for an 8:30am start.
UPDATE "sessions" SET "booking_closes_at" = "starts_at" - INTERVAL '30 minutes'
WHERE "program_id" IN (SELECT "id" FROM "programs" WHERE "slug" = 'yalla-flex')
  AND ("booking_closes_at" IS NULL OR "booking_closes_at" > "starts_at" - INTERVAL '30 minutes');
