-- Immersive Play Sessions move to the 3rd and 4th Saturdays of the month, so they never share a
-- Saturday with Weekend Play Sessions (1st and 2nd Saturdays). Safe to re-run.
--
-- 1. The "First Saturday" series becomes the "Fourth Saturday" series (the third stays as it is).
UPDATE "schedule_series"
SET "month_week" = 4, "title" = 'Immersive Play Session · Fourth Saturday'
WHERE "program_id" = (SELECT "id" FROM "programs" WHERE "slug" = 'immersive-play')
  AND "month_week" = 1;
--> statement-breakpoint
-- 2. Upcoming first-Saturday sessions are taken off the calendar (cancelled, kept on record), unless a
--    child is booked or a family is waiting: those stay for the team to move or keep.
UPDATE "sessions" "s"
SET "status" = 'cancelled', "notes" = 'Moved: Immersive Play now runs on the 3rd and 4th Saturdays', "updated_at" = now()
WHERE "s"."program_id" = (SELECT "id" FROM "programs" WHERE "slug" = 'immersive-play')
  AND "s"."status" IN ('scheduled', 'closed')
  AND "s"."local_date" >= (now() AT TIME ZONE 'America/Los_Angeles')::date
  AND EXTRACT(DOW FROM "s"."local_date") = 6
  AND (EXTRACT(DAY FROM "s"."local_date")::int - 1) / 7 + 1 = 1
  AND NOT EXISTS (SELECT 1 FROM "booking_items" "bi" WHERE "bi"."session_id" = "s"."id" AND "bi"."status" IN ('confirmed', 'held'))
  AND NOT EXISTS (SELECT 1 FROM "waitlist_entries" "w" WHERE "w"."session_id" = "s"."id" AND "w"."status" IN ('waiting', 'offered'));
--> statement-breakpoint
-- 3. A session on every upcoming 4th Saturday through 2027 (9:00am – 12:00pm, 12 spots, ages 3 – 8,
--    $45), unless one is already there or Weekend Play runs that day. Closed where a closure covers it.
WITH "d" AS (
  SELECT "day"::date AS "day"
  FROM generate_series((now() AT TIME ZONE 'America/Los_Angeles')::date, DATE '2027-12-31', INTERVAL '1 day') AS "day"
  WHERE EXTRACT(DOW FROM "day") = 6 AND (EXTRACT(DAY FROM "day")::int - 1) / 7 + 1 = 4
)
INSERT INTO "sessions" ("id", "program_id", "series_id", "title", "local_date", "starts_at", "ends_at", "capacity", "hard_capacity",
  "location_id", "min_age_months", "max_age_months", "price_cents", "status", "notes")
SELECT gen_random_uuid()::text, "p"."id", "x"."id", 'Immersive Play Session', "d"."day",
  ("d"."day" + TIME '09:00') AT TIME ZONE 'America/Los_Angeles',
  ("d"."day" + TIME '12:00') AT TIME ZONE 'America/Los_Angeles',
  12, 12, "p"."location_id", 36, 107, 4500,
  CASE WHEN "b"."reason" IS NULL THEN 'scheduled' ELSE 'closed' END,
  CASE WHEN "b"."reason" IS NULL THEN NULL ELSE 'Closed: ' || "b"."reason" END
FROM "programs" "p"
JOIN "schedule_series" "x" ON "x"."program_id" = "p"."id" AND "x"."month_week" = 4
CROSS JOIN "d"
LEFT JOIN LATERAL (
  SELECT "bd"."reason" FROM "blackout_dates" "bd"
  WHERE "d"."day" BETWEEN "bd"."starts_on" AND "bd"."ends_on"
    AND ("bd"."program_id" IS NULL OR "bd"."program_id" = "p"."id")
    AND ("bd"."location_id" IS NULL OR "bd"."location_id" = "p"."location_id")
  LIMIT 1
) "b" ON true
WHERE "p"."slug" = 'immersive-play'
  AND NOT EXISTS (SELECT 1 FROM "sessions" "s" WHERE "s"."program_id" = "p"."id" AND "s"."local_date" = "d"."day")
  AND NOT EXISTS (
    SELECT 1 FROM "sessions" "w" JOIN "programs" "wp" ON "wp"."id" = "w"."program_id"
    WHERE "wp"."slug" = 'yalla-weekends' AND "w"."local_date" = "d"."day" AND "w"."status" <> 'cancelled'
  );
