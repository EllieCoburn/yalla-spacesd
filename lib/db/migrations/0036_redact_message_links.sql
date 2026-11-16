-- Security: the message log must never hold working sign-in, password-reset or invitation links.
-- New messages are stored with these links removed; this clears them from messages already logged.
UPDATE "messages"
SET "body" = regexp_replace("body", 'https?://[^\s)\]]*[?&](token|key|k)=[^\s)\]]*', '[private link removed]', 'gi')
WHERE "body" ~* 'https?://[^\s)\]]*[?&](token|key|k)=';
