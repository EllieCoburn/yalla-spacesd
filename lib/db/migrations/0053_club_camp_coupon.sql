-- Club Yalla families: 50% off Camp Yalla with the code CLUBYALLAFAM (codes aren't case-sensitive).
INSERT INTO discounts (id, code, name, kind, value, program_id, active)
SELECT gen_random_uuid()::text, 'CLUBYALLAFAM', 'Club Yalla family camp rate', 'percent', 50, p.id, true
FROM programs p WHERE p.slug = 'camp-yalla'
ON CONFLICT (code) DO NOTHING;
