-- Diaper cream & lotion permission: online form for children 2 and under (up to 35 months). Safe to re-run.
INSERT INTO "form_templates" ("id", "title", "kind", "description", "per_child", "requires_signature", "frequency", "enforcement", "status")
VALUES ('diaper-cream-lotion', 'Diaper cream & lotion permission', 'form', 'Whether Yalla staff may apply the diaper cream, lotion or other skin products you provide, and how.', true, true, 'once', 'before_attendance', 'active')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "form_versions" ("id", "template_id", "version", "body", "fields", "content_hash", "requires_resign", "published_by")
VALUES ('diaper-cream-lotion-v1', 'diaper-cream-lotion', 1, 'Yalla doesn’t provide diaper cream, lotion or other skin products. If you’d like us to use them, send them from home:

- In the original packaging, within the expiration date
- Labeled with your child’s first and last name
- Free of prescription-only ingredients, unless you include written authorization from your child’s healthcare provider

Hand products directly to a team member rather than leaving them in your child’s bag. See [medication and topical products](/policies#medication).', '[{"id":"cream","type":"choice","label":"May Yalla staff apply diaper cream you provide?","required":true,"options":[{"value":"yes","label":"Yes, apply the diaper cream I provide."},{"value":"no","label":"No diaper cream, thank you."}]},{"id":"creamBrand","type":"text","label":"Which diaper cream?","required":true,"showIf":{"field":"cream","equals":"yes"}},{"id":"lotion","type":"choice","label":"May Yalla staff apply lotion or moisturizer you provide?","required":true,"options":[{"value":"yes","label":"Yes, apply the lotion I provide."},{"value":"no","label":"No lotion, thank you."}]},{"id":"lotionBrand","type":"text","label":"Which lotion or moisturizer?","required":true,"showIf":{"field":"lotion","equals":"yes"}},{"id":"other","type":"textarea","label":"Any other non-medicated products you’d like us to use, such as baby oil, healing balm or eczema ointment?"},{"id":"instructions","type":"textarea","label":"When and how should we apply them?","placeholder":"For example: at every diaper change, or only if you notice redness","showIf":{"anyOf":[{"field":"cream","equals":"yes"},{"field":"lotion","equals":"yes"}]}},{"id":"standards","type":"initials","label":"I’ll send products that meet these standards, labeled with my child’s name, and hand them to a team member.","required":true,"showIf":{"anyOf":[{"field":"cream","equals":"yes"},{"field":"lotion","equals":"yes"}]}},{"id":"signature","type":"signature","label":"Parent or guardian signature"}]'::jsonb, '7a2f591dd6afcb5c9641637d307c0876ad1144329aa4ce586c516eab9f2926e2', true, 'Yalla')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "form_templates" SET "current_version_id" = 'diaper-cream-lotion-v1' WHERE "id" = 'diaper-cream-lotion' AND "current_version_id" IS NULL;
--> statement-breakpoint
INSERT INTO "form_requirements" ("id", "template_id", "scope", "max_age_months", "active")
VALUES ('diaper-cream-lotion-under-3', 'diaper-cream-lotion', 'all', 35, true)
ON CONFLICT ("id") DO NOTHING;
