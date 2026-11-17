// Public order references use the UK calendar day, not the database row ID.
export function orderNumberDay(date = new Date()) {
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid order date');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric'
    }).formatToParts(date).map(part=>[part.type,part.value]));
    return parts.day + parts.month + parts.year;
}

export async function allocateOrderNumber(db, sourceKey, date = new Date()) {
    if (typeof sourceKey !== 'string' || !sourceKey || sourceKey.length > 200) throw new Error('Invalid order source');
    const day = orderNumberDay(date);
    // D1 batches run transactionally: concurrent orders get different suffixes,
    // while retries of the same Stripe session retain their original reference.
    const results = await db.batch([
        db.prepare('INSERT INTO order_number_counters (day,last_sequence) VALUES (?,0) ON CONFLICT(day) DO NOTHING').bind(day),
        db.prepare('UPDATE order_number_counters SET last_sequence = last_sequence + 1 WHERE day = ? AND NOT EXISTS (SELECT 1 FROM order_number_assignments WHERE source_key = ?)').bind(day,sourceKey),
        db.prepare("INSERT INTO order_number_assignments (source_key,day,sequence,order_number) SELECT ?,day,last_sequence,day || printf('%02d',last_sequence) FROM order_number_counters WHERE day = ? ON CONFLICT(source_key) DO NOTHING").bind(sourceKey,day),
        db.prepare('SELECT order_number FROM order_number_assignments WHERE source_key = ?').bind(sourceKey)
    ]);
    const number = results[3]?.results?.[0]?.order_number;
    if (!number) throw new Error('Could not allocate an order number');
    return number;
}
