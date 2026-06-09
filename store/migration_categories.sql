-- Migration: Add category and featured columns to inventory
-- Run: wrangler d1 execute fpvgate-store-db --file=./migration_categories.sql --remote

ALTER TABLE inventory ADD COLUMN category TEXT DEFAULT 'fpvgate';
ALTER TABLE inventory ADD COLUMN featured INTEGER DEFAULT 0;

-- Set existing AIO product as featured
UPDATE inventory SET featured = 1 WHERE product_id = 'fpvgate-aio-v3';
