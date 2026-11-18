-- When a family's Camp Yalla first-day welcome went out (once per family; see lib/ops/camp-welcome.ts).
ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "camp_welcome_sent_at" timestamp with time zone;
