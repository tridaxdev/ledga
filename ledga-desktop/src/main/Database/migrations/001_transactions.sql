CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    email_id TEXT,
    source TEXT NOT NULL CHECK(source IN ('gmail', 'csv')),
    type TEXT NOT NULL CHECK(type IN ('credit', 'debit')),
    account_number TEXT NOT NULL DEFAULT '',
    merchant TEXT NOT NULL DEFAULT '',
    bank TEXT NOT NULL DEFAULT '',
    bank_reference TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL DEFAULT 0,
    available_balance REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'NGN',
    category_id TEXT,
    needs_review INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_email_id ON transactions(email_id);
CREATE INDEX IF NOT EXISTS idx_transactions_needs_review ON transactions(needs_review);
