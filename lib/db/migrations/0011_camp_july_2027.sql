-- Camp Yalla: adds Monday, July 5, 2027 as a camp day (three age groups, 9:00am–3:00pm, $160).
-- Safe to run on any database: a group is added only if that day doesn't have it yet.

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
  VALUES (DATE '2027-07-05')
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
