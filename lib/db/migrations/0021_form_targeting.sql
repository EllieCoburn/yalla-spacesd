ALTER TABLE "form_requirements" ADD COLUMN "min_age_months" integer;--> statement-breakpoint
ALTER TABLE "form_requirements" ADD COLUMN "max_age_months" integer;--> statement-breakpoint
ALTER TABLE "form_requirements" ADD COLUMN "program_kinds" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
-- Sunscreen permission: Yalla's first online form (modernized from the paper form). Safe to re-run.
INSERT INTO "form_templates" ("id", "title", "kind", "description", "per_child", "requires_signature", "frequency", "enforcement", "status")
VALUES ('sunscreen-permission', 'Sunscreen permission', 'form', 'Whether Yalla staff may apply the sunscreen you provide during outdoor play, plus any allergies or instructions.', true, true, 'once', 'before_attendance', 'active')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "form_versions" ("id", "template_id", "version", "body", "fields", "content_hash", "requires_resign", "published_by")
VALUES ('sunscreen-permission-v1', 'sunscreen-permission', 1, 'Yalla doesn’t provide sunscreen. If you’d like our team to apply it during outdoor play, send a sunscreen that is:

- SPF 30 or higher and broad spectrum (UVA/UVB)
- Rated 1 or 2 by the [Environmental Working Group](https://www.ewg.org/sunscreen)
- A lotion or stick (no sprays)
- Labeled with your child’s first and last name

Looking for one? Badger Baby SPF 30, Thinkbaby SPF 50+, Babo Botanicals Clear Zinc SPF 30, Blue Lizard Baby SPF 30+ and Earth Mama Baby SPF 40 usually meet these standards. You can check any sunscreen’s rating at [ewg.org/sunscreen](https://www.ewg.org/sunscreen).', '[{"id":"permission","type":"choice","label":"May Yalla staff apply sunscreen to your child?","required":true,"options":[{"value":"yes","label":"Yes. Yalla staff may apply the sunscreen I provide during outdoor play."},{"value":"no","label":"No. I’ll apply sunscreen before arrival, and my child will still join outdoor play."}]},{"id":"standards","type":"initials","label":"I’ll provide sunscreen that meets the standards above, labeled with my child’s name.","required":true,"showIf":{"field":"permission","equals":"yes"}},{"id":"allergy","type":"choice","label":"Sunscreen allergies","required":true,"options":[{"value":"none","label":"I don’t know of any sunscreen allergies."},{"value":"some","label":"My child is allergic to some sunscreens."}]},{"id":"allowed","type":"text","label":"Use only these brands or types","required":true,"showIf":{"field":"allergy","equals":"some"}},{"id":"instructions","type":"textarea","label":"Anything else we should know? Timing, sensitivities or special instructions."},{"id":"signature","type":"signature","label":"Parent or guardian signature"}]'::jsonb, '766206a30c13bbf3b7d95c183ac3336be415a9f3cb4a4dff98c7e1b0e24b9d00', true, 'Yalla')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "form_templates" SET "current_version_id" = 'sunscreen-permission-v1' WHERE "id" = 'sunscreen-permission' AND "current_version_id" IS NULL;
--> statement-breakpoint
INSERT INTO "form_requirements" ("id", "template_id", "scope", "active")
VALUES ('sunscreen-permission-all', 'sunscreen-permission', 'all', true)
ON CONFLICT ("id") DO NOTHING;
