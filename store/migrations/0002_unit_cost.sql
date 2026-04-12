-- Add unit_cost column to inventory for gross profit calculations
ALTER TABLE inventory ADD COLUMN unit_cost REAL DEFAULT 0;
