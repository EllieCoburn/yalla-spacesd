-- Former Yalla families: 50% off Yalla Flex with the code WEMISSEDYOU (codes aren't case-sensitive).
INSERT INTO discounts (id, code, name, kind, value, program_id, active)
SELECT gen_random_uuid()::text, 'WEMISSEDYOU', 'We missed you: 50% off Yalla Flex for former families', 'percent', 50, p.id, true
FROM programs p WHERE p.slug = 'yalla-flex'
ON CONFLICT (code) DO NOTHING;
