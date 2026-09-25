-- Pre-order support for inventory products.
-- Run: wrangler d1 execute fpvgate-store-db --file=./migrations/0005_preorders.sql --remote
--
-- While preorder_enabled is on, a product keeps selling after its stock reaches
-- zero, up to preorder_limit extra units. Those units are recorded by letting
-- stock_quantity go negative, so -stock_quantity is the number of pre-ordered
-- units still owed to customers. preorder_ship_date (YYYY-MM-DD) is the date
-- shown to shoppers as the earliest dispatch date.

ALTER TABLE inventory ADD COLUMN preorder_enabled INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN preorder_ship_date TEXT;
ALTER TABLE inventory ADD COLUMN preorder_limit INTEGER DEFAULT 0;
