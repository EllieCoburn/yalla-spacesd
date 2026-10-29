-- Book a Space: the six reservable workspaces and the rates Yalla supplied.
-- Safe to run on any database: workspaces are added only if their slug doesn't exist, and rates
-- only if that workspace/category has no rate for that booking type yet.

INSERT INTO "workspaces" ("id", "slug", "name", "category", "summary", "display_order", "booking_types", "complimentary_eligible")
VALUES
  (gen_random_uuid()::text, 'jane', 'Jane', 'private_office', 'A fully private office.', 1, ARRAY['complimentary','half_day','full_day','week'], true),
  (gen_random_uuid()::text, 'frida', 'Frida', 'private_office', 'A fully private office.', 2, ARRAY['half_day','full_day','week'], false),
  (gen_random_uuid()::text, 'maya', 'Maya', 'phone_booth', 'A phone booth for calls, virtual meetings and quiet conversations.', 3, ARRAY['complimentary'], true),
  (gen_random_uuid()::text, 'zora', 'Zora', 'private_desk', 'A private desk.', 4, ARRAY['full_day','week'], false),
  (gen_random_uuid()::text, 'rosa', 'Rosa', 'private_desk', 'A private desk.', 5, ARRAY['full_day','week'], false),
  (gen_random_uuid()::text, 'maria', 'Maria', 'private_desk', 'A private desk.', 6, ARRAY['full_day','week'], false)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "workspace_rates" ("id", "category", "booking_type", "price_cents", "effective_from", "created_by")
SELECT gen_random_uuid()::text, r.category, r.booking_type, r.price_cents, DATE '2026-10-01', 'Initial rates'
FROM (VALUES
  ('private_office', 'half_day', 3000),
  ('private_office', 'full_day', 5500),
  ('private_office', 'week', 27000),
  ('private_desk', 'full_day', 3500),
  ('private_desk', 'week', 15000)
) AS r (category, booking_type, price_cents)
WHERE NOT EXISTS (
  SELECT 1 FROM "workspace_rates" w WHERE w.category = r.category AND w.booking_type = r.booking_type
);
--> statement-breakpoint
-- Operations staff can see and manage workspace reservations (owners always hold every permission).
UPDATE "roles"
SET "permissions" = "permissions" || ARRAY['spaces.view', 'spaces.manage']::text[]
WHERE "key" = 'operations' AND NOT ("permissions" @> ARRAY['spaces.view']::text[]);
