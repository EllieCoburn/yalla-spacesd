-- Saved template rows that no one on the team ever edited (copies of old defaults made by the
-- sample-data seed) would hide improved default emails. Staff edits record who saved them and are kept.
DELETE FROM "message_templates" WHERE "updated_by" IS NULL;
