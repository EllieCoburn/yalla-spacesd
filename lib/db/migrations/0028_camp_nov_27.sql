-- Camp Yalla runs Friday, November 27, 2026. Its three age groups are reopened if they exist but
-- were cancelled or closed, and created if they're missing (an earlier update skipped the day
-- because cancelled sessions were in the way). Safe to re-run.
UPDATE "sessions" SET
  "status" = 'scheduled',
  "notes" = NULL,
  "title" = CASE "min_age_months" WHEN 18 THEN 'Camp Yalla · 18 months – 3 years' WHEN 48 THEN 'Camp Yalla · 4 – 6 years' ELSE 'Camp Yalla · 7 – 10 years' END,
  "capacity" = CASE "min_age_months" WHEN 18 THEN 16 ELSE 10 END,
  "hard_capacity" = CASE "min_age_months" WHEN 18 THEN 16 ELSE 10 END,
  "starts_at" = (DATE '2026-11-27' + TIME '09:00') AT TIME ZONE 'America/Los_Angeles',
  "ends_at" = (DATE '2026-11-27' + TIME '15:00') AT TIME ZONE 'America/Los_Angeles'
WHERE "program_id" IN (SELECT "id" FROM "programs" WHERE "slug" = 'camp-yalla')
  AND "local_date" = DATE '2026-11-27'
  AND "min_age_months" IN (18, 48, 84)
  AND "status" IN ('cancelled', 'closed');
--> statement-breakpoint
WITH "p" AS (
  SELECT "id", "location_id" FROM "programs" WHERE "slug" = 'camp-yalla'
),
"g" ("title", "min_m", "max_m", "cap") AS (
  VALUES
    ('Camp Yalla · 18 months – 3 years', 18, 47, 16),
    ('Camp Yalla · 4 – 6 years', 48, 83, 10),
    ('Camp Yalla · 7 – 10 years', 84, 131, 10)
)
INSERT INTO "sessions" ("id", "program_id", "title", "local_date", "starts_at", "ends_at", "capacity", "hard_capacity", "location_id", "min_age_months", "max_age_months", "price_cents")
SELECT gen_random_uuid()::text, "p"."id", "g"."title", DATE '2026-11-27',
       (DATE '2026-11-27' + TIME '09:00') AT TIME ZONE 'America/Los_Angeles',
       (DATE '2026-11-27' + TIME '15:00') AT TIME ZONE 'America/Los_Angeles',
       "g"."cap", "g"."cap", "p"."location_id", "g"."min_m", "g"."max_m", 16000
FROM "p", "g"
WHERE NOT EXISTS (
  SELECT 1 FROM "sessions" "s"
  WHERE "s"."program_id" = "p"."id" AND "s"."local_date" = DATE '2026-11-27' AND "s"."min_age_months" = "g"."min_m"
);
