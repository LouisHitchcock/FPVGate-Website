-- Migration: Add admin features tables
-- Run against fpvgate-store-db D1 database:
-- wrangler d1 execute fpvgate-store-db --file=./migration_admin_features.sql

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
    snipcart_refund_id TEXT,
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

-- Seed initial inventory for existing product
INSERT OR IGNORE INTO inventory (product_id, product_name, sku, stock_quantity, low_stock_threshold)
VALUES ('fpvgate-aio-v3', 'FPVGate AIO V3', 'FPVG-AIO-V3', 0, 5);
