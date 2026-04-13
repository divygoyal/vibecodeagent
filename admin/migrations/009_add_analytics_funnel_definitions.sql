-- Analytics funnel definitions
CREATE TABLE IF NOT EXISTS analytics_funnel_definitions (
    id VARCHAR(36) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    property_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps_json TEXT NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_funnel_definitions_user_id
    ON analytics_funnel_definitions(user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_funnel_definitions_property_id
    ON analytics_funnel_definitions(property_id);
