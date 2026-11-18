ALTER TABLE "bookings" ADD COLUMN "discount_id" text;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "program_kind" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "discounts" ("id", "code", "name", "kind", "value", "program_kind", "active") VALUES (gen_random_uuid()::text, 'CLUBYALLAFAM', 'Club Yalla family · 50% off camp', 'percent', 50, 'camp', true) ON CONFLICT ("code") DO UPDATE SET "kind" = 'percent', "value" = 50, "program_kind" = 'camp', "program_id" = NULL, "active" = true;
