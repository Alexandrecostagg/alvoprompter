-- Restrict diagnostics to HTTP status and an allowlisted machine code.
-- Provider messages, request bodies and authentication headers are never stored.
ALTER TABLE checkout_intents ADD COLUMN upstream_status INTEGER;
ALTER TABLE checkout_intents ADD COLUMN upstream_error_code TEXT;
