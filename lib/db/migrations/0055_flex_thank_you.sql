ALTER TABLE "discounts" ADD COLUMN "once_per_family" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "flex_thank_you_sent_at" timestamp with time zone;