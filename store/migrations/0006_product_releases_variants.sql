-- Existing products remain published. Apply before deploying the worker.
ALTER TABLE inventory ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE inventory ADD COLUMN release_at TEXT;
ALTER TABLE inventory ADD COLUMN variants TEXT NOT NULL DEFAULT '[]';
