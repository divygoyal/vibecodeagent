-- Leaderboard v2: domain-match verification + per-day stats history.
--
-- 1. Adds three columns to leaderboard_entries:
--      verified_host          - hostname GA4 reports for the linked property
--      verification_status    - verified | host_mismatch | pending | failed
--      primary_country        - ISO-2 code derived from the GA4 top-country during refresh
-- 2. Creates leaderboard_stats_history for the sparkline / weekly-mover features.

ALTER TABLE leaderboard_entries ADD COLUMN verified_host VARCHAR(255);
ALTER TABLE leaderboard_entries ADD COLUMN verification_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE leaderboard_entries ADD COLUMN primary_country VARCHAR(2);

CREATE TABLE IF NOT EXISTS leaderboard_stats_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    recorded_on DATE NOT NULL,
    monthly_visitors INTEGER DEFAULT 0,
    monthly_pageviews INTEGER DEFAULT 0,
    engagement_rate REAL DEFAULT 0.0,
    bounce_rate REAL DEFAULT 0.0,
    avg_session_duration REAL DEFAULT 0.0,
    visitor_trend REAL DEFAULT 0.0,
    rank_overall INTEGER,
    rank_in_category INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entry_id, recorded_on),
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_stats_history_entry_id
    ON leaderboard_stats_history(entry_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_stats_history_recorded_on
    ON leaderboard_stats_history(recorded_on);
