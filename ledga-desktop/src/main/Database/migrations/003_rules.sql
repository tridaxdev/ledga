CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    match_keyword TEXT NOT NULL,
    rename_merchant TEXT,
    category_name TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_rules_position ON rules(position);
