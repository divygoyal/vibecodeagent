-- Founder name + contact email for leaderboard entries.
-- The Python migration in admin/main.py:init_db() runs the equivalent
-- ALTER TABLE statements idempotently. This file is the source-of-truth recipe.

ALTER TABLE leaderboard_entries ADD COLUMN founder_name VARCHAR(100);
ALTER TABLE leaderboard_entries ADD COLUMN contact_email VARCHAR(255);
