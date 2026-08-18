-- Add annotations table for chart annotations on analytics time-series
CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date VARCHAR(10) NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'custom',
    title VARCHAR(200) NOT NULL,
    description TEXT,
    color VARCHAR(7),
    url VARCHAR(500),
    source VARCHAR(30) DEFAULT 'manual',
    property_id VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_annotations_user_id ON annotations(user_id);
CREATE INDEX IF NOT EXISTS ix_annotations_date ON annotations(date);
