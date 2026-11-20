-- FRIENDOFYALLA: 25% off Yalla Flex days (codes aren't case-sensitive).
INSERT INTO "discounts" ("id", "code", "name", "kind", "value", "program_id", "active")
SELECT gen_random_uuid()::text, 'FRIENDOFYALLA', 'Friend of Yalla: 25% off Yalla Flex', 'percent', 25, p."id", true
FROM "programs" p WHERE p."slug" = 'yalla-flex'
ON CONFLICT ("code") DO NOTHING;
