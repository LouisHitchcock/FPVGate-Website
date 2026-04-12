-- Allowed users table for Google OAuth access control
CREATE TABLE IF NOT EXISTS allowed_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    added_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_allowed_users_email ON allowed_users(email);
