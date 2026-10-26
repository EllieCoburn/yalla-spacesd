ALTER TABLE "schedule_series" ADD COLUMN "month_week" integer;--> statement-breakpoint
ALTER TABLE "schedule_series" ADD COLUMN "min_age_months" integer;--> statement-breakpoint
ALTER TABLE "schedule_series" ADD COLUMN "max_age_months" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "min_age_months" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "max_age_months" integer;