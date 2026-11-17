-- Who gets which team emails, and the Cohort team role. Everyone already on the notification
-- addresses (Settings → Notifications) keeps getting exactly what they got before.
INSERT INTO "roles" ("id", "key", "name", "description", "permissions", "is_system")
VALUES (gen_random_uuid()::text, 'cohort_team', 'Cohort team', 'Only the Yalla Flex drop-ins coming to their own cohort, with each child’s allergies and medical notes. Nothing else.', ARRAY['dropins.view'], false)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
UPDATE "roles" SET "permissions" = array_append("permissions", 'dropins.view')
WHERE "key" IN ('operations', 'educator') AND NOT ('dropins.view' = ANY("permissions"));
--> statement-breakpoint
WITH lists AS (
  SELECT
    ',' || regexp_replace(lower(coalesce((SELECT "value" #>> '{}' FROM "settings" WHERE "key" = 'notifications.staffEmails'), 'hello@yallaspacesd.com')), '[,;[:space:]]+', ',', 'g') || ',' AS general,
    ',' || regexp_replace(lower(coalesce((SELECT "value" #>> '{}' FROM "settings" WHERE "key" = 'notifications.membershipEmails'), 'membership@yallaspacesd.com')), '[,;[:space:]]+', ',', 'g') || ',' AS membership
)
UPDATE "staff_users" u SET "notices" =
  (CASE WHEN position(',' || lower(u."email") || ',' IN l.general) > 0 THEN ARRAY['flex','camp','after_hours','happenings','celebrations','spaces','enquiries','families'] ELSE '{}'::text[] END)
  || (CASE WHEN position(',' || lower(u."email") || ',' IN l.membership) > 0 THEN ARRAY['club','playpass'] ELSE '{}'::text[] END)
FROM lists l;
