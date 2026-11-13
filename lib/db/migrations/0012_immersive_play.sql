-- Yalla Happenings: Immersive Play Sessions. First and third Saturday of every month,
-- 9:00am – 12:00pm, ages 3 – 8 (36 – 107 months), $45 per child. Families may stay and cowork
-- (an add-on, see lib/booking/addons.ts) or leave their child for the morning.
-- Capacity starts at 12 per session; staff can change it in admin.
-- Safe to run on any database: everything is added only where missing.

INSERT INTO "programs" ("id", "slug", "name", "kind", "tagline", "description", "location_id", "min_age_months", "max_age_months",
  "parent_presence", "booking_unit", "booking_mode", "series_mode", "status", "default_capacity", "price_cents", "price_unit")
SELECT gen_random_uuid()::text, 'immersive-play', 'Immersive Play Sessions', 'happening',
  'Three unhurried hours to go deep in their play',
  'Three-hour blocks for children to settle in, follow their curiosity, and go deep in their play. Lunch together at 11:30am (packed from home); departure at 12:00pm.',
  COALESCE((SELECT "location_id" FROM "programs" WHERE "slug" = 'yalla-happenings'), (SELECT "location_id" FROM "programs" WHERE "slug" = 'camp-yalla')),
  36, 107, 'optional', 'per_child', 'instant', 'individual', 'published', 12, 4500, 'session'
WHERE NOT EXISTS (SELECT 1 FROM "programs" WHERE "slug" = 'immersive-play')
  AND EXISTS (SELECT 1 FROM "programs" WHERE "slug" IN ('yalla-happenings', 'camp-yalla'));
--> statement-breakpoint
INSERT INTO "schedule_series" ("id", "program_id", "title", "weekdays", "month_week", "start_time", "end_time", "starts_on", "ends_on",
  "capacity", "hard_capacity", "location_id", "min_age_months", "max_age_months", "price_cents")
SELECT gen_random_uuid()::text, "p"."id", 'Immersive Play Session · ' || "w"."label" || ' Saturday', ARRAY[6], "w"."n", '09:00', '12:00',
  DATE '2026-11-14', DATE '2027-12-31', 12, 12, "p"."location_id", 36, 107, 4500
FROM "programs" "p", (VALUES (1, 'First'), (3, 'Third')) AS "w" ("n", "label")
WHERE "p"."slug" = 'immersive-play'
  AND NOT EXISTS (SELECT 1 FROM "schedule_series" "x" WHERE "x"."program_id" = "p"."id" AND "x"."month_week" = "w"."n");
--> statement-breakpoint
WITH "d" AS (
  SELECT "day"::date AS "day", (EXTRACT(DAY FROM "day")::int - 1) / 7 + 1 AS "n"
  FROM generate_series(DATE '2026-11-14', DATE '2027-12-31', INTERVAL '1 day') AS "day"
  WHERE EXTRACT(DOW FROM "day") = 6
)
INSERT INTO "sessions" ("id", "program_id", "series_id", "title", "local_date", "starts_at", "ends_at", "capacity", "hard_capacity",
  "location_id", "min_age_months", "max_age_months", "price_cents")
SELECT gen_random_uuid()::text, "p"."id", "x"."id", 'Immersive Play Session', "d"."day",
  ("d"."day" + TIME '09:00') AT TIME ZONE 'America/Los_Angeles',
  ("d"."day" + TIME '12:00') AT TIME ZONE 'America/Los_Angeles',
  12, 12, "p"."location_id", 36, 107, 4500
FROM "programs" "p"
JOIN "schedule_series" "x" ON "x"."program_id" = "p"."id"
JOIN "d" ON "d"."n" = "x"."month_week"
WHERE "p"."slug" = 'immersive-play'
  AND NOT EXISTS (SELECT 1 FROM "sessions" "s" WHERE "s"."program_id" = "p"."id" AND "s"."local_date" = "d"."day");
