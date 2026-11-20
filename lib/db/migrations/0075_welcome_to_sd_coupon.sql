-- WELCOMETOSD: 15% off Yalla Flex days, for guests of our friends at My SD Rental (codes aren't
-- case-sensitive).
INSERT INTO "discounts" ("id", "code", "name", "kind", "value", "program_id", "active")
SELECT gen_random_uuid()::text, 'WELCOMETOSD', 'My SD Rental guests: 15% off Yalla Flex', 'percent', 15, p."id", true
FROM "programs" p WHERE p."slug" = 'yalla-flex'
ON CONFLICT ("code") DO NOTHING;
