CREATE TABLE "waitlist_chains" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"spots" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"next_handoff_at" timestamp with time zone,
	"closes_at" timestamp with time zone NOT NULL,
	"booked_booking_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "waitlist_chain_id" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "chain_id" text;--> statement-breakpoint
ALTER TABLE "waitlist_chains" ADD CONSTRAINT "waitlist_chains_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_chains_session_idx" ON "waitlist_chains" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "waitlist_chains_status_idx" ON "waitlist_chains" USING btree ("status");