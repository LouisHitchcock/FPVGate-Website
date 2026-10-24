const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../store-shared.js'), 'utf8');
const modalCode = source.slice(source.indexOf('// --- Product Modal ---'), source.indexOf('// --- Utility ---'));
const product = { id: 'gate + receiver/1', name: 'Test Gate', price: 20, stock: 0, images: [], category: 'misc' };

function store(href = 'https://fpvgate.xyz/shop.html', products = [product]) {
    const elements = new Map();
    const makeElement = () => ({
        textContent: '', innerHTML: '', style: {}, children: [],
        classList: { active: false, add() { this.active = true; }, remove() { this.active = false; } },
        setAttribute() {}, addEventListener(type, fn) { this[type] = fn; },
        appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); },
        remove() { elements.delete(this.id); },
    });
    for (const id of ['product-modal', 'modal-image', 'modal-name', 'modal-price', 'modal-stock', 'modal-actions', 'modal-description']) elements.set(id, makeElement());
    const events = {}, pushes = [], copied = [], prompts = [];
    const window = {
        location: { href }, _products: products,
        history: { pushState(state, title, url) { window.location.href = url; pushes.push(url); } },
        addEventListener(type, fn) { events[type] = fn; },
        prompt(...args) { prompts.push(args); },
    };
    const hero = makeElement();
    const context = vm.createContext({
        window, URL, STORE_API: 'https://store.example',
        document: { getElementById: id => elements.get(id), createElement: makeElement, querySelector: () => hero, addEventListener() {}, body: { style: {} } },
        navigator: { clipboard: { async writeText(text) { copied.push(text); } } },
        fetch: async () => ({ ok: true, json: async () => products }),
        setTimeout() {}, addRecentlyViewed() {}, renderRecentlyViewed() {},
        availableQty: p => p.stock, buyButtonLabel: () => 'Out of Stock', renderStockNotice: () => '', escHtml: s => s,
    });
    vm.runInContext(modalCode, context);
    return { context, window, events, elements, pushes, copied, prompts };
}

test('share URLs encode IDs and omit the current category, query and fragment', () => {
    const { context } = store('https://fpvgate.xyz/shop-misc.html?campaign=test#grid');
    const url = new URL(context.productShareUrl(product.id));
    assert.equal(url.pathname, '/shop.html');
    assert.equal(url.searchParams.get('id'), product.id);
    assert.equal(url.searchParams.size, 1);
    assert.equal(url.hash, '');
});

test('opening a sold-out product updates the URL and still offers sharing', () => {
    const { context, window, elements, pushes } = store('https://fpvgate.xyz/shop-misc.html?campaign=test');
    context.openProductModal(0);
    assert.equal(new URL(window.location.href).searchParams.get('id'), product.id);
    assert.equal(new URL(window.location.href).searchParams.get('campaign'), 'test');
    assert.match(elements.get('modal-actions').innerHTML, /Copy link/);
    assert.match(elements.get('modal-actions').innerHTML, /disabled/);
    assert.equal(elements.get('product-modal').classList.active, true);
    context.openProductModal(0);
    assert.equal(pushes.length, 1);
    context.closeProductModal();
    assert.equal(new URL(window.location.href).searchParams.has('id'), false);
    assert.equal(elements.get('product-modal').classList.active, false);
});

test('direct links load the selected product without adding a history entry', async () => {
    const { context, elements, pushes } = store('https://fpvgate.xyz/shop.html?id=' + encodeURIComponent(product.id));
    await context.openProductFromUrl();
    assert.equal(elements.get('modal-name').textContent, product.name);
    assert.equal(elements.get('product-modal').classList.active, true);
    assert.equal(pushes.length, 0);
});

test('Back and Forward restore the product view from the URL', async () => {
    const { context, window, events, elements } = store();
    context.openProductModal(0);
    const productUrl = window.location.href;
    window.location.href = 'https://fpvgate.xyz/shop.html';
    await events.popstate();
    assert.equal(elements.get('product-modal').classList.active, false);
    window.location.href = productUrl;
    await events.popstate();
    assert.equal(elements.get('product-modal').classList.active, true);
});

test('navigation while a product is loading does not reopen a stale popup', async () => {
    const { context, window, events, elements } = store('https://fpvgate.xyz/shop.html?id=' + encodeURIComponent(product.id));
    let finish;
    context.fetch = () => new Promise(resolve => { finish = resolve; });
    const loading = context.openProductFromUrl();
    window.location.href = 'https://fpvgate.xyz/shop.html';
    await events.popstate();
    finish({ ok: true, json: async () => [product] });
    await loading;
    assert.equal(elements.get('product-modal').classList.active, false);
});

test('unavailable products show a useful message', async () => {
    const { context, elements } = store('https://fpvgate.xyz/shop.html?id=removed-product');
    await context.openProductFromUrl();
    assert.match(elements.get('product-link-message').textContent, /unavailable/);
    assert.equal(elements.get('product-modal').classList.active, false);
});

test('failed loads can be retried', async () => {
    const { context, elements } = store('https://fpvgate.xyz/shop.html?id=' + encodeURIComponent(product.id));
    context.fetch = async () => ({ ok: false });
    await context.openProductFromUrl();
    const retry = elements.get('product-link-message').children[0];
    assert.equal(retry.textContent, 'Try again');
    context.fetch = async () => ({ ok: true, json: async () => [product] });
    await retry.click();
    assert.equal(elements.get('product-modal').classList.active, true);
    assert.equal(elements.has('product-link-message'), false);
});

test('Copy link uses the canonical product URL and falls back when clipboard access fails', async () => {
    const { context, copied, prompts } = store('https://fpvgate.xyz/shop-misc.html?campaign=test');
    context.openProductModal(0);
    const button = {};
    await context.copyProductLink(button);
    assert.equal(copied[0], context.productShareUrl(product.id));
    assert.equal(button.textContent, 'Link copied!');
    context.navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
    await context.copyProductLink(button);
    assert.equal(prompts[0][1], copied[0]);
});
