CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#8e8270',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

INSERT OR IGNORE INTO categories (id, name, color) VALUES
    ('cat_groceries',     'Groceries',     '#4caf50'),
    ('cat_food',          'Food',          '#ff9800'),
    ('cat_transport',     'Transport',     '#2196f3'),
    ('cat_housing',       'Housing',       '#9c27b0'),
    ('cat_utilities',     'Utilities',     '#00bcd4'),
    ('cat_health',        'Health',        '#f44336'),
    ('cat_entertainment', 'Entertainment', '#e91e63'),
    ('cat_subscriptions', 'Subscriptions', '#3f51b5'),
    ('cat_income',        'Income',        '#037b68'),
    ('cat_transfer',      'Transfer',      '#607d8b'),
    ('cat_other',         'Other',         '#8e8270');
