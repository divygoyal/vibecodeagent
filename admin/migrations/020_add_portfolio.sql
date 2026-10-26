-- 020: Portfolio snapshot store (the app home: every GA4 property and Search
-- Console site of a user on one screen).
--
-- portfolio_assets: one row per (user, asset kind, asset id). Holds the
-- inventory as last seen, the user's flags (starred, hidden), the manual
-- GA4 <-> GSC pairing override and the per-asset sync status.
--   asset_kind       'ga4' (asset_id = "properties/123") or 'gsc' (asset_id = site URL)
--   paired_with      asset_id of the other kind the pairing resolved to (auto or manual)
--   pairing_override GA4 rows only. NULL = automatic pairing, '__none__' = force
--                    unpaired, otherwise the GSC site URL to pair with.
--   status           pending | syncing | synced | error | no_access
--   missing          1 when the asset was absent from the latest inventory
--                    (row kept so flags survive a temporary access loss)
--
-- site_daily_metrics: one row per (user, asset kind, date, asset id) with the
-- day's metrics. GA4 rows fill users..engagement_rate, GSC rows fill
-- clicks..position. Missing days count as zero when summed.
--
-- Additive only. Read and written by admin/portfolio_api.py, which also runs
-- these statements at startup (idempotent).

CREATE TABLE IF NOT EXISTS portfolio_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    asset_kind VARCHAR(8) NOT NULL CHECK (asset_kind IN ('ga4', 'gsc')),
    asset_id VARCHAR(500) NOT NULL,
    display_name VARCHAR(300),
    host VARCHAR(255),
    account_name VARCHAR(300),
    permission_level VARCHAR(40),
    paired_with VARCHAR(500),
    pairing_override VARCHAR(500),
    starred INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    missing INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    last_error TEXT,
    last_synced_at INTEGER,
    sync_started_at INTEGER,
    data_start VARCHAR(10),
    data_end VARCHAR(10),
    backfill_done INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CONSTRAINT uq_portfolio_asset UNIQUE (user_id, asset_kind, asset_id)
);

CREATE INDEX IF NOT EXISTS ix_portfolio_assets_user ON portfolio_assets(user_id);

CREATE INDEX IF NOT EXISTS ix_portfolio_assets_synced ON portfolio_assets(last_synced_at);

CREATE TABLE IF NOT EXISTS site_daily_metrics (
    user_id INTEGER NOT NULL,
    asset_kind VARCHAR(8) NOT NULL,
    asset_id VARCHAR(500) NOT NULL,
    date VARCHAR(10) NOT NULL,
    users INTEGER,
    sessions INTEGER,
    pageviews INTEGER,
    key_events REAL,
    engagement_rate REAL,
    clicks INTEGER,
    impressions INTEGER,
    ctr REAL,
    position REAL,
    updated_at INTEGER NOT NULL,
    -- Clustered by (user, kind, date): the portfolio reads date ranges of all
    -- of a user's assets, which becomes one contiguous range scan.
    PRIMARY KEY (user_id, asset_kind, date, asset_id)
) WITHOUT ROWID;
