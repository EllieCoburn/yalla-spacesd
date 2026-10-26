-- Yalla Weekends: the first and second Saturday of every month, an AM play session (9:00am–12:00pm)
-- and a PM play session (1:00–4:00pm), each in three age groups: 18 months – 4 years (8),
-- 4 – 7 years (12) and 7 – 10 years (14). $60 per child per session.
-- Safe to run on any database: the program is created only if missing, and the schedule only if
-- the program has no monthly schedule yet.

INSERT INTO "programs" ("id", "slug", "name", "kind", "tagline", "location_id", "min_age_months", "max_age_months", "parent_presence", "booking_unit", "booking_mode", "status", "price_cents", "price_unit", "default_capacity")
SELECT gen_random_uuid()::text, 'yalla-weekends', 'Yalla Weekends', 'weekend', 'A little room in your weekend',
       (SELECT "id" FROM "locations" WHERE "active" ORDER BY "name" LIMIT 1), 18, 131, 'not_required', 'per_child', 'instant', 'published', 6000, 'session', 34
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
WITH "p" AS (
  SELECT "id", "location_id" FROM "programs" WHERE "slug" = 'yalla-weekends'
),
"g" ("label", "min_m", "max_m", "cap") AS (
  VALUES ('18 months – 4 years', 18, 47, 8), ('4 – 7 years', 48, 83, 12), ('7 – 10 years', 84, 131, 14)
),
"blk" ("name", "start_t", "end_t") AS (
  VALUES ('AM play session', '09:00', '12:00'), ('PM play session', '13:00', '16:00')
),
"wk" ("n") AS (VALUES (1), (2)),
"new_series" AS (
  INSERT INTO "schedule_series" ("id", "program_id", "title", "weekdays", "month_week", "start_time", "end_time", "starts_on", "ends_on", "capacity", "hard_capacity", "location_id", "min_age_months", "max_age_months", "price_cents")
  SELECT gen_random_uuid()::text, "p"."id", 'Yalla Weekends · ' || "blk"."name" || ' · ' || "g"."label", ARRAY[6], "wk"."n", "blk"."start_t", "blk"."end_t",
         DATE '2026-11-01', DATE '2027-10-31', "g"."cap", "g"."cap", "p"."location_id", "g"."min_m", "g"."max_m", 6000
  FROM "p", "g", "blk", "wk"
  WHERE NOT EXISTS (SELECT 1 FROM "schedule_series" "s" WHERE "s"."program_id" = "p"."id" AND "s"."month_week" IS NOT NULL)
  RETURNING *
),
"days" AS (
  -- The first and second Saturday of each month, November 2026 to October 2027.
  SELECT "w"."n", ("m" + (((6 - EXTRACT(DOW FROM "m")::int) + 7) % 7 + ("w"."n" - 1) * 7) * INTERVAL '1 day')::date AS "day"
  FROM generate_series(DATE '2026-11-01', DATE '2027-10-01', INTERVAL '1 month') AS "m", "wk" "w"
)
INSERT INTO "sessions" ("id", "program_id", "series_id", "title", "local_date", "starts_at", "ends_at", "capacity", "hard_capacity", "location_id", "min_age_months", "max_age_months", "price_cents")
SELECT gen_random_uuid()::text, "s"."program_id", "s"."id", "s"."title", "d"."day",
       ("d"."day" + "s"."start_time"::time) AT TIME ZONE 'America/Los_Angeles',
       ("d"."day" + "s"."end_time"::time) AT TIME ZONE 'America/Los_Angeles',
       "s"."capacity", "s"."hard_capacity", "s"."location_id", "s"."min_age_months", "s"."max_age_months", "s"."price_cents"
FROM "new_series" "s" JOIN "days" "d" ON "d"."n" = "s"."month_week";
