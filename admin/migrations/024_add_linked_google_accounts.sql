-- 024: extra Google accounts ("Connect another Google account", Settings -> Google).
--
-- oauth_connections can now hold several rows per user for provider 'google':
--   account_role  NULL or 'primary' = the existing row (sign-in / first data connection;
--                 identity lookups, bot containers and every older query use only this one)
--                 'linked' = an extra Google account, a read-only DATA connection only.
--                 A linked row never resolves a user (get_user_by_identifier skips it), so
--                 signing in with that Google account never opens this user's workspace.
--   account_email, account_name  shown in Settings
--   status        NULL / 'connected', or 'needs_reconnect' after Google refused the token
-- Linked rows are keyed by (user_id, provider, provider_account_id = the Google `sub`).
--
-- portfolio_assets gets:
--   connection_id NULL = the primary connection, else the Google `sub` of the linked
--                 account the asset was listed from (the primary wins when both can read it)
--   disconnected  1 after that linked account was disconnected: the row and its metrics are
--                 kept but no longer listed; a later sync that finds the asset again clears it.
--
-- Additive only. Run at startup by admin/google_accounts.py ensure_google_accounts_schema
-- (each ALTER is skipped when the column already exists).

ALTER TABLE oauth_connections ADD COLUMN account_role VARCHAR(20);
ALTER TABLE oauth_connections ADD COLUMN account_email VARCHAR(255);
ALTER TABLE oauth_connections ADD COLUMN account_name VARCHAR(255);
ALTER TABLE oauth_connections ADD COLUMN status VARCHAR(30);
CREATE INDEX IF NOT EXISTS ix_oauth_connections_user_provider ON oauth_connections(user_id, provider);

ALTER TABLE portfolio_assets ADD COLUMN connection_id VARCHAR(255);
ALTER TABLE portfolio_assets ADD COLUMN disconnected INTEGER NOT NULL DEFAULT 0;
