-- Yalla has no front desk: families check in at the kiosk in the lobby. Replace any arrival note that
-- mentions a front desk (including the sample text from setup) on locations and programs.
UPDATE locations SET arrival_instructions = 'When you arrive, please check in at the kiosk in our lobby.'
WHERE arrival_instructions ILIKE '%front desk%';--> statement-breakpoint
UPDATE programs SET arrival_instructions = 'When you arrive, please check in at the kiosk in our lobby.'
WHERE arrival_instructions ILIKE '%front desk%';
