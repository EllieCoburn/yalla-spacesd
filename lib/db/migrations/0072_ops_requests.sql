-- Club Yalla operations lists: supplies to buy and maintenance to fix (Admin → Club Yalla operations).
CREATE TABLE IF NOT EXISTS "ops_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"quantity" text,
	"location" text,
	"notes" text,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"status" text NOT NULL,
	"created_by_id" text,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_name" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_requests_kind_idx" ON "ops_requests" USING btree ("kind","status");