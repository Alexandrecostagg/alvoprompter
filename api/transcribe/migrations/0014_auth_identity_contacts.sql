-- Firebase UID is the owner key. An email may be reused after account recreation.
-- Keep the original UNIQUE email column as a legacy key so no parent table is
-- rebuilt: dropping users would cascade into subscriptions and cloud content.
ALTER TABLE users ADD COLUMN auth_email TEXT;
UPDATE users SET auth_email = email;
CREATE INDEX users_auth_email_idx ON users(auth_email COLLATE NOCASE);
