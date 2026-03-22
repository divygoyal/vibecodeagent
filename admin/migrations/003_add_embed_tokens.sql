-- Add embed_tokens table for public globe embed authentication
CREATE TABLE IF NOT EXISTS embed_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    property_id VARCHAR(100) NOT NULL,
    label VARCHAR(100),
    is_active BOOLEAN DEFAULT 1,
    allowed_origins TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME
);
CREATE INDEX IF NOT EXISTS ix_embed_tokens_token ON embed_tokens(token);
CREATE INDEX IF NOT EXISTS ix_embed_tokens_user_id ON embed_tokens(user_id);
