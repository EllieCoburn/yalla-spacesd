-- A staff role for Yalla Flex & Club Yalla operations (lib/auth/flex-club.ts): who's coming to Flex,
-- Club Yalla at a glance, and contact cards, care details and forms for Flex and Club Yalla families
-- only. No bookings, billing, messages or other programs. Roles are otherwise created only at first
-- setup, so this adds it to existing databases. Safe to run more than once.
INSERT INTO "roles" ("id", "key", "name", "description", "permissions", "is_system")
VALUES (
  gen_random_uuid()::text,
  'flex_club_ops',
  'Flex & Club Yalla operations',
  'Who’s coming to Yalla Flex, Club Yalla at a glance, and contact cards, care details and forms for Flex and Club Yalla families only. No bookings, billing, messages or other programs.',
  ARRAY['flexclub.view']::text[],
  false
)
ON CONFLICT ("key") DO NOTHING;
