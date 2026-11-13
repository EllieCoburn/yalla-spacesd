CREATE TABLE "play_pass_charges" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"family_id" text NOT NULL,
	"invoice_ref" text NOT NULL,
	"charge_ref" text,
	"reason" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"period_start" date,
	"failure_reason" text,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_pass_charges_invoice_ref_unique" UNIQUE("invoice_ref")
);
--> statement-breakpoint
CREATE TABLE "play_pass_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"allocation_cents" integer NOT NULL,
	"min_experiences" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"stripe_price_test" text,
	"stripe_price_live" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "play_pass_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"next_plan_id" text,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"checkout_ref" text,
	"customer_ref" text,
	"subscription_ref" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"start_date" date NOT NULL,
	"proration_days" integer NOT NULL,
	"month_days" integer NOT NULL,
	"initial_charge_cents" integer NOT NULL,
	"initial_allocation_cents" integer NOT NULL,
	"next_renewal_on" date,
	"terms_version" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"terms_accepted_by" text NOT NULL,
	"last_payment_failed_at" timestamp with time zone,
	"last_failure_reason" text,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_pass_subscriptions_checkout_ref_unique" UNIQUE("checkout_ref"),
	CONSTRAINT "play_pass_subscriptions_subscription_ref_unique" UNIQUE("subscription_ref")
);
--> statement-breakpoint
CREATE TABLE "wallet_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"subscription_id" text,
	"plan_id" text,
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"source_ref" text,
	"expires_on" date,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_allocations_source_ref_unique" UNIQUE("source_ref")
);
--> statement-breakpoint
CREATE TABLE "wallet_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"allocation_id" text,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"booking_id" text,
	"invoice_id" text,
	"payment_id" text,
	"reservation_id" text,
	"note" text,
	"created_by" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_entries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "wallet_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "play_pass_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "wallet_redemption_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "play_pass_eligible" boolean;--> statement-breakpoint
ALTER TABLE "play_pass_charges" ADD CONSTRAINT "play_pass_charges_subscription_id_play_pass_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."play_pass_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_pass_charges" ADD CONSTRAINT "play_pass_charges_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD CONSTRAINT "play_pass_subscriptions_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD CONSTRAINT "play_pass_subscriptions_plan_id_play_pass_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."play_pass_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_pass_subscriptions" ADD CONSTRAINT "play_pass_subscriptions_next_plan_id_play_pass_plans_id_fk" FOREIGN KEY ("next_plan_id") REFERENCES "public"."play_pass_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_allocations" ADD CONSTRAINT "wallet_allocations_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_allocations" ADD CONSTRAINT "wallet_allocations_subscription_id_play_pass_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."play_pass_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_allocations" ADD CONSTRAINT "wallet_allocations_plan_id_play_pass_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."play_pass_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_allocation_id_wallet_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."wallet_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_reservations" ADD CONSTRAINT "wallet_reservations_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_reservations" ADD CONSTRAINT "wallet_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_reservations" ADD CONSTRAINT "wallet_reservations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "play_pass_charges_sub_idx" ON "play_pass_charges" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "play_pass_subs_family_idx" ON "play_pass_subscriptions" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "play_pass_subs_one_open_idx" ON "play_pass_subscriptions" USING btree ("family_id") WHERE status in ('pending', 'active', 'past_due');--> statement-breakpoint
CREATE INDEX "wallet_allocations_family_idx" ON "wallet_allocations" USING btree ("family_id","period_start");--> statement-breakpoint
CREATE INDEX "wallet_entries_family_idx" ON "wallet_entries" USING btree ("family_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_reservations_one_held_idx" ON "wallet_reservations" USING btree ("booking_id") WHERE status = 'held';--> statement-breakpoint
-- The three Play Pass offerings (prices and monthly allocations in cents).
INSERT INTO "play_pass_plans" ("id", "tier", "name", "price_cents", "allocation_cents", "min_experiences", "sort_order", "created_by")
SELECT gen_random_uuid()::text, v.tier, v.name, v.price, v.alloc, v.minx, v.sort, 'migration'
FROM (VALUES ('play', 'Play', 12000, 13500, 2, 1), ('gather', 'Gather', 18000, 20000, 3, 2), ('belong', 'Belong', 24000, 27000, 4, 3)) AS v (tier, name, price, alloc, minx, sort)
WHERE NOT EXISTS (SELECT 1 FROM "play_pass_plans" p WHERE p."tier" = v.tier);
--> statement-breakpoint
-- Play Pass funds can be spent on Immersive Play, Weekend Play and After Hours. Everything else
-- (camps, Flex, pop-ups and other premium programs) stays off until an administrator turns it on.
UPDATE "programs" SET "play_pass_eligible" = true, "wallet_redemption_allowed" = true
WHERE "slug" IN ('immersive-play', 'yalla-weekends', 'yalla-after-hours');
