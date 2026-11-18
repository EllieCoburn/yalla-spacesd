-- A thank-you for a family's first Yalla Flex day: 10% off their next Flex booking, once per family.
INSERT INTO discounts (id, code, name, kind, value, program_id, active, once_per_family)
SELECT gen_random_uuid()::text, 'BACKTOPLAY10', 'Back to play: 10% off a return Flex visit', 'percent', 10, p.id, true, true
FROM programs p WHERE p.slug = 'yalla-flex'
ON CONFLICT (code) DO NOTHING;
