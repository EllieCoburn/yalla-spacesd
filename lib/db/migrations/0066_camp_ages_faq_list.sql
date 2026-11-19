-- "What ages is Camp Yalla for?" as a simple list of the three age groups; a saved Admin copy too.
UPDATE "faq_entries" SET "answer" = 'Camp Yalla has three age groups:' || E'\n\n' || '- **18 months – 3 years**' || E'\n' || '- **4 – 7 years**' || E'\n' || '- **8 – 10 years**' || E'\n\n' || 'Each child joins the group for their age on the camp day.' WHERE "id" = 'camp-ages';
