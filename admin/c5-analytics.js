// C5 charts have their own state so switching tabs never overwrites timer charts.
let c5DateRange = 7;
let c5Request = 0;
let c5WorldAtlasPromise;
const c5Charts = {};
const C5_COLORS = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#f56565', '#38b2ac', '#f687b3'];

function setC5DateFilter(days, button) {
    c5DateRange = days;
    document.querySelectorAll('#section-c5stats .filter-btn').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    return loadC5Stats();
}

async function loadC5Stats() {
    const request = ++c5Request;
    const loading = document.getElementById('c5-loading');
    const content = document.getElementById('c5-content');
    const error = document.getElementById('c5-error');
    loading.style.display = 'block';
    content.style.display = 'none';
    error.hidden = true;
    try {
        const data = await analyticsApi('/stats/c5?days=' + c5DateRange);
        if (request !== c5Request) return;
        if (data.error) throw new Error(data.error);
        if (!Array.isArray(data.recent_activity) || !data.success_rate) throw new Error('The C5 analytics response is incomplete.');
        content.style.display = 'block';
        renderC5Stats(data, request);
    } catch (failure) {
        if (request !== c5Request) return;
        content.style.display = 'none';
        document.getElementById('c5-error-message').textContent = 'Unable to load C5 analytics: ' + failure.message;
        error.hidden = false;
    } finally {
        if (request === c5Request) loading.style.display = 'none';
    }
}

function c5Table(id, rows, columns, emptyMessage) {
    const body = document.getElementById(id);
    body.replaceChildren();
    rows.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(column => {
            const td = document.createElement('td');
            td.textContent = column(row) ?? '-';
            tr.append(td);
        });
        body.append(tr);
    });
    if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = columns.length;
        td.textContent = emptyMessage;
        tr.append(td);
        body.append(tr);
    }
}

function c5Chart(key, canvasId, type, labels, datasets, extraOptions = {}) {
    c5Charts[key]?.destroy();
    c5Charts[key] = new Chart(document.getElementById(canvasId), {
        type,
        data: {labels, datasets},
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {legend: {display: type === 'doughnut' || datasets.length > 1, position: 'bottom'}},
            ...(type === 'doughnut' ? {} : {scales: {y: {beginAtZero: true, ticks: {precision: 0}}, x: {grid: {display: false}}}}),
            ...extraOptions
        }
    });
}

function renderC5Stats(data, request) {
    const counts = {
        'total-events': data.total_events, 'success-rate': data.success_rate.rate || '-',
        'unique-users': data.unique_users, started: data.flash_started,
        completed: data.success_rate.successes, failed: data.success_rate.failures
    };
    Object.entries(counts).forEach(([id, value]) => {
        document.getElementById('c5-' + id).textContent = typeof value === 'number' ? value.toLocaleString() : value;
    });
    const period = data.days === null ? 'All time' : 'Last ' + data.days + ' days';
    const updated = new Date(data.generated_at).toLocaleString();
    document.getElementById('c5-stats-summary').textContent = period + ' | Updated ' + updated + ' | Cancelled connections: ' + data.connection_cancelled + '. Unique users are an estimate based on IP hashes, not installed devices.';
    document.getElementById('c5-empty').hidden = data.total_events > 0;

    const series = data.recent_activity;
    c5Chart('activity', 'c5-activity-chart', 'line', series.map(row => row.date), [
        ['started', 'Flash starts', '#4299e1'], ['completed', 'Successful', '#48bb78'],
        ['failed', 'Failed', '#f56565'], ['cancelled', 'Cancelled', '#a0aec0']
    ].map(([key, label, color]) => ({label, data: series.map(row => row[key]), borderColor: color, backgroundColor: color, tension: 0.2, pointRadius: series.length > 90 ? 0 : 2, borderWidth: 2})));
    for (const [key, rows, field] of [['board', data.board_stats, 'board'], ['version', data.version_stats, 'version']]) {
        c5Chart(key, 'c5-' + key + '-chart', 'doughnut', rows.map(row => row[field]), [{data: rows.map(row => row.count), backgroundColor: C5_COLORS}]);
        document.getElementById('c5-' + key + '-empty').hidden = rows.length > 0;
    }
    const events = data.flash_events;
    const names = {c5_flash_started: 'Started', c5_flash_complete: 'Successful', c5_flash_failed: 'Failed', c5_connection_cancelled: 'Cancelled'};
    c5Chart('flash', 'c5-flash-chart', 'bar', events.map(row => names[row.event_name]), [{label: 'Events', data: events.map(row => row.count), backgroundColor: ['#4299e1', '#48bb78', '#f56565', '#a0aec0']}]);
    const recencyNames = {last_day: 'Last 24 hours', last_week: '1-7 days ago', last_month: '7-30 days ago', older: '30+ days ago'};
    c5Chart('recency', 'c5-recency-chart', 'bar', data.users_by_recency.map(row => recencyNames[row.recency]), [{label: 'Users', data: data.users_by_recency.map(row => row.count), backgroundColor: C5_COLORS}]);
    c5Table('c5-country-rows', data.country_stats, [row => c5CountryName(row.country), row => row.count], 'No country data for this period.');
    c5Table('c5-error-rows', data.common_errors, [row => row.error_message, row => row.board, row => row.version, row => row.count, row => new Date(row.last_occurred).toLocaleString()], 'No flash errors recorded for this period.');
    c5Table('c5-stats-rows', data.rows, [row => row.event_name.replace(/^c5_/, '').replaceAll('_', ' '), row => row.board, row => row.version, row => row.error_message, row => row.count], 'No C5 events recorded for this period.');
    renderC5Map(data.country_stats, request);
}

