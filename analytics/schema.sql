-- D1 Database Schema for FPVGate Analytics

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  board TEXT,
  version TEXT,
  expert_mode INTEGER DEFAULT 0,
  error_message TEXT,
  user_agent TEXT,
  referrer TEXT,
  ip_hash TEXT,
  timestamp TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_board ON analytics_events(board);
CREATE INDEX IF NOT EXISTS idx_version ON analytics_events(version);
CREATE INDEX IF NOT EXISTS idx_ip_hash ON analytics_events(ip_hash);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_event_timestamp ON analytics_events(event_name, timestamp);
