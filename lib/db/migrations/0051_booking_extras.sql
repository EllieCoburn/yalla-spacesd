CREATE TABLE "booking_extras" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_item_id" text NOT NULL,
	"addon_key" text NOT NULL,
	"price_cents" integer NOT NULL,
	"invoice_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "booking_extras" ADD CONSTRAINT "booking_extras_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_extras_invoice_idx" ON "booking_extras" USING btree ("invoice_id");