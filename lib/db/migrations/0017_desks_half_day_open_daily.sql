-- Private desks can be booked for a half day (8:30am – 12:00pm) at $18, alongside full day and week.
-- Coworking is open every day 8:30am – 4:30pm, and a week is five days in a row from any start day.
-- Safe to run on any database and more than once.

UPDATE "workspaces"
SET "booking_types" = array_append("booking_types", 'half_day')
WHERE "category" = 'private_desk' AND NOT ('half_day' = ANY("booking_types"));
--> statement-breakpoint
INSERT INTO "workspace_rates" ("id", "category", "booking_type", "price_cents", "effective_from", "created_by")
SELECT gen_random_uuid()::text, 'private_desk', 'half_day', 1800, DATE '2026-11-01', 'Yalla rates (half-day desks)'
WHERE NOT EXISTS (SELECT 1 FROM "workspace_rates" WHERE "category" = 'private_desk' AND "booking_type" = 'half_day');
--> statement-breakpoint
-- If the settings were saved in admin, apply the new opening days and week rule there too.
UPDATE "settings"
SET "value" = jsonb_set(
  jsonb_set("value"::jsonb, '{hours}', '{"0":["08:30","16:30"],"1":["08:30","16:30"],"2":["08:30","16:30"],"3":["08:30","16:30"],"4":["08:30","16:30"],"5":["08:30","16:30"],"6":["08:30","16:30"]}'::jsonb),
  '{week}', '{"mode":"rolling","days":5}'::jsonb)
WHERE "key" = 'spaces.config';
