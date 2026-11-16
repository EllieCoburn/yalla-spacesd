CREATE TABLE "rate_events" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_events_lookup_idx" ON "rate_events" USING btree ("bucket","key_hash","created_at");