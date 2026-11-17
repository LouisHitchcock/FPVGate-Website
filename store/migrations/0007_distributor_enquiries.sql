-- Abuse-control counters only; no applicant details are stored here.
CREATE TABLE IF NOT EXISTS distributor_request_limits (
    ip_hash TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1
);
