-- Migration: Add subscription fields to users table
-- Date: 2026-03-05
-- Description: Adds subscription_id and telegram_bot_enabled for Dodo Payments subscription support

ALTER TABLE users ADD COLUMN subscription_id VARCHAR(100);
ALTER TABLE users ADD COLUMN telegram_bot_enabled BOOLEAN DEFAULT 0;
