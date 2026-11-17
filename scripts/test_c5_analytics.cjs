const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {DatabaseSync} = require('node:sqlite');
const source = fs.readFileSync('analytics/worker.js', 'utf8');
const now = new Date('2026-11-16T12:00:00Z');

function setup() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync('analytics/schema.sql', 'utf8'));db.exec(fs.readFileSync('analytics/migration_retention.sql','utf8'));
    const context = vm.createContext({Date, Map, Request, Response, URL});
    vm.runInContext(source.replace(/^import[^;]+;/gm,'').replace('export default {', 'const worker = {'), context);
    const binding = {prepare(sql) { const statement = db.prepare(sql); return {all: async () => ({results: statement.all()}), bind(...values) {return {all: async () => ({results: statement.all(...values)})}}}}};
    const add = (event, date, user = 'one', extra = {}) => db.prepare('INSERT INTO analytics_events(event_name,timestamp,ip_hash,country,board,version,error_message) VALUES(?,?,?,?,?,?,?)').run(event, date, user, extra.country ?? 'GB', extra.board ?? 'xiao', extra.version ?? '1.3', extra.error ?? null);
    return {db, context, add, stats: days => context.getC5Stats(binding, days, now), call: async query => vm.runInContext('worker', context).fetch(new Request('https://analytics.test/stats/c5' + query), {DB: binding})};
}

test('C5-only totals, distinct users, flash-start popularity and success rate exclude selections/cancellations', async () => {
    const s = setup();
    for (const event of ['c5_flash_started', 'c5_flash_complete', 'c5_flash_failed', 'c5_connection_cancelled', 'c5_build_selected', 'flash_complete', 'store_view']) s.add(event, '2026-11-15T10:00:00Z');
    s.add('c5_build_selected', '2026-11-15T10:00:00Z', 'two', {board: 'zero'});
    s.add('c5_flash_complete', '2026-11-15T10:00:00Z', null);
    const d = await s.stats(7);
    assert.equal(d.total_events, 7); assert.equal(d.unique_users, 2);
    assert.equal(d.flash_started, 1); assert.equal(d.connection_cancelled, 1);
    assert.equal(d.success_rate.rate, '66.67%');
    assert.equal(d.board_stats.length, 1); assert.equal(d.board_stats[0].board, 'xiao'); assert.equal(d.board_stats[0].count, 1);
    assert.equal(d.country_stats[0].count, 2);
    assert.equal(d.common_errors[0].error_message, 'Unknown error');
});

test('all panels use the same exact UTC cutoff, reject future events and fill quiet dates', async () => {
    const s = setup();
    s.add('c5_flash_started', '2026-11-09T11:59:59Z', 'old');
    s.add('c5_flash_started', '2026-11-09T12:00:00Z', 'boundary');
    s.add('c5_flash_complete', '2026-11-16T11:00:00Z', 'recent');
    s.add('c5_flash_complete', '2026-11-17T11:00:00Z', 'future');
    const d = await s.stats(7);
    assert.equal(d.total_events, 2); assert.equal(d.unique_users, 2);
    assert.equal(d.recent_activity.length, 8); assert.equal(d.recent_activity[1].count, 0);
    assert.equal(d.users_by_recency.find(r => r.recency === 'last_day').count, 1);
    assert.equal(d.users_by_recency.find(r => r.recency === 'last_week').count, 1);
    assert.equal((await s.stats(null)).total_events, 3);
});

test('empty data has zeros and no invented success rate; unknown country and missing users are handled', async () => {
    const s = setup(); let d = await s.stats(7);
    assert.equal(d.success_rate.rate, null); assert.equal(d.total_events, 0); assert.equal(d.unique_users, 0);
    assert.equal(d.recent_activity.length, 8); assert.equal((await s.stats(null)).recent_activity.length, 0);
    s.add('c5_flash_failed', '2026-11-15T12:00:00Z', '', {country: ''});
    s.add('c5_flash_failed', '2026-11-15T12:00:00Z', 'one', {country: ''});
    d = await s.stats(7); assert.equal(d.unique_users, 1); assert.equal(d.country_stats[0].country, 'Unknown'); assert.equal(d.common_errors[0].count, 2);
});

test('endpoint preserves event rows, supports all time and rejects invalid ranges', async () => {
    const s = setup(); s.add('c5_flash_complete', '2000-01-01T00:00:00Z');
    const all = await s.call('?days=all'); assert.equal(all.status, 200); assert.equal(all.headers.get('Cache-Control'), 'no-store');
    const data = await all.json(); assert.equal(data.rows.length, 1); assert.equal(data.days, null);
    for (const query of ['?days=-1', '?days=0', '?days=7.5', '?days=wat', '?days=3651']) assert.equal((await s.call(query)).status, 400);
});
