CREATE TABLE "wallet_credit_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"transaction_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_credit_notices" ADD CONSTRAINT "wallet_credit_notices_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_credit_notices_key_idx" ON "wallet_credit_notices" USING btree ("transaction_key");--> statement-breakpoint
CREATE INDEX "wallet_credit_notices_pending_idx" ON "wallet_credit_notices" USING btree ("sent_at");