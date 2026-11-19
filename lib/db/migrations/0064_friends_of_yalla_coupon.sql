-- Families from partner programs (e.g. San Diego Cooperative Preschool): 15% off Camp Yalla with the
-- code FRIENDSOFYALLA (codes aren't case-sensitive).
INSERT INTO discounts (id, code, name, kind, value, program_id, active)
SELECT gen_random_uuid()::text, 'FRIENDSOFYALLA', 'Friends of Yalla: 15% off Camp Yalla', 'percent', 15, p.id, true
FROM programs p WHERE p.slug = 'camp-yalla'
ON CONFLICT (code) DO NOTHING;
