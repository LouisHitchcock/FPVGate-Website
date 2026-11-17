ALTER TABLE support_tickets ADD COLUMN discord_notification_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE support_tickets ADD COLUMN discord_notified_at TEXT;
ALTER TABLE support_tickets ADD COLUMN discord_message_id TEXT;
