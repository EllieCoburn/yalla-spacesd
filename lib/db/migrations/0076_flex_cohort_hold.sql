-- Yalla Flex cohort hold: staff can keep a longtime drop-in child in one Flex cohort (e.g. Seedlings)
-- regardless of age, until they release it. See lib/booking/flex-hold.ts.
ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "flex_hold" text;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "flex_hold_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "flex_hold_set_by" text;
