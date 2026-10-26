-- 023: per-user state of the site "Actions" tasks (what to fix next).
-- One row per (user, site, action). Rows only exist for done/dismissed tasks;
-- re-opening a task deletes its row. Additive; created at startup (or on first
-- use) by site_actions_api.ensure_site_actions_schema.
CREATE TABLE IF NOT EXISTS site_action_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    site_key VARCHAR(300) NOT NULL,
    action_id VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL,
    title VARCHAR(300),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_site_action_states_user_site_action
    ON site_action_states(user_id, site_key, action_id);
