ALTER TABLE "staff_users" ADD COLUMN "notices" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "flex_cohorts" text[] DEFAULT '{}'::text[] NOT NULL;