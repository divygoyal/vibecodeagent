-- Migration 022: dashboard builder v2 (BUILDER.md section 6.6). Additive only.
--
-- v1 rows keep their columns untouched. A v2 save writes `doc` (DashboardDocV2 JSON),
-- sets schema_version = 2 and increments rev. property_id stays NOT NULL: v2 rows write
-- the default site's GA4 property, its Search Console site, or 'multi' for portfolio defaults.
-- Rolling the code back shows the pre-v2 content of each row (no data loss).
--
-- The admin applies these statements at startup (init_db), so running this file by hand is
-- only needed for databases that are not opened by the admin API:
--   sqlite3 data/admin.db < migrations/022_dashboards_v2.sql   (errors on re-run are harmless)

ALTER TABLE custom_dashboards ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE custom_dashboards ADD COLUMN doc TEXT;                   -- DashboardDocV2 JSON; NULL until the first v2 save
ALTER TABLE custom_dashboards ADD COLUMN rev INTEGER NOT NULL DEFAULT 1;
ALTER TABLE custom_dashboards ADD COLUMN share_settings TEXT;        -- JSON: allowCopy, badge, viewerControls, embed, expiresAt
ALTER TABLE custom_dashboards ADD COLUMN share_password_hash TEXT;   -- scrypt$<salt hex>$<hash hex>, per-row salt
ALTER TABLE custom_dashboards ADD COLUMN thumbnail TEXT;             -- P1

CREATE TABLE IF NOT EXISTS custom_dashboard_versions (               -- last 20 revisions per dashboard
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dashboard_id TEXT NOT NULL,
    rev INTEGER NOT NULL,
    doc TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cdv_dashboard ON custom_dashboard_versions(dashboard_id, rev);
