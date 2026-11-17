CREATE TABLE IF NOT EXISTS order_number_counters (
    day TEXT PRIMARY KEY,
    last_sequence INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS order_number_assignments (
    source_key TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    order_number TEXT NOT NULL UNIQUE,
    UNIQUE(day,sequence)
);
-- Preserve any already assigned references when applying to an existing store.
INSERT INTO order_number_counters (day,last_sequence)
SELECT substr(invoice_number,1,8), MAX(CAST(substr(invoice_number,9) AS INTEGER))
FROM orders
WHERE length(invoice_number) >= 10 AND invoice_number NOT GLOB '*[^0-9]*'
GROUP BY substr(invoice_number,1,8)
ON CONFLICT(day) DO UPDATE SET last_sequence = MAX(last_sequence,excluded.last_sequence);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_date_number
ON orders(invoice_number)
WHERE length(invoice_number) >= 10 AND invoice_number NOT GLOB '*[^0-9]*';
