CREATE TABLE "cancellation_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"booking_id" text,
	"space_group_id" text,
	"item_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text NOT NULL,
	"reason" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"bonus_percent" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"credited_cents" integer,
	"refunded_cents" integer,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "late_fees" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"child_id" text NOT NULL,
	"session_id" text NOT NULL,
	"minutes_late" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"invoice_id" text,
	"status" text DEFAULT 'charged' NOT NULL,
	"waived_by" text,
	"waived_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD COLUMN "cancel_effective_on" date;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD COLUMN "final_charge_cents" integer;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD COLUMN "downgrade_effective_on" date;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD COLUMN "pause_starts_on" date;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD COLUMN "resume_on" date;--> statement-breakpoint
ALTER TABLE "wallet_reservations" ADD COLUMN "credit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cancellation_offers" ADD CONSTRAINT "cancellation_offers_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_offers" ADD CONSTRAINT "cancellation_offers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fees" ADD CONSTRAINT "late_fees_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fees" ADD CONSTRAINT "late_fees_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fees" ADD CONSTRAINT "late_fees_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fees" ADD CONSTRAINT "late_fees_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cancellation_offers_family_idx" ON "cancellation_offers" USING btree ("family_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "late_fees_child_session_idx" ON "late_fees" USING btree ("child_id","session_id");