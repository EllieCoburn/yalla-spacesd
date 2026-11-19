-- The Club Yalla Operations Director role (lib/auth/flex-club.ts): Club Yalla at a glance, who's coming
-- to Yalla Flex, contact cards, care details and forms for Club Yalla and Flex families only, and the
-- supplies and maintenance lists. No bookings, billing, messages or other programs. Roles are otherwise
-- created only at first setup, so this adds it to existing databases. Safe to run more than once.
INSERT INTO "roles" ("id", "key", "name", "description", "permissions", "is_system")
VALUES (
  gen_random_uuid()::text,
  'club_ops_director',
  'Club Yalla Operations Director',
  'Club Yalla at a glance, who’s coming to Yalla Flex, contact cards, care details and forms for Club Yalla and Flex families only, and the supplies and maintenance lists. No bookings, billing, messages or other programs.',
  ARRAY['flexclub.view', 'ops.lists']::text[],
  false
)
ON CONFLICT ("key") DO NOTHING;
