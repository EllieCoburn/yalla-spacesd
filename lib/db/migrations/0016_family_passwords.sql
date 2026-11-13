ALTER TABLE "guardians" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "failed_logins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "locked_until" timestamp with time zone;