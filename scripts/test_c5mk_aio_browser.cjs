// No hardware is opened. Set PLAYWRIGHT_MODULE, CHROMIUM_PATH and TEST_BASE_URL.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8025';

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/fpvgate-analytics.workers.dev/**', r => r.abort());
        await page.goto(base + '/flasher.html');
        await page.waitForFunction(() => !document.getElementById('version-select').textContent.includes('Loading'));
        await page.locator('#board-select').selectOption('fpvgatec5mkaio');
        assert.equal(await page.locator('#flash-section').isVisible(), false);
        await page.locator('label.toggle-switch:has(#prerelease-mode)').click();
        await page.locator('#version-select option[value="v1.9.0-alpha-5"]').waitFor({ state: 'attached' });
        await page.locator('#version-select').selectOption('v1.9.0-alpha-5');
        await page.waitForSelector('#flash-section', { state: 'visible' });
        assert.match(await page.locator('#selected-board').innerText(), /C5MK AIO/);
        const parts = await page.evaluate(() => generateManifest().builds[0].parts);
        assert.deepEqual(parts.map(p => p.offset), [0, 0x8000, 0x10000, 0x410000]);
        for (const p of parts) {
            const relative = new URL(p.path).pathname;
            assert.match(relative, /^\/preRelease\/v1\.9\.0-alpha-5\/FPVGateC5MKAIO\//);
            const response = await page.request.get(base + relative);
            assert.equal(response.status(), 200);
            const bytes = await response.body();
            assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
                crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', relative))).digest('hex'));
        }
        await page.locator('#version-select').selectOption('v1.9.0-Alpha-4');
        assert.equal(await page.locator('#flash-section').isVisible(), false);
        assert.match(await page.locator('#error-message').innerText(), /no build/);
        await page.evaluate(() => useFallbackBoards());
        await page.locator('#board-select').selectOption('fpvgatec5mkaio');
        await page.locator('#version-select').selectOption('v1.9.0-alpha-5');
        assert.equal(await page.locator('#flash-section').isVisible(), true);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
        console.log('PASS C5MK AIO standard/fallback selection, Alpha 5 images/hashes/offsets, unsupported-release block and mobile layout');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
