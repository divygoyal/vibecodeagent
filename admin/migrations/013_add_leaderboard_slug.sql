-- Public-facing URL slug for leaderboard entries.
-- Format: `slugify(startup_name)-<6 lowercase alphanumeric chars>`,
-- e.g. "antigravity-codes-a3f9b2". Generated once at create time so renames
-- don't break embed badges or shared links.
--
-- The Python migration in admin/main.py:init_db() runs the equivalent
-- ALTER TABLE + UNIQUE INDEX statements idempotently. This file is the
-- source-of-truth recipe.

ALTER TABLE leaderboard_entries ADD COLUMN slug VARCHAR(150);
CREATE UNIQUE INDEX IF NOT EXISTS ix_leaderboard_entries_slug
    ON leaderboard_entries(slug);
