CREATE TABLE "space_entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"mode" text NOT NULL,
	"daily_minutes" integer,
	"effective_from" date,
	"effective_until" date,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "space_reservation_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"family_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"booking_type" text NOT NULL,
	"status" text NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"complimentary_minutes" integer DEFAULT 0 NOT NULL,
	"price_snapshot" jsonb,
	"policy_snapshot" jsonb,
	"hold_expires_at" timestamp with time zone,
	"source" text DEFAULT 'portal' NOT NULL,
	"created_by_guardian_id" text,
	"created_by_staff" text,
	"staff_note" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_reservation_groups_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "space_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"family_id" text NOT NULL,
	"local_date" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"complimentary_minutes" integer DEFAULT 0 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" text
);
--> statement-breakpoint
CREATE TABLE "workspace_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"category" text,
	"booking_type" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text,
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"booking_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"complimentary_eligible" boolean DEFAULT false NOT NULL,
	"hours" jsonb,
	"min_notice_minutes" integer DEFAULT 0 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "space_group_id" text;--> statement-breakpoint
ALTER TABLE "space_entitlements" ADD CONSTRAINT "space_entitlements_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_reservation_groups" ADD CONSTRAINT "space_reservation_groups_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_reservation_groups" ADD CONSTRAINT "space_reservation_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_reservation_groups" ADD CONSTRAINT "space_reservation_groups_created_by_guardian_id_guardians_id_fk" FOREIGN KEY ("created_by_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_reservations" ADD CONSTRAINT "space_reservations_group_id_space_reservation_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."space_reservation_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_reservations" ADD CONSTRAINT "space_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_reservations" ADD CONSTRAINT "space_reservations_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_blocks" ADD CONSTRAINT "workspace_blocks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_rates" ADD CONSTRAINT "workspace_rates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_entitlements_family_idx" ON "space_entitlements" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "space_groups_family_idx" ON "space_reservation_groups" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "space_groups_status_idx" ON "space_reservation_groups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "space_res_workspace_time_idx" ON "space_reservations" USING btree ("workspace_id","starts_at");--> statement-breakpoint
CREATE INDEX "space_res_family_date_idx" ON "space_reservations" USING btree ("family_id","local_date");--> statement-breakpoint
CREATE INDEX "space_res_group_idx" ON "space_reservations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "workspace_blocks_time_idx" ON "workspace_blocks" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "workspace_rates_lookup_idx" ON "workspace_rates" USING btree ("booking_type","effective_from");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_space_group_id_space_reservation_groups_id_fk" FOREIGN KEY ("space_group_id") REFERENCES "public"."space_reservation_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_reservations" ADD CONSTRAINT "space_reservations_interval_check" CHECK ("ends_at" > "starts_at");--> statement-breakpoint
ALTER TABLE "workspace_blocks" ADD CONSTRAINT "workspace_blocks_interval_check" CHECK ("ends_at" > "starts_at");
