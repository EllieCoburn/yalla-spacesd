-- Yalla Flex standing vacancies for Wildflowers (3 – 4 years): Monday 1, Tuesday 3, Wednesday 1,
-- Thursday 3, Friday 1. Upcoming days change by the difference from the previous weekly numbers,
-- keeping any single-day releases and never dropping below what's already booked. Closure days stay
-- closed. Same as saving the numbers in Admin → Yalla Flex spots.
WITH "old" AS (
  SELECT COALESCE((SELECT "value"->'wildflowers' FROM "settings" WHERE "key" = 'flex.weeklyVacancies'), '[0,0,0,0,0]'::jsonb) AS "w"
),
"new" ("dow", "n") AS (VALUES (1, 1), (2, 3), (3, 1), (4, 3), (5, 1))
UPDATE "sessions" "s"
SET "capacity" = GREATEST(
  "s"."capacity" - COALESCE(("old"."w"->>("new"."dow" - 1))::int, 0) + "new"."n",
  (SELECT count(*) FROM "booking_items" "bi" WHERE "bi"."session_id" = "s"."id" AND "bi"."status" IN ('held', 'confirmed')),
  0
)
FROM "old", "new"
WHERE "s"."program_id" IN (SELECT "id" FROM "programs" WHERE "slug" = 'yalla-flex')
  AND "s"."min_age_months" = 36
  AND "s"."local_date" >= (now() AT TIME ZONE 'America/Los_Angeles')::date
  AND EXTRACT(ISODOW FROM "s"."local_date") = "new"."dow";
--> statement-breakpoint
INSERT INTO "settings" ("key", "value", "updated_by")
VALUES ('flex.weeklyVacancies', '{"seedlings":[0,0,0,0,0],"saplings":[0,0,0,0,0],"sprouts":[1,1,1,1,0],"wildflowers":[1,3,1,3,1]}'::jsonb, 'Weekly vacancies update')
ON CONFLICT ("key") DO UPDATE SET "value" = jsonb_set("settings"."value", '{wildflowers}', '[1,3,1,3,1]'::jsonb), "updated_at" = now(), "updated_by" = 'Weekly vacancies update';
