-- "What does a typical day at Camp Yalla look like?" (Yalla's wording) as the first camp question; a saved
-- Admin copy gets it too. Then "What is Camp Yalla?" and "What ages is Camp Yalla for?".
UPDATE "faq_entries" SET "question" = $faq$What does a typical day at Camp Yalla look like?$faq$, "answer" = $faq$Our camp play sessions are rooted in the Reggio Emilia approach. Children have time to immerse themselves in play, follow their curiosity, and explore ideas together. Our credentialed early childhood educators gently guide those experiences by noticing what captures the children’s attention and offering materials or asking a question that invites them to take an idea further. A discovery in the play garden might become something the children draw, build, or revisit with a friend later that day.

Our 9:00 a.m.–3:00 p.m. camp session follows a familiar rhythm, with flexibility for the interests and needs of each group.

- **Arrival and morning play · 9:00 a.m.** Educators welcome each child into the play space, where a selection of materials and activities invites them to settle in and choose where to begin.
- **Morning snack and outdoor play · Around 9:30 a.m.** We gather for an organic snack provided by Yalla, then spend roughly 9:45–10:45 a.m. moving, exploring, and playing together in one of our outdoor play gardens.
- **Project time and lunch · Late morning** We return indoors for a gently guided project that gives children time to investigate materials and try out their own ideas before gathering for lunch.
- **Rest or an open-ended project · Noon–1:30 p.m.** In the 18 months – 3 years group, children who need sleep have time to rest. Those who stay awake can draw, look through books, or share a story with an educator. The 4 – 7 years and 8 – 10 years groups spend this time on an open-ended project, like clay building, form drawing or sewing.
- **Afternoon snack and play · 1:30–3:00 p.m.** After an organic snack, we open the play spaces again so children can return to something they started that morning or follow a new interest before pickup.$faq$, "pages" = "pages" || '{"camp": 1}'::jsonb WHERE "id" = 'camp-day';
--> statement-breakpoint
UPDATE "faq_entries" SET "pages" = "pages" || '{"camp": 2}'::jsonb WHERE "id" = 'what-is-camp';
--> statement-breakpoint
UPDATE "faq_entries" SET "pages" = "pages" || '{"camp": 3}'::jsonb WHERE "id" = 'camp-ages';
