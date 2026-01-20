-- Migration: Add country column to existing analytics_events table

ALTER TABLE analytics_events ADD COLUMN country TEXT;

-- Add index for country queries
CREATE INDEX IF NOT EXISTS idx_country ON analytics_events(country);
