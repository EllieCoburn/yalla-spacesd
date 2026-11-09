-- Camp Yalla 2026–27: the confirmed camp days are Nov 11 and 25; Dec 21, 22, 23, 28, 29 and 30;
-- Jan 18; and Feb 15. Friday Nov 27 is no longer a camp day: its sessions are cancelled, but only
-- where nobody holds a booking for them (anything booked is left for staff to resolve).
-- Safe to run on any database: days are added only where missing, and the cancel is idempotent.

UPDATE "sessions" "s"
SET "status" = 'cancelled', "updated_at" = now()
FROM "programs" "p"
WHERE "p"."id" = "s"."program_id" AND "p"."slug" = 'camp-yalla'
  AND "s"."local_date" = DATE '2026-11-27' AND "s"."status" <> 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM "booking_items" "i" WHERE "i"."session_id" = "s"."id" AND "i"."status" IN ('held', 'confirmed')
  );
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
    (DATE '2026-11-11'), (DATE '2026-11-25'),
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
