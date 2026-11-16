CREATE TABLE "family_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"guardian_id" text,
	"enquiry_id" text,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "family_auth_tokens" ADD COLUMN "purpose" text DEFAULT 'sign_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "portal_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Families who already set a password count as confirmed, so they aren't asked to confirm again.
UPDATE "guardians" SET "email_verified_at" = now() WHERE "password_hash" IS NOT NULL AND "email_verified_at" IS NULL;
