-- Tracking events from Shippo webhooks
CREATE TABLE IF NOT EXISTS tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    tracking_number TEXT NOT NULL,
    carrier TEXT,
    status TEXT NOT NULL,
    substatus_code TEXT,
    substatus_text TEXT,
    status_details TEXT,
    location_city TEXT,
    location_state TEXT,
    location_country TEXT,
    location_zip TEXT,
    status_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_tracking_order ON tracking_events(order_id);
CREATE INDEX IF NOT EXISTS idx_tracking_number ON tracking_events(tracking_number);
