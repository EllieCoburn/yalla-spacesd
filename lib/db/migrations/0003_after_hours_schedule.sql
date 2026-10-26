-- Yalla After Hours: parents' night out on the second Friday of every month, 5:00–9:00pm,
-- for children 18 months to 10 years in three age groups (up to 26 children in all).
-- $65 per child; the family rate (lib/booking/family-rate.ts) is applied at checkout.
-- Safe to run on any database: it creates the program only if it doesn't exist, and the
-- schedule only if the program has no monthly schedule yet.

INSERT INTO "programs" ("id", "slug", "name", "kind", "tagline", "location_id", "min_age_months", "max_age_months", "parent_presence", "booking_unit", "booking_mode", "status", "price_cents", "price_unit", "default_capacity")
SELECT gen_random_uuid()::text, 'yalla-after-hours', 'Yalla After Hours', 'parents_night', 'Their evening of play. Your night out.',
       (SELECT "id" FROM "locations" WHERE "active" ORDER BY "name" LIMIT 1), 18, 131, 'not_required', 'per_child', 'instant', 'published', 6500, 'session', 26
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
WITH "p" AS (
  SELECT "id", "location_id" FROM "programs" WHERE "slug" = 'yalla-after-hours'
),
"g" ("title", "min_m", "max_m", "cap") AS (
  VALUES
    ('Yalla After Hours · 18 months – 4 years', 18, 47, 8),
    ('Yalla After Hours · 4 – 6 years', 48, 83, 8),
    ('Yalla After Hours · 7 – 10 years', 84, 131, 10)
),
"new_series" AS (
  INSERT INTO "schedule_series" ("id", "program_id", "title", "weekdays", "month_week", "start_time", "end_time", "starts_on", "ends_on", "capacity", "hard_capacity", "location_id", "min_age_months", "max_age_months")
  SELECT gen_random_uuid()::text, "p"."id", "g"."title", ARRAY[5], 2, '17:00', '21:00', DATE '2026-11-01', DATE '2027-10-31', "g"."cap", "g"."cap", "p"."location_id", "g"."min_m", "g"."max_m"
  FROM "p", "g"
  WHERE NOT EXISTS (SELECT 1 FROM "schedule_series" "s" WHERE "s"."program_id" = "p"."id" AND "s"."month_week" IS NOT NULL)
  RETURNING *
),
"evenings" AS (
  -- The second Friday of each month, November 2026 to October 2027.
  SELECT ("m" + (((5 - EXTRACT(DOW FROM "m")::int) + 7) % 7 + 7) * INTERVAL '1 day')::date AS "day"
  FROM generate_series(DATE '2026-11-01', DATE '2027-10-01', INTERVAL '1 month') AS "m"
)
INSERT INTO "sessions" ("id", "program_id", "series_id", "title", "local_date", "starts_at", "ends_at", "capacity", "hard_capacity", "location_id", "min_age_months", "max_age_months")
SELECT gen_random_uuid()::text, "s"."program_id", "s"."id", "s"."title", "e"."day",
       ("e"."day" + TIME '17:00') AT TIME ZONE 'America/Los_Angeles',
       ("e"."day" + TIME '21:00') AT TIME ZONE 'America/Los_Angeles',
       "s"."capacity", "s"."hard_capacity", "s"."location_id", "s"."min_age_months", "s"."max_age_months"
FROM "new_series" "s", "evenings" "e";
