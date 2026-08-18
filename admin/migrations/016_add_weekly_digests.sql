-- Weekly Briefing persistence layer (docs/WEEKLY_BRIEFING_UI_PLAN.md, Track 1).
--
-- One row per (user, ISO year+week, site_url). site_url is nullable so a user
-- with no active workspace still gets one row per week. snapshot_json holds the
-- full enriched snapshot blob from `buildEnrichedSnapshot()`; headline +
-- action_items_json are the AI-generated narrative layer surfaced on the
-- Weekly tab.
--
-- The Python model (admin/models.py:WeeklyDigest) + `Base.metadata.create_all`
-- in init_db() will create this table automatically on first boot, so this
-- file is the source-of-truth recipe for documentation + fresh databases.

CREATE TABLE IF NOT EXISTS weekly_digests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    iso_week INTEGER NOT NULL,         -- 1..53
    site_url VARCHAR(500),             -- nullable; null = no workspace at write time
    headline TEXT,                     -- AI-generated one-liner
    action_items_json TEXT,            -- JSON-serialized list of 3 actions
    snapshot_json TEXT NOT NULL,       -- full enriched snapshot blob
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_weekly_digest_user_week_site UNIQUE (user_id, year, iso_week, site_url)
);

CREATE INDEX IF NOT EXISTS ix_weekly_digests_user_id
    ON weekly_digests(user_id);

CREATE INDEX IF NOT EXISTS ix_weekly_digests_user_week
    ON weekly_digests(user_id, year, iso_week);
