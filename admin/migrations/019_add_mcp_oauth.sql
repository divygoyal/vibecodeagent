-- 019: Hosted MCP server (Connect AI): OAuth clients, grants, codes, tokens,
-- API keys, audit log and GA4/GSC pairing overrides.
--
-- Additive only. Applied idempotently at admin startup by mcp_api.ensure_mcp_schema(),
-- which reads this file, so keep every statement IF NOT EXISTS and keep
-- semicolons out of comments.
--
-- Secrets are never stored raw: codes, tokens, API keys and client secrets are
-- SHA-256 hex digests computed by the web app. All times are epoch seconds.
-- user_id is users.id. user_id 0 marks an anonymous demo grant (consent
-- screen "Use demo data", no sign-in) that can only ever read synthetic data.

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
    client_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('dcr', 'cimd')),
    client_name TEXT,
    client_uri TEXT,
    redirect_uris TEXT NOT NULL,
    token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
    secret_hash TEXT,
    grant_types TEXT NOT NULL DEFAULT '["authorization_code","refresh_token"]',
    scope TEXT,
    application_type TEXT,
    software_id TEXT,
    doc_etag TEXT,
    doc_fetched_at INTEGER,
    doc_expires_at INTEGER,
    created_ip_hash TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS mcp_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    client_id TEXT NOT NULL,
    client_name TEXT,
    client_host TEXT,
    redirect_host TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    scope TEXT NOT NULL,
    site_filter TEXT,
    exclude_queries INTEGER NOT NULL DEFAULT 0,
    demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    revoked_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mcp_grants_user_client ON mcp_grants(user_id, client_id) WHERE user_id > 0;

CREATE INDEX IF NOT EXISTS idx_mcp_grants_user ON mcp_grants(user_id);

CREATE TABLE IF NOT EXISTS mcp_auth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    grant_id INTEGER NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    scope TEXT NOT NULL,
    resource TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS mcp_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh', 'api_key')),
    family_id TEXT,
    grant_id INTEGER,
    user_id INTEGER NOT NULL,
    client_id TEXT,
    scope TEXT NOT NULL,
    audience TEXT NOT NULL,
    name TEXT,
    prefix TEXT,
    site_filter TEXT,
    exclude_queries INTEGER NOT NULL DEFAULT 0,
    source_code_hash TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    family_expires_at INTEGER,
    used_at INTEGER,
    last_used_at INTEGER,
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON mcp_tokens(user_id, kind);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_family ON mcp_tokens(family_id);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_grant ON mcp_tokens(grant_id);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expiry ON mcp_tokens(expires_at);

CREATE TABLE IF NOT EXISTS mcp_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    grant_id INTEGER,
    token_id INTEGER,
    client_id TEXT,
    tool TEXT NOT NULL,
    site_host TEXT,
    status TEXT NOT NULL,
    duration_ms INTEGER,
    rows INTEGER,
    cache_hit INTEGER,
    google_calls INTEGER,
    ip_prefix TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_user_ts ON mcp_audit(user_id, ts DESC);

CREATE TABLE IF NOT EXISTS mcp_site_links (
    user_id INTEGER NOT NULL,
    site_id TEXT NOT NULL,
    ga4_property TEXT,
    gsc_property TEXT,
    source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, site_id)
);
