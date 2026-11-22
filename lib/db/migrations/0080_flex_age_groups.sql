-- Yalla Flex age groups change (November 2026):
--   Seedlings   4 – 12 months (4–11)   →  4 – 14 months  (4–13)
--   Saplings   12 – 20 months (12–19)  → 14 – 23 months (14–23)
--   Sprouts    20 – 35 months (20–35)  → 24 – 35 months (24–35)
--   Wildflowers 3 – 4 years (36–59)       unchanged
-- Matches lib/booking/flex.ts. Club Yalla cohorts have their own ages and aren't touched.
-- Safe to re-run.
--
-- 1. Flex sessions from today on take the new ages and titles. Past sessions keep the ages they ran
--    with (lib/booking/flex.ts still maps them to the right group). Children already booked stay booked.
UPDATE "sessions" "s"
SET "min_age_months" = "g"."min_age", "max_age_months" = "g"."max_age", "title" = 'Yalla Flex · ' || "g"."label", "updated_at" = now()
FROM (VALUES (4, 4, 13, '4 – 14 months'), (12, 14, 23, '14 – 23 months'), (20, 24, 35, '24 – 35 months')) AS "g" ("old_min", "min_age", "max_age", "label")
WHERE "s"."program_id" = (SELECT "id" FROM "programs" WHERE "slug" = 'yalla-flex')
  AND "s"."min_age_months" = "g"."old_min"
  AND "s"."local_date" >= (now() AT TIME ZONE 'America/Los_Angeles')::date;
--> statement-breakpoint
-- 2. Which Flex admission agreement a child signs follows the new ages.
UPDATE "form_requirements" "r"
SET "min_age_months" = "g"."min_age", "max_age_months" = "g"."max_age"
FROM (VALUES ('flex-agreement-seedlings-req', 4, 13), ('flex-agreement-saplings-req', 14, 23), ('flex-agreement-sprouts-req', 24, 35)) AS "g" ("id", "min_age", "max_age")
WHERE "r"."id" = "g"."id";
--> statement-breakpoint
-- 3. The agreements' names and descriptions.
UPDATE "form_templates"
SET "title" = replace(replace(replace("title", '4 – 12 months', '4 – 14 months'), '12 – 20 months', '14 – 23 months'), '20 – 35 months', '24 – 35 months'),
    "description" = replace(replace(replace("description", '4 – 12 months', '4 – 14 months'), '12 – 20 months', '14 – 23 months'), '20 – 35 months', '24 – 35 months'),
    "updated_at" = now()
WHERE "id" IN ('flex-agreement-seedlings', 'flex-agreement-saplings', 'flex-agreement-sprouts')
  AND ("title" LIKE '%4 – 12 months%' OR "title" LIKE '%12 – 20 months%' OR "title" LIKE '%20 – 35 months%');
--> statement-breakpoint
-- 4. A new version of each agreement with the new ages written in. Only the ages change, so
--    signatures on the earlier version stay valid (requires_resign = false).
WITH "cur" AS (
  SELECT "v".*
  FROM "form_templates" "t"
  JOIN "form_versions" "v" ON "v"."id" = "t"."current_version_id"
  WHERE "t"."id" IN ('flex-agreement-seedlings', 'flex-agreement-saplings', 'flex-agreement-sprouts')
    AND ("v"."body" || coalesce("v"."fields"::text, '')) ~ '(4 – 12 months|12 – 20 months|20 – 35 months)'
),
"nv" AS (
  SELECT
    "cur"."template_id",
    "cur"."version" + 1 AS "version",
    replace(replace(replace("cur"."body", '4 – 12 months', '4 – 14 months'), '12 – 20 months', '14 – 23 months'), '20 – 35 months', '24 – 35 months') AS "body",
    CASE WHEN "cur"."fields" IS NULL THEN NULL
      ELSE replace(replace(replace("cur"."fields"::text, '4 – 12 months', '4 – 14 months'), '12 – 20 months', '14 – 23 months'), '20 – 35 months', '24 – 35 months')::jsonb END AS "fields"
  FROM "cur"
),
"ins" AS (
  INSERT INTO "form_versions" ("id", "template_id", "version", "body", "fields", "content_hash", "requires_resign", "published_by")
  SELECT "nv"."template_id" || '-v' || "nv"."version", "nv"."template_id", "nv"."version", "nv"."body", "nv"."fields",
    encode(sha256(convert_to("nv"."body" || coalesce("nv"."fields"::text, ''), 'UTF8')), 'hex'), false, 'Flex age groups update'
  FROM "nv"
  ON CONFLICT ("id") DO NOTHING
  RETURNING "id", "template_id"
)
UPDATE "form_templates" "t" SET "current_version_id" = "ins"."id", "updated_at" = now()
FROM "ins" WHERE "t"."id" = "ins"."template_id";
