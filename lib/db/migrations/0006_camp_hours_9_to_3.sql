-- Camp Yalla runs 9:00am–3:00pm (the late stay extra covers 3:00–4:30pm). Moves camp days that
-- 0005 created with a 4:00pm end to 3:00pm. Only touches Camp Yalla sessions still ending at 4:00pm.
UPDATE "sessions" SET "ends_at" = ("local_date" + TIME '15:00') AT TIME ZONE 'America/Los_Angeles', "updated_at" = now()
WHERE "program_id" IN (SELECT "id" FROM "programs" WHERE "slug" = 'camp-yalla')
  AND "ends_at" = ("local_date" + TIME '16:00') AT TIME ZONE 'America/Los_Angeles';
