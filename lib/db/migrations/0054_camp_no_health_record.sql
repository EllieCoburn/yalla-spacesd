-- Camp Yalla doesn't collect immunization records: the Health & immunization record now applies
-- to every offering except camp. A child booked only for camp isn't asked for it; a child who also
-- comes to Flex, Club Yalla or another offering still is.
UPDATE form_requirements SET program_kinds = ARRAY['membership','drop_in','nature','weekend','parents_night','happening','private_event']
WHERE scope = 'all' AND program_kinds = '{}'::text[]
  AND template_id IN (SELECT id FROM form_templates WHERE title = 'Health & immunization record');--> statement-breakpoint
UPDATE form_requirements SET active = false
WHERE scope = 'program' AND program_id IN (SELECT id FROM programs WHERE kind = 'camp')
  AND template_id IN (SELECT id FROM form_templates WHERE title = 'Health & immunization record');
