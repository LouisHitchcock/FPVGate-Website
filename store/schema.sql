-- FPVGate Store Database Schema

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snipcart_token TEXT UNIQUE NOT NULL,
    invoice_number TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    shipping_address TEXT NOT NULL,  -- JSON
    billing_address TEXT,            -- JSON
    items TEXT NOT NULL,             -- JSON
    subtotal REAL NOT NULL,
    shipping_fees REAL DEFAULT 0,
    total REAL NOT NULL,
    currency TEXT DEFAULT 'gbp',
    shipping_method TEXT,
    status TEXT DEFAULT 'new',       -- new, label_created, shipped, completed
    tracking_number TEXT,
    shippo_shipment_id TEXT,
    shippo_transaction_id TEXT,
    label_url TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_snipcart_token ON orders(snipcart_token);
