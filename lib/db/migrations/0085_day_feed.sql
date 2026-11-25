-- The day feed (photos, food, naps, potty, messages) and who is on the team for each session.
CREATE TABLE "day_feed_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"family_id" text NOT NULL,
	"session_id" text,
	"local_date" date NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"photo_id" text,
	"author_staff_id" text,
	"author_guardian_id" text,
	"author_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "day_feed_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_staff" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "day_feed_entries" ADD CONSTRAINT "day_feed_entries_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_feed_entries" ADD CONSTRAINT "day_feed_entries_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_feed_entries" ADD CONSTRAINT "day_feed_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_feed_photos" ADD CONSTRAINT "day_feed_photos_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_staff" ADD CONSTRAINT "session_staff_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_staff" ADD CONSTRAINT "session_staff_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_feed_child_date_idx" ON "day_feed_entries" USING btree ("child_id","local_date");--> statement-breakpoint
CREATE INDEX "day_feed_family_date_idx" ON "day_feed_entries" USING btree ("family_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "session_staff_unique" ON "session_staff" USING btree ("session_id","staff_id");--> statement-breakpoint
CREATE INDEX "session_staff_staff_idx" ON "session_staff" USING btree ("staff_id");--> statement-breakpoint
-- Session team: only the children in the sessions they're assigned to, from 6pm the evening before until
-- 11:59pm on the day. Roles are otherwise created at first setup, so this adds it. Safe to re-run.
INSERT INTO "roles" ("id", "key", "name", "description", "permissions", "is_system")
VALUES (gen_random_uuid()::text, 'session_team', 'Session team',
  'Only the children in the sessions they’re assigned to, from 6pm the evening before until 11:59pm on the day: each child’s profile, their day feed and messages with their parents. Nothing else.',
  ARRAY['feed.post']::text[], false)
ON CONFLICT ("key") DO NOTHING;
