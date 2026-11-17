// Routine service data expires 365 days after collection. Financial order records
// are excluded from this cleanup because separate legal obligations may apply.
export async function runStoreRetention(db, now = new Date()) {
    const cutoff = new Date(now.getTime()-365*86400000).toISOString();
    return db.batch([
        db.prepare(`INSERT INTO support_monthly_totals(month,type,ticket_count)
            SELECT strftime('%Y-%m',created_at),type,COUNT(*) FROM support_tickets WHERE julianday(created_at)<julianday(?) GROUP BY 1,2
            ON CONFLICT(month,type) DO UPDATE SET ticket_count=ticket_count+excluded.ticket_count`).bind(cutoff),
        db.prepare('DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE julianday(created_at)<julianday(?)) OR julianday(created_at)<julianday(?)').bind(cutoff,cutoff),
        db.prepare('DELETE FROM support_tickets WHERE julianday(created_at)<julianday(?)').bind(cutoff),
        db.prepare(`INSERT INTO email_monthly_totals(month,status,message_count)
            SELECT strftime('%Y-%m',created_at),CASE WHEN status IN ('sent','failed','skipped') THEN status ELSE 'other' END,COUNT(*) FROM email_log WHERE julianday(created_at)<julianday(?) GROUP BY 1,2
            ON CONFLICT(month,status) DO UPDATE SET message_count=message_count+excluded.message_count`).bind(cutoff),
        db.prepare('DELETE FROM email_log WHERE julianday(created_at)<julianday(?)').bind(cutoff),
        db.prepare('DELETE FROM order_comments WHERE julianday(created_at)<julianday(?)').bind(cutoff),
        db.prepare('DELETE FROM tracking_events WHERE julianday(created_at)<julianday(?)').bind(cutoff),
        db.prepare('DELETE FROM distributor_request_limits WHERE window_start < ?').bind(Math.floor(now.getTime()/1000)-86400)
    ]);
}
