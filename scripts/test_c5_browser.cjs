// Uses an external Playwright installation; the website has no build step.
// Set PLAYWRIGHT_MODULE, optionally CHROMIUM_PATH and TEST_BASE_URL.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8000';
const catalog = require('../firmware/c5/manifest.json');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/fpvgate-analytics.workers.dev/**', route => route.abort());
        await page.goto(base + '/flasher.html');
        await page.waitForFunction(() => !document.getElementById('version-select').textContent.includes('Loading'));
        assert.equal(await page.locator('#standard-flasher').isVisible(), true);
        assert.equal(await page.locator('#c5-board').count(), 0);
        await page.locator('#board-select').selectOption('seeedxiaos3');
        await page.locator('label.toggle-switch:has(#prerelease-mode)').click();
        assert.equal(await page.locator('#prerelease-mode').isChecked(), true);
        await page.locator('.nav-links a[href="c5.html"]').click();
        await page.waitForSelector('#c5-panel');
        assert.equal(await page.locator('#standard-flasher').count(), 0);
        assert.equal(await page.locator('#c5-firmware').isDisabled(), true);
        assert.equal(await page.locator('#c5-flash').isDisabled(), true);
        const selectBuild = async id => {
            const [firmware, board] = id.split('-');
            await page.locator('#c5-board').selectOption(board);
            await page.locator('#c5-firmware').selectOption(firmware);
        };
        for (const [id, build] of Object.entries(catalog.builds)) {
            const expectedPin = build.mode === 'spi'
                ? (build.board === 'xiao' ? 'D0 / GPIO1' : build.board === 'mini' ? 'GPIO1' : 'GPIO6')
                : (build.board === 'xiao' ? 'D4 / GPIO23 (RX)' : 'GPIO4 (RX)');
            await selectBuild(id);
            await page.waitForFunction(() => !document.getElementById('c5-flash').disabled);
            assert.match(await page.locator('#c5-release').innerText(), new RegExp(build.project));
            if (build.usb_timing) {
                assert.ok((await page.locator('#c5-release').innerText()).includes(`Release ${build.tag}`));
                assert.match(await page.locator('#c5-wiring').innerText(), /Direct USB to RotorHazard/);
                if (build.board === 'xiao') assert.match(await page.locator('#c5-wiring').innerText(), /XIAO USB validation is pending/);
            }
            assert.ok((await page.locator('#c5-wiring').innerText()).includes(expectedPin));
            assert.equal(await page.locator('#c5-wiring pre').count(), build.mode === 'spi' ? 1 : 0);
            console.log(`PASS standalone board, firmware and wiring: ${id}`);
        }
        assert.equal(await page.evaluate(async () => {
            const { ESPLoader, Transport } = await import('/vendor/c5/esptool-js-0.7.0.js');
            const { loadC5Firmware, calculateC5MD5 } = await import('/c5-flasher.js');
            await import('/vendor/c5/spark-md5-3.0.2.js');
            if (typeof ESPLoader !== 'function' || typeof Transport !== 'function') return false;
            if (calculateC5MD5(new Uint8Array([0, 97, 98, 99, 255]).subarray(1, 4)) !== '900150983cd24fb0d6963f7d28e17f72') return false;
            const manifest = await (await fetch('/firmware/c5/manifest.json')).json();
            for (const build of Object.values(manifest.builds)) await loadC5Firmware(build);
            return true;
        }), true);
        // Simulate an open port picker: never opens or flashes real hardware.
        await page.evaluate(() => {
            Object.defineProperty(navigator.serial, 'requestPort', { configurable: true, value: () => new Promise((resolve, reject) => {
                window.cancelC5Picker = () => reject(new DOMException('Cancelled', 'NotFoundError'));
            }) });
        });
        await page.locator('#c5-flash').click();
        for (const id of ['c5-board', 'c5-firmware', 'c5-erase', 'c5-flash']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
        await page.evaluate(() => window.cancelC5Picker());
        await page.waitForFunction(() => document.getElementById('c5-status').textContent.includes('cancelled'));
        for (const id of ['c5-board', 'c5-firmware', 'c5-erase', 'c5-flash']) assert.equal(await page.locator(`#${id}`).isDisabled(), false);
        assert.equal(await page.locator('#c5-error').isVisible(), false);
        await page.locator('#c5-board').selectOption('');
        assert.equal(await page.locator('#c5-firmware').isDisabled(), true);
        assert.equal(await page.locator('#c5-flash').isDisabled(), true);

        await page.goto(base + '/flasher.html#c5-radio');
        await page.waitForURL(base + '/c5.html#flasher');
        await page.waitForSelector('#c5-panel');
        await selectBuild('rx-xiao');
        await page.waitForSelector('#c5-wiring:not([hidden])');
        for (const theme of ['dark', 'light']) {
            await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
            await page.locator('#flasher').scrollIntoViewIfNeeded();
            await page.screenshot({ path: path.join(os.tmpdir(), `fpvgate-c5-${theme}.png`), animations: 'disabled' });
        }
        for (const width of [820, 390]) {
            await page.setViewportSize({ width, height: 844 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        await page.screenshot({ path: path.join(os.tmpdir(), 'fpvgate-c5-mobile.png'), animations: 'disabled' });
        await page.route('**/firmware/c5/manifest.json*', route => route.fulfill({ status: 503, body: 'Unavailable' }));
        await page.reload();
        await selectBuild('mk-zero');
        await page.waitForSelector('#c5-error:not([hidden])');
        assert.equal(await page.locator('#c5-flash').isDisabled(), true);
        await page.unroute('**/firmware/c5/manifest.json*');
        await selectBuild('mk-xiao');
        await page.waitForFunction(() => !document.getElementById('c5-flash').disabled);
        await page.locator('[data-nav-toggle]').click();
        await page.locator('.nav-links a[href="flasher.html"]').click();
        await page.waitForSelector('#standard-flasher');
        assert.equal(await page.locator('#c5-board').count(), 0);
        assert.deepEqual(errors, []);
        console.log('PASS timer entry, standalone operation, vendor imports, binary integrity, busy lock, cancellation, old URL redirect, catalog retry and desktop/mobile layouts');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
