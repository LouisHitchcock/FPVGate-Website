-- Migration: Add product detail columns to inventory
-- Run: wrangler d1 execute fpvgate-store-db --file=./migration_inventory_products.sql --remote

ALTER TABLE inventory ADD COLUMN price REAL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN description TEXT;
ALTER TABLE inventory ADD COLUMN image_url TEXT;
ALTER TABLE inventory ADD COLUMN weight INTEGER DEFAULT 100;
ALTER TABLE inventory ADD COLUMN max_quantity INTEGER DEFAULT 5;
ALTER TABLE inventory ADD COLUMN active INTEGER DEFAULT 1;

-- Update existing product with details
UPDATE inventory SET
    price = 29.99,
    description = 'All-in-one FPVGate lap timer board based on the Seeed XIAO ESP32S3. Includes integrated RX5808 module, SD card slot, RGB LED header, and buzzer output. Just add power and fly.',
    weight = 100,
    max_quantity = 5,
    active = 1
WHERE product_id = 'fpvgate-aio-v3';
