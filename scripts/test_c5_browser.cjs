// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
// Start python -m http.server 8000 before running this file.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/fpvgate-analytics.workers.dev/**', route => route.abort());
    await page.goto('http://127.0.0.1:8000/flasher.html');
    await page.waitForSelector('#c5-mode', { state: 'attached' });
    // The timer populates boards asynchronously before it loads versions.
    // Select only after that initialization, so network timing cannot reset the test selection.
    await page.waitForFunction(() => !document.getElementById('version-select').textContent.includes('Loading'));
    const setToggle = async (id, checked) => {
        if (await page.locator(`#${id}`).isChecked() !== checked) await page.locator(`label.toggle-switch:has(#${id})`).click();
    };
    assert.equal(await page.locator('#standard-flasher').isVisible(), true);
    assert.equal(await page.locator('#c5-panel').isVisible(), false);
    await page.locator('#board-select').selectOption('seeedxiaos3');
    await setToggle('c5-mode', true);
    assert.equal(await page.locator('#standard-flasher').isVisible(), false);
    assert.equal(await page.locator('#prerelease-mode').isDisabled(), true);
    for (const [id, project, expectedPin] of [
        ['rx-xiao', 'FPVGateC5RX', 'D0 / GPIO1'],
        ['rx-zero', 'FPVGateC5RX', 'GPIO6'],
        ['mk-xiao', 'FPVGateC5MK', 'D4 / GPIO23 (RX)'],
        ['mk-zero', 'FPVGateC5MK', 'GPIO4 (RX)'],
    ]) {
        await page.locator('#c5-board').selectOption(id);
        await page.waitForFunction(() => !document.getElementById('c5-flash').disabled);
        assert.match(await page.locator('#c5-release').innerText(), new RegExp(project));
        assert.ok((await page.locator('#c5-wiring').innerText()).includes(expectedPin));
        assert.equal(await page.locator('#c5-wiring pre').count(), id.startsWith('rx') ? 1 : 0);
        console.log(`PASS browser selection and wiring: ${id}`);
    }
    const vendor = await page.evaluate(async () => {
        const esp = await import('/vendor/c5/esptool-js-0.7.0.js');
        await import('/vendor/c5/spark-md5-3.0.2.js');
        return [typeof esp.ESPLoader, typeof esp.Transport, window.SparkMD5.hashBinary('abc')];
    });
    assert.deepEqual(vendor, ['function', 'function', '900150983cd24fb0d6963f7d28e17f72']);
    assert.equal(await page.evaluate(async () => {
        const { loadC5Firmware } = await import('/c5-flasher.js');
        const manifest = await (await fetch('/firmware/c5/alpha-20261008/manifest.json')).json();
        for (const build of Object.values(manifest.builds)) await loadC5Firmware(build);
        return true;
    }), true);
    // Picker cancellation is simulated: never opens or flashes real hardware.
    await page.evaluate(() => {
        Object.defineProperty(navigator.serial, 'requestPort', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'NotFoundError'); } });
    });
    await page.locator('#c5-flash').click();
    await page.waitForFunction(() => document.getElementById('c5-status').textContent.includes('cancelled'));
    assert.equal(await page.locator('#c5-mode').isDisabled(), false);
    assert.equal(await page.locator('#c5-error').isVisible(), false);
    await setToggle('c5-mode', false);
    assert.equal(await page.locator('#board-select').inputValue(), 'seeedxiaos3');
    assert.equal(await page.locator('#prerelease-mode').isDisabled(), false);
    await setToggle('prerelease-mode', true);
    await setToggle('c5-mode', true);
    await setToggle('c5-mode', false);
    assert.equal(await page.locator('#prerelease-mode').isChecked(), true);
    // Observe the existing flasher's DOM without changing its implementation.
    await page.evaluate(() => {
        document.getElementById('flash-progress').style.display = 'block';
        document.getElementById('connect-button').style.display = 'none';
        document.getElementById('post-flash-actions').style.display = 'none';
        document.getElementById('error-section').style.display = 'none';
    });
    await page.waitForFunction(() => document.getElementById('c5-mode').disabled);
    await page.reload();
    await setToggle('c5-mode', true);
    await page.locator('#c5-board').selectOption('rx-xiao');
    await page.waitForSelector('#c5-wiring:not([hidden])');
    for (const theme of ['dark', 'light']) {
        await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
        await page.screenshot({ path: path.join(os.tmpdir(), `fpvgate-c5-${theme}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(os.tmpdir(), 'fpvgate-c5-mobile.png'), fullPage: true });
    // A failed catalog can be retried by reselecting a board.
    await page.route('**/firmware/c5/**/manifest.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.reload();
    await setToggle('c5-mode', true);
    await page.locator('#c5-board').selectOption('mk-zero');
    await page.waitForSelector('#c5-error:not([hidden])');
    assert.equal(await page.locator('#c5-flash').isDisabled(), true);
    await page.unroute('**/firmware/c5/**/manifest.json');
    await page.locator('#c5-board').selectOption('mk-xiao');
    await page.waitForFunction(() => !document.getElementById('c5-flash').disabled);
    await page.goto('http://127.0.0.1:8000/print-files.html');
    await page.waitForSelector('canvas');
    await page.screenshot({ path: path.join(os.tmpdir(), 'fpvgate-print-files.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS vendor imports, cancellation, timer state preservation, flash lock, catalog retry, dark/light/mobile layouts and 3D preview');
    console.log(`Screenshots: ${os.tmpdir()}/fpvgate-c5-*.png`);
    await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
