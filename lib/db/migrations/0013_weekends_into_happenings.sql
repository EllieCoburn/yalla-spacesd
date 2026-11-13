-- Yalla Weekends becomes Weekend Play Sessions, one of Yalla Happenings. Same sessions, times,
-- age groups, prices and bookings; only the program's name, kind and session titles change.
-- Safe to run on any database and more than once.

UPDATE "programs"
SET "name" = 'Weekend Play Sessions', "kind" = 'happening', "tagline" = 'Morning and afternoon play on the weekend', "updated_at" = now()
WHERE "slug" = 'yalla-weekends' AND ("name" <> 'Weekend Play Sessions' OR "kind" <> 'happening');
--> statement-breakpoint
UPDATE "sessions" "s"
SET "title" = replace("s"."title", 'Yalla Weekends · ', 'Weekend Play · '), "updated_at" = now()
FROM "programs" "p"
WHERE "p"."id" = "s"."program_id" AND "p"."slug" = 'yalla-weekends' AND "s"."title" LIKE 'Yalla Weekends · %';
--> statement-breakpoint
UPDATE "schedule_series" "x"
SET "title" = replace("x"."title", 'Yalla Weekends · ', 'Weekend Play · ')
FROM "programs" "p"
WHERE "p"."id" = "x"."program_id" AND "p"."slug" = 'yalla-weekends' AND "x"."title" LIKE 'Yalla Weekends · %';
