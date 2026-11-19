-- A coupon code can now cover several programs (discounts.program_ids), not just one.
ALTER TABLE "discounts" ADD COLUMN IF NOT EXISTS "program_ids" text[];
--> statement-breakpoint
-- PHOENIXHOUSEFAM: 50% off Yalla Flex days and Camp Yalla (codes aren't case-sensitive).
INSERT INTO "discounts" ("id", "code", "name", "kind", "value", "program_id", "program_ids", "active")
SELECT gen_random_uuid()::text, 'PHOENIXHOUSEFAM', 'Phoenix House families: 50% off Yalla Flex and Camp Yalla', 'percent', 50, NULL,
       ARRAY(SELECT "id" FROM "programs" WHERE "slug" IN ('yalla-flex', 'camp-yalla') ORDER BY "slug"), true
WHERE (SELECT count(*) FROM "programs" WHERE "slug" IN ('yalla-flex', 'camp-yalla')) = 2
ON CONFLICT ("code") DO NOTHING;
