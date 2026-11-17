ALTER TABLE support_tickets ADD COLUMN linked_order_id INTEGER REFERENCES orders(id);
ALTER TABLE returns ADD COLUMN resolution TEXT NOT NULL DEFAULT 'refund';
ALTER TABLE returns ADD COLUMN replacement_tracking_number TEXT;
ALTER TABLE returns ADD COLUMN replacement_dispatched_at TEXT;
ALTER TABLE returns ADD COLUMN return_postage_note TEXT;
ALTER TABLE returns ADD COLUMN return_postage_cost REAL;
