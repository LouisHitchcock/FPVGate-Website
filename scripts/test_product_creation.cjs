const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const path = require('node:path');
const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'store/worker.js'), 'utf8');
const handler = worker.slice(worker.indexOf('async function handleAddInventoryProduct('), worker.indexOf('async function handleGetInventoryLog('));

async function createProduct(extra = {}) {
    const writes = [];
    const context = vm.createContext({ jsonResponse: (body, headers, status = 200) => ({ body, status }) });
    vm.runInContext(handler, context);
    const env = { DB: { prepare(sql) { return { bind(...values) { return { async run() { writes.push({ sql, values }); } }; } }; } } };
    const response = await context.handleAddInventoryProduct({ json: async () => ({ product_id: 'new-gate', product_name: 'New Gate', price: 20, ...extra }) }, env, {});
    return { response, writes };
}

test('new products persist pre-order settings at creation', async () => {
    const { response, writes } = await createProduct({ preorder_enabled: true, preorder_ship_date: '2027-01-15', preorder_limit: 25 });
    assert.equal(response.status, 200);
    assert.match(writes[0].sql, /preorder_enabled, preorder_ship_date, preorder_limit/);
    assert.deepEqual(writes[0].values.slice(-3), [1, '2027-01-15', 25]);
});

test('ordinary products default to pre-orders disabled', async () => {
    const { response, writes } = await createProduct();
    assert.equal(response.status, 200);
    assert.deepEqual(writes[0].values.slice(-3), [0, null, 0]);
});

test('invalid pre-orders are rejected before writing a product', async () => {
    for (const extra of [
        { preorder_enabled: true, preorder_limit: 5 },
        { preorder_enabled: true, preorder_ship_date: '2027-01-15' },
        { preorder_ship_date: 'tomorrow' },
        { preorder_limit: -1 },
    ]) {
        const { response, writes } = await createProduct(extra);
        assert.equal(response.status, 400);
        assert.equal(writes.length, 0);
    }
});

function editor() {
    const source = fs.readFileSync(path.join(root, 'admin/script.js'), 'utf8');
    const start = source.indexOf('let newProductImages =');
    const end = source.indexOf('let flasherCharts=', start);
    const elements = new Map();
    const el = id => {
        if (!elements.has(id)) elements.set(id, { value: '', checked: false, disabled: false, classList: { remove() {} } });
        return elements.get(id);
    };
    const creates = [], uploads = [];
    const context = vm.createContext({
        document: { getElementById: el, querySelectorAll: () => [...elements.values()], body: { classList: { remove() {} } } },
        exampleReadOnly: () => false,
        storeApi: async (url, method, body) => { creates.push(body); return { success: true }; },
        loadInventory() {}, URL: { revokeObjectURL() {} },
    });
    vm.runInContext(source.slice(start, end), context);
    vm.runInContext('sendProductImage = async (pid, file) => upload(pid, file)', context);
    context.upload = async (pid, file) => { uploads.push({ pid, file }); };
    for (const [key, value] of Object.entries({ id: 'new-gate', name: 'New Gate', price: '20', stock: '0', 'preorder-date': '2027-01-15', 'preorder-limit': '25' })) el('new-product-' + key).value = value;
    el('new-product-preorder').checked = true;
    return { context, el, creates, uploads };
}

test('creation sends pre-order settings and uploads selected images in order', async () => {
    const { context, creates, uploads } = editor();
    vm.runInContext("newProductImages = [{file:'first',url:'blob:1'},{file:'second',url:'blob:2'}]", context);
    await context.addProduct();
    assert.equal(creates.length, 1);
    assert.equal(creates[0].preorder_enabled, true);
    assert.equal(creates[0].preorder_ship_date, '2027-01-15');
    assert.equal(creates[0].preorder_limit, 25);
    assert.deepEqual(uploads.map(u => u.file), ['first', 'second']);
    assert.ok(uploads.every(u => u.pid === 'new-gate'));
    assert.equal(vm.runInContext('createdProductId', context), null);
});

test('partial upload failures retry remaining images without creating a duplicate', async () => {
    const { context, el, creates } = editor();
    const uploaded = [];
    let fail = true;
    context.upload = async (pid, file) => {
        if (file === 'second' && fail) throw new Error('Network unavailable');
        uploaded.push(file);
    };
    vm.runInContext("newProductImages = [{file:'first',url:'blob:1'},{file:'second',url:'blob:2'}]", context);
    await context.addProduct();
    assert.match(el('add-product-error').textContent, /Product created, but image upload failed/);
    assert.equal(el('new-product-id').disabled, true);
    assert.equal(el('add-product-submit').textContent, 'Retry Image Uploads');
    fail = false;
    await context.addProduct();
    assert.equal(creates.length, 1);
    assert.deepEqual(uploaded, ['first', 'second']);
    assert.equal(el('new-product-id').disabled, false);
});

test('missing shipping date prevents creation and retains selected images', async () => {
    const { context, el, creates } = editor();
    el('new-product-preorder-date').value = '';
    vm.runInContext("newProductImages = [{file:'first',url:'blob:1'}]", context);
    await context.addProduct();
    assert.equal(creates.length, 0);
    assert.match(el('add-product-error').textContent, /ship date/);
    assert.equal(vm.runInContext('newProductImages.length', context), 1);
});
