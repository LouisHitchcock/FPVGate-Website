CREATE TABLE IF NOT EXISTS support_monthly_totals (
    month TEXT NOT NULL,
    type TEXT NOT NULL,
    ticket_count INTEGER NOT NULL,
    PRIMARY KEY(month,type)
);
CREATE TABLE IF NOT EXISTS email_monthly_totals (
    month TEXT NOT NULL,
    status TEXT NOT NULL,
    message_count INTEGER NOT NULL,
    PRIMARY KEY(month,status)
);
