-- Camp Yalla runs Monday, May 31, 2027 (Memorial Day). Its age groups, sizes, hours and price are
-- copied from the most recent camp day already on the schedule, so it matches the current setup.
-- Added only if that day has no camp sessions yet (cancelled ones count, so a day cancelled in Admin
-- stays cancelled). Safe to re-run.
WITH "p" AS (
  SELECT "id" FROM "programs" WHERE "slug" = 'camp-yalla'
),
"model_day" AS (
  SELECT max("s"."local_date") AS "day"
  FROM "sessions" "s", "p"
  WHERE "s"."program_id" = "p"."id" AND "s"."status" = 'scheduled' AND "s"."local_date" <> DATE '2027-05-31'
),
"model" AS (
  SELECT "s".*
  FROM "sessions" "s", "p", "model_day" "m"
  WHERE "s"."program_id" = "p"."id" AND "s"."local_date" = "m"."day" AND "s"."status" = 'scheduled'
)
INSERT INTO "sessions" ("id", "program_id", "title", "local_date", "starts_at", "ends_at", "capacity", "hard_capacity", "location_id", "min_age_months", "max_age_months", "price_cents")
SELECT gen_random_uuid()::text, "x"."program_id", "x"."title", DATE '2027-05-31',
       (DATE '2027-05-31' + ("x"."starts_at" AT TIME ZONE 'America/Los_Angeles')::time) AT TIME ZONE 'America/Los_Angeles',
       (DATE '2027-05-31' + ("x"."ends_at" AT TIME ZONE 'America/Los_Angeles')::time) AT TIME ZONE 'America/Los_Angeles',
       "x"."capacity", "x"."hard_capacity", "x"."location_id", "x"."min_age_months", "x"."max_age_months", "x"."price_cents"
FROM "model" "x"
WHERE NOT EXISTS (
  SELECT 1 FROM "sessions" "s", "p" WHERE "s"."program_id" = "p"."id" AND "s"."local_date" = DATE '2027-05-31'
);
