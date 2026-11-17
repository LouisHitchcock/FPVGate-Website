CREATE TABLE IF NOT EXISTS analytics_monthly_totals (
    month TEXT NOT NULL,
    event_name TEXT NOT NULL,
    event_count INTEGER NOT NULL,
    PRIMARY KEY(month,event_name)
);
