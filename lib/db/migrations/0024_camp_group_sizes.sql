-- Camp Yalla age groups: 18 months – 3 years (up to 16 children), 4 – 6 years (up to 10) and
-- 7 – 10 years (up to 10). "Almost full" shows when a group has 5 or fewer places left; families
-- never see counts. Also adds Friday, November 27, 2026 as a camp day. Safe to re-run: a day's
-- group is added only if that day doesn't have it yet.
UPDATE "programs" SET "low_availability_threshold" = 5, "show_remaining" = false WHERE "kind" = 'camp';
--> statement-breakpoint
UPDATE "sessions" SET "capacity" = 16, "hard_capacity" = 16, "title" = replace("title", '18 months – 4 years', '18 months – 3 years')
WHERE "min_age_months" = 18 AND "program_id" IN (SELECT "id" FROM "programs" WHERE "kind" = 'camp');
--> statement-breakpoint
UPDATE "sessions" SET "capacity" = 10, "hard_capacity" = 10
WHERE "min_age_months" IN (48, 84) AND "program_id" IN (SELECT "id" FROM "programs" WHERE "kind" = 'camp');
--> statement-breakpoint
WITH "p" AS (
  SELECT "id", "location_id" FROM "programs" WHERE "slug" = 'camp-yalla'
),
"g" ("title", "min_m", "max_m", "cap") AS (
  VALUES
    ('Camp Yalla · 18 months – 3 years', 18, 47, 16),
    ('Camp Yalla · 4 – 6 years', 48, 83, 10),
    ('Camp Yalla · 7 – 10 years', 84, 131, 10)
),
"d" ("day") AS (
  VALUES (DATE '2026-11-27')
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
