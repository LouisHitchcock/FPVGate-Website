-- FPVGate Shop Database Schema

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent TEXT,
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
    status TEXT DEFAULT 'new',       -- new, label_created, shipped, completed, cancelled, refunded
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
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);

-- Order comments
CREATE TABLE IF NOT EXISTS order_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    comment TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_order ON order_comments(order_id);

-- Order refunds
CREATE TABLE IF NOT EXISTS order_refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    stripe_refund_id TEXT,
    amount REAL NOT NULL,
    comment TEXT,
    refunded_by_gateway INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON order_refunds(order_id);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT,
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);

-- Inventory audit log
CREATE TABLE IF NOT EXISTS inventory_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    change_amount INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_log_product ON inventory_log(product_id);

-- Tracking events (from Shippo webhooks)
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

-- Returns
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
