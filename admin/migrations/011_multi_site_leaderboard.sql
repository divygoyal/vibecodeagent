-- Multi-site leaderboard: allow one user to list multiple verified sites.
--
-- The original schema had `user_id INTEGER NOT NULL UNIQUE` which forced
-- one entry per user. SQLite doesn't support `ALTER TABLE ... DROP CONSTRAINT`
-- for column-level UNIQUE, so we rebuild the table.
--
-- This SQL is the source-of-truth recipe; the Python migration in
-- admin/main.py:init_db() detects the legacy unique index via
-- PRAGMA index_list and runs an equivalent rebuild idempotently.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS leaderboard_entries_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    startup_name VARCHAR(100) NOT NULL,
    description TEXT,
    website_url VARCHAR(500),
    logo_url VARCHAR(500),
    category VARCHAR(50),
    mrr_range VARCHAR(30),
    looking_for TEXT,
    twitter_handle VARCHAR(100),
    ga_property_id VARCHAR(100),
    monthly_visitors INTEGER DEFAULT 0,
    monthly_pageviews INTEGER DEFAULT 0,
    engagement_rate FLOAT DEFAULT 0.0,
    bounce_rate FLOAT DEFAULT 0.0,
    avg_session_duration FLOAT DEFAULT 0.0,
    visitor_trend FLOAT DEFAULT 0.0,
    verified_host VARCHAR(255),
    verification_status VARCHAR(20) DEFAULT 'pending',
    primary_country VARCHAR(2),
    is_verified BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    last_refreshed DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leaderboard_entries_v2 (
    id, user_id, startup_name, description, website_url, logo_url,
    category, mrr_range, looking_for, twitter_handle, ga_property_id,
    monthly_visitors, monthly_pageviews, engagement_rate, bounce_rate,
    avg_session_duration, visitor_trend, verified_host, verification_status,
    primary_country, is_verified, is_active, last_refreshed, created_at, updated_at
)
SELECT id, user_id, startup_name, description, website_url, logo_url,
    category, mrr_range, looking_for, twitter_handle, ga_property_id,
    monthly_visitors, monthly_pageviews, engagement_rate, bounce_rate,
    avg_session_duration, visitor_trend, verified_host, verification_status,
    primary_country, is_verified, is_active, last_refreshed, created_at, updated_at
FROM leaderboard_entries;

DROP TABLE leaderboard_entries;
ALTER TABLE leaderboard_entries_v2 RENAME TO leaderboard_entries;

CREATE INDEX IF NOT EXISTS ix_leaderboard_entries_user_id
    ON leaderboard_entries(user_id);

PRAGMA foreign_keys = ON;
