-- 021: Leaderboard v3 (tc/leaderboard). Additive only: four new tables, no change
-- to leaderboard_entries, ad_slots or ad_slot_requests.
--
-- The Python models (admin/models.py: LeaderboardProfile, LeaderboardDaily,
-- LeaderboardRangeStat, LeaderboardInquiry) plus Base.metadata.create_all in
-- init_db() create these on boot; init_db() also runs the same statements
-- (_ensure_leaderboard_v3_schema) so a database that predates the models
-- converges. This file is the recipe for fresh databases + documentation.
--
-- Existing entries need no backfill: an entry with no leaderboard_profiles row is
-- interpreted by admin/leaderboard_core.py (legacy GA4-verified entries stay on the
-- board until their first Search Console re-check; their public numbers keep the
-- visibility they have today).

-- Verification state and privacy settings, 1:1 with leaderboard_entries.
CREATE TABLE IF NOT EXISTS leaderboard_profiles (
    entry_id INTEGER PRIMARY KEY,
    verification_level VARCHAR(10) NOT NULL DEFAULT 'none',   -- owner | ga4 | none
    verification_checked_at DATETIME,
    verification_detail TEXT,                                 -- JSON, owner-only
    verification_manual BOOLEAN NOT NULL DEFAULT 0,           -- superadmin override
    gsc_site_url VARCHAR(255),
    privacy_json TEXT,                                        -- per-metric exact|range|hidden + section toggles
    open_to_json TEXT,                                        -- ["sponsorships","acquisition","partnerships"]
    is_paused BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);

-- Daily series (GA4 users/sessions/pageviews, GSC clicks/impressions).
CREATE TABLE IF NOT EXISTS leaderboard_daily (
    entry_id INTEGER NOT NULL,
    day DATE NOT NULL,
    users INTEGER,
    sessions INTEGER,
    pageviews INTEGER,
    clicks INTEGER,
    impressions INTEGER,
    PRIMARY KEY (entry_id, day),
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);

-- Range totals with the previous period (7d / 28d / 3m).
CREATE TABLE IF NOT EXISTS leaderboard_range_stats (
    entry_id INTEGER NOT NULL,
    range_key VARCHAR(4) NOT NULL,
    visitors INTEGER,
    visitors_prev INTEGER,
    pageviews INTEGER,
    pageviews_prev INTEGER,
    clicks INTEGER,
    clicks_prev INTEGER,
    impressions INTEGER,
    impressions_prev INTEGER,
    engagement_rate FLOAT,
    bounce_rate FLOAT,
    avg_session_duration FLOAT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entry_id, range_key),
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);

-- Offers sent from the public profile (sponsorship without a slot, acquisition,
-- partnership). Slot requests also go to ad_slot_requests and are linked here.
CREATE TABLE IF NOT EXISTS leaderboard_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    publisher_user_id INTEGER NOT NULL,
    kind VARCHAR(20) NOT NULL,                                -- sponsorship | acquisition | partnership
    name VARCHAR(120),
    email VARCHAR(255) NOT NULL,
    company VARCHAR(160),
    budget VARCHAR(80),
    message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'new',                -- new | read | replied | archived
    ad_slot_request_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_leaderboard_inquiries_entry_id ON leaderboard_inquiries(entry_id);
CREATE INDEX IF NOT EXISTS ix_leaderboard_inquiries_publisher ON leaderboard_inquiries(publisher_user_id, created_at);
