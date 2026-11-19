-- Carts: what visitors have added on the public site but not booked yet, so staff can see demand in
-- Admin → Carts & checkouts. The id is random, made by the visitor's browser; a cart is linked to a
-- family only when they're signed in. Carts untouched for 7 days are removed by housekeeping.
CREATE TABLE IF NOT EXISTS "carts" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text REFERENCES "families"("id") ON DELETE SET NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "carts_updated_idx" ON "carts" USING btree ("updated_at");
