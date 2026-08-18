-- Migration 007: Add config column for X social embed widget settings
-- Run: sqlite3 data/admin.db < migrations/007_add_social_embed_token_config.sql

ALTER TABLE social_embed_tokens
ADD COLUMN config TEXT DEFAULT '{"visibleCards":3}';

UPDATE social_embed_tokens
SET config = '{"visibleCards":3}'
WHERE config IS NULL OR TRIM(config) = '';
