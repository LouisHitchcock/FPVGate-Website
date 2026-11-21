const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');

test('distributor orders count wholesale sales and use packed weight for private documents and shipping', async t => {
    const { default: worker } = await import('../store/worker.js');
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    db.exec(fs.readFileSync('store/schema.sql', 'utf8'));
    db.exec('ALTER TABLE orders ADD COLUMN labels TEXT');
    db.exec('ALTER TABLE inventory ADD COLUMN unit_cost REAL');
    db.exec(fs.readFileSync('store/migration_inventory_products.sql', 'utf8'));
    db.exec(fs.readFileSync('store/migrations/0001_email_log.sql', 'utf8'));
    db.exec(fs.readFileSync('store/migrations/0011_date_order_numbers.sql', 'utf8'));
    db.exec(fs.readFileSync('store/migrations/0013_distributor_stock_orders.sql', 'utf8'));
    db.exec("INSERT INTO inventory (product_id, product_name, price, weight, stock_quantity, unit_cost) VALUES ('c5mk', 'C5MK AIO', 37.99, 100, 20, 14)");
    const documents = new Map();
    const env = {
        ADMIN_TOKEN: 'test',
        RESEND_API_KEY: 'test',
        DB: {
            prepare(sql) {
                const statement = db.prepare(sql);
                const bind = (...params) => ({
                    bind,
                    first: async () => statement.get(...params),
                    all: async () => ({ results: statement.all(...params) }),
                    run: async () => ({ meta: statement.run(...params) })
                });
                return bind();
            },
            batch: statements => Promise.all(statements.map(statement => statement.all()))
        },
        ORDER_DOCUMENTS: {
            async put(key, bytes, metadata) { documents.set(key, { key, body: bytes, ...metadata }); },
            async list({ prefix }) { return { objects: [...documents.values()].filter(object => object.key.startsWith(prefix)) }; },
            async get(key) { return documents.get(key); }
        }
    };
    const call = (path, method = 'GET', body, token = 'test') => worker.fetch(new Request('https://store.test' + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': typeof body === 'string' ? 'application/pdf' : 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    }), env);
    const details = {
        requestId: crypto.randomUUID(),
        customerName: 'Shipping contact',
        customerEmail: 'contact@example.test',
        shippingAddress: { company: 'Example Distributor', address1: 'Test address', city: 'Test city', province: 'CA', country: 'US', postalCode: '90001' },
        selectedProducts: [{ id: 'c5mk', quantity: 12, unitPricePence: 2500 }],
        shippingPence: 2000,
        parcelWeight: 1500
    };
    assert.equal((await call('/api/orders/distributor', 'POST', { ...details, parcelWeight: 0 })).status, 400);
    const created = await (await call('/api/orders/distributor', 'POST', details)).json();
    assert.equal(created.order.total, 320);
    assert.deepEqual(created.order.labels, ['wholesale']);
    const orderPath = '/api/orders/' + created.order.id;
    assert.equal((await (await call('/api/orders/distributor', 'POST', details)).json()).order.id, created.order.id);

    const analytics = await (await call('/api/analytics?days=all')).json();
    assert.equal(analytics.summary.total_orders, 1);
    assert.equal(analytics.summary.total_revenue, 320);
    assert.equal(analytics.products[0].units_sold, 12);
    assert.equal(analytics.countries[0].country, 'US');

    assert.equal((await call(orderPath + '/documents/invoice', 'POST', 'invalid PDF')).status, 400);
    for (const kind of ['agreement', 'invoice', 'invoice']) {
        const upload = await call(orderPath + '/documents/' + kind + '?name=order.pdf', 'POST', '%PDF-test');
        assert.equal(upload.status, 201);
    }
    const { documents: attached } = await (await call(orderPath + '/documents')).json();
    assert.equal(attached.length, 3);
    const documentPath = orderPath + '/documents/agreement/' + attached.find(file => file.kind === 'agreement').id;
    assert.equal((await call(documentPath, 'GET', undefined, 'wrong')).status, 401);
    const download = await call(documentPath);
    assert.equal(download.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(await download.text(), '%PDF-test');

    t.mock.method(globalThis, 'fetch', async (url, options) => {
        const body = JSON.parse(options.body);
        if (url === 'https://api.resend.com/emails') return Response.json({ id: 'tracking-email' });
        if (url.includes('/customs/declarations')) {
            assert.equal(body.items[0].quantity, 12);
            assert.equal(body.items[0].value_amount, '25');
            return Response.json({ object_id: 'customs' });
        }
        if (url.includes('/shipments')) {
            assert.equal(body.parcels[0].weight, 1800);
            assert.equal(body.address_to.company, 'Example Distributor');
            return Response.json({ object_id: 'shipment', rates: [{ object_id: 'rate' }] });
        }
        assert.match(url, /\/transactions/);
        assert.equal(body.rate, 'rate');
        assert.equal(body.label_file_type, 'PDF_4x6');
        return Response.json({ status: 'SUCCESS', object_id: 'transaction', tracking_number: 'TEST', label_url: 'https://shipping.test/label' });
    });
    const rates = await (await call(orderPath + '/rates', 'POST', { parcelWeight: 1800 })).json();
    assert.equal(rates.rates[0].objectId, 'rate');
    assert.equal((await call(orderPath + '/label', 'POST', { rateId: 'rate' })).status, 200);
    const order = await (await call(orderPath)).json();
    assert.equal(order.parcel_weight_g, 1800);
    assert.equal(order.tracking_number, 'TEST');
    assert.equal((await call(orderPath + '/cancel', 'POST')).status, 200);
    assert.equal(db.prepare('SELECT stock_quantity FROM inventory').get().stock_quantity, 20);
});
