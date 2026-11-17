const SAFE_EVENTS = ['page_view','flash_started','flash_complete','flash_failed','board_selected','version_selected','c5_build_selected','c5_flash_started','c5_flash_complete','c5_flash_failed','c5_connection_cancelled','product_view','cart_add','cart_open','store_view','order_completed'];
export async function runAnalyticsRetention(db, now = new Date()) {
    const cutoff = new Date(now.getTime()-365*86400000).toISOString();
    // Only month, a fixed event enum and a count survive. No hashes, free text,
    // URLs, countries, board/version strings or per-person identifiers survive.
    const placeholders=SAFE_EVENTS.map(()=>'?').join(',');
    return db.batch([
        db.prepare(`INSERT INTO analytics_monthly_totals(month,event_name,event_count)
            SELECT strftime('%Y-%m',timestamp),CASE WHEN event_name IN (${placeholders}) THEN event_name ELSE 'other' END,COUNT(*)
            FROM analytics_events WHERE julianday(timestamp)<julianday(?) GROUP BY 1,2
            ON CONFLICT(month,event_name) DO UPDATE SET event_count=event_count+excluded.event_count`).bind(...SAFE_EVENTS,cutoff),
        db.prepare('DELETE FROM analytics_events WHERE julianday(timestamp)<julianday(?)').bind(cutoff)
    ]);
}
