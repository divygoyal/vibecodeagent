-- Brevo welcome-email idempotency key. NULL means we've never delivered the
-- welcome email to this user yet. Stamped with NOW() the moment Brevo returns
-- a 2xx in the create_user background task. The upsert path also uses
-- existing_user as a primary guard, so this column is belt-and-suspenders.
ALTER TABLE users ADD COLUMN welcome_email_sent_at DATETIME;
