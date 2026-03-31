-- Returns system
CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'requested',
    shippo_shipment_id TEXT,
    shippo_transaction_id TEXT,
    tracking_number TEXT,
    label_url TEXT,
    refund_amount REAL,
    items TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_tracking ON returns(tracking_number);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
