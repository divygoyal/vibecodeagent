-- Migration 006: Add social_embed_tokens table for public X/Reddit embeds
-- Run: sqlite3 data/admin.db < migrations/006_add_social_embed_tokens.sql

CREATE TABLE IF NOT EXISTS social_embed_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    platform VARCHAR(32) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    source_site_url VARCHAR(500),
    label VARCHAR(100),
    is_active BOOLEAN DEFAULT 1,
    allowed_origins TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME
);

CREATE INDEX IF NOT EXISTS ix_social_embed_tokens_token ON social_embed_tokens(token);
CREATE INDEX IF NOT EXISTS ix_social_embed_tokens_user_id ON social_embed_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_social_embed_tokens_platform ON social_embed_tokens(platform);
CREATE INDEX IF NOT EXISTS ix_social_embed_tokens_domain ON social_embed_tokens(domain);
