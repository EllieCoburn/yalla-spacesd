-- Camp Yalla: confirmed camp days, 9:00am–3:00pm, in three age groups (18 months – 4 years,
-- 4 – 6 years, 7 – 10 years). $160 per child per day; Early Bird ($20) and late stay 3:00–4:30pm ($30)
-- are optional per-child extras (lib/booking/addons.ts). Days are booked individually.
-- Safe to run on any database: the program is created only if missing, and a day's group
-- is added only if that program has no session for that date and age group yet.

INSERT INTO "programs" ("id", "slug", "name", "kind", "tagline", "location_id", "min_age_months", "max_age_months", "parent_presence", "booking_unit", "booking_mode", "series_mode", "status", "price_cents", "price_unit", "default_capacity")
SELECT gen_random_uuid()::text, 'camp-yalla', 'Camp Yalla', 'camp', 'Seasonal adventures for children',
       (SELECT "id" FROM "locations" WHERE "active" ORDER BY "name" LIMIT 1), 18, 131, 'not_required', 'per_child', 'instant', 'individual', 'published', 16000, 'session', 26
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
WITH "p" AS (
  SELECT "id", "location_id" FROM "programs" WHERE "slug" = 'camp-yalla'
),
"g" ("title", "min_m", "max_m", "cap") AS (
  VALUES
    ('Camp Yalla · 18 months – 4 years', 18, 47, 8),
    ('Camp Yalla · 4 – 6 years', 48, 83, 8),
    ('Camp Yalla · 7 – 10 years', 84, 131, 10)
),
"d" ("day") AS (
  VALUES
    (DATE '2026-11-11'), (DATE '2026-11-25'), (DATE '2026-11-27'),
    (DATE '2026-12-21'), (DATE '2026-12-22'), (DATE '2026-12-23'),
    (DATE '2026-12-28'), (DATE '2026-12-29'), (DATE '2026-12-30'),
    (DATE '2027-01-18'), (DATE '2027-02-15')
)
INSERT INTO "sessions" ("id", "program_id", "title", "local_date", "starts_at", "ends_at", "capacity", "hard_capacity", "location_id", "min_age_months", "max_age_months", "price_cents")
SELECT gen_random_uuid()::text, "p"."id", "g"."title", "d"."day",
       ("d"."day" + TIME '09:00') AT TIME ZONE 'America/Los_Angeles',
       ("d"."day" + TIME '15:00') AT TIME ZONE 'America/Los_Angeles',
       "g"."cap", "g"."cap", "p"."location_id", "g"."min_m", "g"."max_m", 16000
FROM "p", "g", "d"
WHERE NOT EXISTS (
  SELECT 1 FROM "sessions" "s"
  WHERE "s"."program_id" = "p"."id" AND "s"."local_date" = "d"."day" AND "s"."min_age_months" = "g"."min_m"
);
