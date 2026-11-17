CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('distributor', 'support')),
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'open', 'waiting', 'resolved')),
    subject TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    application TEXT,
    notification_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, updated_at);
CREATE TABLE IF NOT EXISTS support_messages (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
    kind TEXT NOT NULL CHECK(kind IN ('application', 'note', 'reply', 'status')),
    body TEXT NOT NULL,
    delivery_status TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);
