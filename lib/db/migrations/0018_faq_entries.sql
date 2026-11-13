CREATE TABLE "faq_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"policy" text,
	"category" text NOT NULL,
	"also_in" text[] DEFAULT '{}'::text[] NOT NULL,
	"pages" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"needs" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
