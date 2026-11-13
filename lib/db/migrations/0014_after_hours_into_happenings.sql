-- Yalla After Hours becomes After Hours Evenings, one of Yalla Happenings. It keeps its kind
-- (parents_night), so the sibling family rate, sessions, prices and bookings are unchanged; only
-- names change. Yalla Celebrations is paused for now (not deleted), so it can return later.
-- Safe to run on any database and more than once.

UPDATE "programs"
SET "name" = 'After Hours Evenings', "tagline" = 'An evening of play for them, a night out for you', "updated_at" = now()
WHERE "slug" = 'yalla-after-hours' AND "name" <> 'After Hours Evenings';
--> statement-breakpoint
UPDATE "sessions" "s"
SET "title" = replace("s"."title", 'Yalla After Hours · ', 'After Hours · '), "updated_at" = now()
FROM "programs" "p"
WHERE "p"."id" = "s"."program_id" AND "p"."slug" = 'yalla-after-hours' AND "s"."title" LIKE 'Yalla After Hours · %';
--> statement-breakpoint
UPDATE "schedule_series" "x"
SET "title" = replace("x"."title", 'Yalla After Hours · ', 'After Hours · ')
FROM "programs" "p"
WHERE "p"."id" = "x"."program_id" AND "p"."slug" = 'yalla-after-hours' AND "x"."title" LIKE 'Yalla After Hours · %';
--> statement-breakpoint
UPDATE "programs"
SET "status" = 'paused', "updated_at" = now()
WHERE "slug" = 'yalla-celebrations' AND "status" = 'published';