function c5CountryName(code) {
    try { return /^[A-Z]{2}$/.test(code) ? new Intl.DisplayNames(['en'], {type: 'region'}).of(code) : code; }
    catch { return code; }
}

async function renderC5Map(countries, request) {
    c5Charts.map?.destroy();
    delete c5Charts.map;
    const stage = document.getElementById('c5-map-stage');
    const message = text => { stage.replaceChildren(); const note = document.createElement('p'); note.className = 'c5-panel-note'; note.textContent = text; stage.append(note); };
    const known = countries.filter(row => /^[A-Z]{2}$/.test(row.country) && row.country !== 'XX');
    if (!known.length) { message('No geographic data for this period.'); return; }
    message('Loading map...');
    try {
        if (!c5WorldAtlasPromise) {
            c5WorldAtlasPromise = fetch('https://unpkg.com/world-atlas@2/countries-110m.json').then(response => {
                if (!response.ok) throw new Error('Map unavailable');
                return response.json();
            }).catch(error => { c5WorldAtlasPromise = null; throw error; });
        }
        const world = await c5WorldAtlasPromise;
        if (request !== c5Request) return;
        const features = ChartGeo.topojson.feature(world, world.objects.countries).features;
        const normalize = name => name.toLowerCase().replace(/[^a-z]/g, '');
        const byName = new Map(known.map(row => [normalize(c5CountryName(row.country)), row.count]));
        const aliases = {'United States of America': 'US', 'Dem. Rep. Congo': 'CD', 'Congo': 'CG', 'Czechia': 'CZ', 'S. Sudan': 'SS', 'Central African Rep.': 'CF', 'Dominican Rep.': 'DO', 'Eq. Guinea': 'GQ', 'Solomon Is.': 'SB', 'Bosnia and Herz.': 'BA'};
        const counts = new Map(known.map(row => [row.country, row.count]));
        const values = features.map(feature => ({feature, value: byName.get(normalize(feature.properties.name)) || counts.get(aliases[feature.properties.name]) || 0}));
        const maximum = Math.max(...known.map(row => row.count), 1);
        stage.replaceChildren();
        const canvas = document.createElement('canvas'); canvas.id = 'c5-world-map'; stage.append(canvas);
        c5Chart('map', canvas.id, 'choropleth', features.map(feature => feature.properties.name), [{label: 'Users', data: values, backgroundColor: ctx => {
            const value = ctx.raw?.value || 0;
            return value ? 'rgba(66,153,225,' + (0.2 + 0.8 * value / maximum) + ')' : '#e2e8f0';
        }, borderColor: '#cbd5e0', borderWidth: 0.5}], {
            showOutline: true, showGraticule: false,
            plugins: {legend: {display: false}, tooltip: {callbacks: {title: items => items[0]?.raw?.feature?.properties?.name || '', label: ctx => 'Users: ' + (ctx.raw?.value || 0)}}},
            scales: {projection: {axis: 'x', projection: 'equalEarth'}}
        });
    } catch {
        if (request === c5Request) message('Map unavailable. Country counts are shown in the table.');
    }
}
