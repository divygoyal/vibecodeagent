-- Migration 005: Add custom_dashboards table for drag-and-drop dashboard builder
-- Run: sqlite3 data/admin.db < migrations/005_add_custom_dashboards.sql

CREATE TABLE IF NOT EXISTS custom_dashboards (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    property_id TEXT NOT NULL,
    site_url TEXT,
    widgets TEXT NOT NULL DEFAULT '[]',
    grid_layouts TEXT NOT NULL DEFAULT '{"lg":[],"md":[],"sm":[]}',
    theme TEXT NOT NULL DEFAULT '{}',
    is_public INTEGER DEFAULT 0,
    share_token TEXT UNIQUE,
    embed_enabled INTEGER DEFAULT 0,
    is_template INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    views INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_dashboards_user_id ON custom_dashboards(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_dashboards_share_token ON custom_dashboards(share_token);
