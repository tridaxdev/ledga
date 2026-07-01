CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    from_addr TEXT NOT NULL DEFAULT '',
    email_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT NOT NULL DEFAULT '',
    retrieved_at INTEGER NOT NULL DEFAULT 0,
    file_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'processed', 'failed')),
    UNIQUE(connection_id, email_id)
);

CREATE INDEX IF NOT EXISTS idx_emails_connection_status ON emails(connection_id, status);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
