-- Migration: Add store analytics columns to support per-item/category tracking

ALTER TABLE analytics_events ADD COLUMN product_id TEXT;
ALTER TABLE analytics_events ADD COLUMN product_name TEXT;
ALTER TABLE analytics_events ADD COLUMN category TEXT;
ALTER TABLE analytics_events ADD COLUMN price REAL;
ALTER TABLE analytics_events ADD COLUMN event_data TEXT;

-- Indexes for store analytics queries
CREATE INDEX IF NOT EXISTS idx_product_id ON analytics_events(product_id);
CREATE INDEX IF NOT EXISTS idx_category ON analytics_events(category);
CREATE INDEX IF NOT EXISTS idx_event_category ON analytics_events(event_name, category);
