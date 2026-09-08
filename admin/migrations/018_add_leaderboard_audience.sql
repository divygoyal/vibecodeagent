-- 018: Audience intelligence per leaderboard entry.
--
-- One row per entry, upserted by the daily GA4/GSC refresh cron. JSON columns
-- follow web/src/lib/audienceTypes.ts; shares are percentages (0-100) over a
-- 28-day window. NULL = source unavailable for that section.
--
-- Read by the public profile ("who visits", "what they search for") and the
-- /sponsor index (topic labels). Never an input to ad slot pricing.

CREATE TABLE IF NOT EXISTS leaderboard_audience (
    entry_id INTEGER PRIMARY KEY,
    countries_json TEXT,
    channels_json TEXT,
    devices_json TEXT,
    top_pages_json TEXT,
    cities_json TEXT,
    top_queries_json TEXT,
    topics_json TEXT,
    demographics_json TEXT,
    gsc_site_url VARCHAR(255),
    data_window VARCHAR(20) NOT NULL DEFAULT '28d',
    refreshed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);
