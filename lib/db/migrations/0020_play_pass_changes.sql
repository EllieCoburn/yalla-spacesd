ALTER TABLE "play_pass_charges" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "play_pass_charges" ADD COLUMN "allocation_cents" integer;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD COLUMN "pause_applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD COLUMN "final_price_set" boolean DEFAULT false NOT NULL;