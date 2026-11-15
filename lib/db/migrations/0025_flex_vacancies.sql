-- Yalla Flex fills vacancies in Yalla's cohorts. Four age groups (4 – 12 months, 12 – 20 months,
-- 20 – 35 months, 3 – 4 years), one session each per weekday, 8:30am – 4:30pm (half days are an
-- option at checkout). Every group is full (0 spots) until staff release spots in Admin → Yalla
-- Flex; to start, 20 – 35 months has 1 spot every Monday – Thursday. Families never see counts.
-- Safe to re-run.
INSERT INTO "programs" ("id", "slug", "name", "kind", "tagline", "location_id", "min_age_months", "max_age_months", "parent_presence", "booking_unit", "booking_mode", "status", "price_cents", "price_unit", "default_capacity")
SELECT gen_random_uuid()::text, 'yalla-flex', 'Yalla Flex', 'drop_in', 'Childcare and coworking by the day, when a spot opens',
       (SELECT "id" FROM "locations" WHERE "active" ORDER BY "name" LIMIT 1), 4, 59, 'required', 'per_child', 'instant', 'published', 15000, 'session', 0
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "programs" SET "min_age_months" = 4, "max_age_months" = 59, "show_remaining" = false, "waitlist_enabled" = false, "low_availability_threshold" = 0
WHERE "slug" = 'yalla-flex';
--> statement-breakpoint
INSERT INTO "settings" ("key", "value") VALUES ('flex.weeklyVacancies', '{"seedlings":[0,0,0,0,0],"saplings":[0,0,0,0,0],"sprouts":[1,1,1,1,0],"wildflowers":[0,0,0,0,0]}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- Earlier Flex days (one per cohort, open to anyone) are replaced by the age-group days below,
-- unless someone has already booked them.
UPDATE "sessions" SET "status" = 'cancelled'
WHERE "program_id" IN (SELECT "id" FROM "programs" WHERE "slug" = 'yalla-flex')
  AND "min_age_months" IS NULL
  AND "local_date" >= (now() AT TIME ZONE 'America/Los_Angeles')::date
  AND NOT EXISTS (SELECT 1 FROM "booking_items" "bi" WHERE "bi"."session_id" = "sessions"."id" AND "bi"."status" IN ('held', 'confirmed'));
--> statement-breakpoint
-- Any earlier Flex days that do have bookings keep them but take no more.
UPDATE "sessions" SET "capacity" = (SELECT count(*) FROM "booking_items" "bi" WHERE "bi"."session_id" = "sessions"."id" AND "bi"."status" IN ('held', 'confirmed')), "hard_capacity" = NULL
WHERE "program_id" IN (SELECT "id" FROM "programs" WHERE "slug" = 'yalla-flex')
  AND "min_age_months" IS NULL AND "status" = 'scheduled'
  AND "local_date" >= (now() AT TIME ZONE 'America/Los_Angeles')::date;
--> statement-breakpoint
WITH "p" AS (
  SELECT "id", "location_id" FROM "programs" WHERE "slug" = 'yalla-flex'
),
"g" ("title", "min_m", "max_m", "price") AS (
  VALUES
    ('Yalla Flex · 4 – 12 months', 4, 11, 18000),
    ('Yalla Flex · 12 – 20 months', 12, 19, 16000),
    ('Yalla Flex · 20 – 35 months', 20, 35, 15000),
    ('Yalla Flex · 3 – 4 years', 36, 59, 15000)
),
"d" AS (
  SELECT "day"::date AS "day"
  FROM generate_series((now() AT TIME ZONE 'America/Los_Angeles')::date, (now() AT TIME ZONE 'America/Los_Angeles')::date + 111, INTERVAL '1 day') AS "day"
  WHERE EXTRACT(ISODOW FROM "day") BETWEEN 1 AND 5
)
INSERT INTO "sessions" ("id", "program_id", "title", "local_date", "starts_at", "ends_at", "capacity", "location_id", "min_age_months", "max_age_months", "price_cents")
SELECT gen_random_uuid()::text, "p"."id", "g"."title", "d"."day",
       ("d"."day" + TIME '08:30') AT TIME ZONE 'America/Los_Angeles',
       ("d"."day" + TIME '16:30') AT TIME ZONE 'America/Los_Angeles',
       CASE WHEN "g"."min_m" = 20 AND EXTRACT(ISODOW FROM "d"."day") BETWEEN 1 AND 4 THEN 1 ELSE 0 END,
       "p"."location_id", "g"."min_m", "g"."max_m", "g"."price"
FROM "p", "g", "d"
WHERE NOT EXISTS (
  SELECT 1 FROM "sessions" "s"
  WHERE "s"."program_id" = "p"."id" AND "s"."local_date" = "d"."day" AND "s"."min_age_months" = "g"."min_m"
);
