-- After Hours Evenings: the same age groups and sizes as Weekend Play Sessions (0069).
--   18 months – 3 years: up to 16   (was 18 months – 4 years, 8)
--   4 – 7 years:         up to 10   (was 4 – 6 years, 8)
--   8 – 10 years:        up to 10   (was 7 – 10 years, 10)
-- So each evening holds at most 36 children. Changes the schedule and every session from today on;
-- past sessions and existing bookings are left as they are. Only rows still on the original setup are
-- touched, so groups already edited in Admin keep their settings. Safe to run more than once.
WITH "g" ("old_min", "old_max", "old_label", "new_min", "new_max", "new_label", "cap") AS (
  VALUES (18, 47, '18 months – 4 years', 18, 47, '18 months – 3 years', 16),
         (48, 83, '4 – 6 years', 48, 95, '4 – 7 years', 10),
         (84, 131, '7 – 10 years', 96, 131, '8 – 10 years', 10)
)
UPDATE "schedule_series" "x"
SET "title" = replace("x"."title", "g"."old_label", "g"."new_label"), "min_age_months" = "g"."new_min", "max_age_months" = "g"."new_max",
    "capacity" = "g"."cap", "hard_capacity" = "g"."cap"
FROM "programs" "p", "g"
WHERE "p"."id" = "x"."program_id" AND "p"."slug" = 'yalla-after-hours'
  AND "x"."min_age_months" = "g"."old_min" AND "x"."max_age_months" = "g"."old_max" AND "x"."title" LIKE '%' || "g"."old_label";
--> statement-breakpoint
WITH "g" ("old_min", "old_max", "old_label", "new_min", "new_max", "new_label", "cap") AS (
  VALUES (18, 47, '18 months – 4 years', 18, 47, '18 months – 3 years', 16),
         (48, 83, '4 – 6 years', 48, 95, '4 – 7 years', 10),
         (84, 131, '7 – 10 years', 96, 131, '8 – 10 years', 10)
)
UPDATE "sessions" "s"
SET "title" = replace("s"."title", "g"."old_label", "g"."new_label"), "min_age_months" = "g"."new_min", "max_age_months" = "g"."new_max",
    "capacity" = "g"."cap", "hard_capacity" = "g"."cap", "updated_at" = now()
FROM "programs" "p", "g"
WHERE "p"."id" = "s"."program_id" AND "p"."slug" = 'yalla-after-hours'
  AND "s"."local_date" >= (now() AT TIME ZONE 'America/Los_Angeles')::date
  AND "s"."min_age_months" = "g"."old_min" AND "s"."max_age_months" = "g"."old_max" AND "s"."title" LIKE '%' || "g"."old_label";
--> statement-breakpoint
UPDATE "programs" SET "default_capacity" = 36, "updated_at" = now() WHERE "slug" = 'yalla-after-hours' AND "default_capacity" = 26;
