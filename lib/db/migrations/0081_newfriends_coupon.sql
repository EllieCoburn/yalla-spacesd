-- Coupon codes can be limited to a family's first booking of the programs they cover.
ALTER TABLE "discounts" ADD COLUMN IF NOT EXISTS "first_booking_only" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- NEWFRIENDS: 15% off a family's first Yalla Flex or Camp Yalla booking, once per family (codes
-- aren't case-sensitive). Safe to re-run.
INSERT INTO "discounts" ("id", "code", "name", "kind", "value", "program_id", "program_ids", "active", "once_per_family", "first_booking_only")
SELECT gen_random_uuid()::text, 'NEWFRIENDS', 'New friends: 15% off a first Yalla Flex or Camp Yalla booking', 'percent', 15, NULL,
       ARRAY(SELECT "id" FROM "programs" WHERE "slug" IN ('yalla-flex', 'camp-yalla') ORDER BY "slug"), true, true, true
WHERE (SELECT count(*) FROM "programs" WHERE "slug" IN ('yalla-flex', 'camp-yalla')) = 2
ON CONFLICT ("code") DO NOTHING;
