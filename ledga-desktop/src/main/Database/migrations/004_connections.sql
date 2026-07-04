CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'gmail',
    auto_sync INTEGER NOT NULL DEFAULT 1,
    gmail_watch_expiry INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
