import { flashC5 } from './c5-flasher.js?v=20261008b';

const byId = id => document.getElementById(id);
const toggle = byId('c5-mode');
const panel = byId('c5-panel');
const standard = byId('standard-flasher');
const board = byId('c5-board');
const button = byId('c5-flash');
const status = byId('c5-status');
let catalog;
let loading;
let busy = false;

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function standardBusy() {
    return byId('flash-progress').style.display === 'block' &&
        byId('connect-button').style.display === 'none' &&
        byId('post-flash-actions').style.display !== 'block' &&
        byId('error-section').style.display !== 'block';
}

function updateLock() { toggle.disabled = busy || standardBusy(); }
new MutationObserver(updateLock).observe(standard, { subtree: true, attributes: true, attributeFilter: ['style'] });

async function loadCatalog() {
    if (catalog) return catalog;
    if (!loading) loading = fetch('firmware/c5/alpha-20261008/manifest.json', { cache: 'no-cache' })
        .then(response => {
            if (!response.ok) throw new Error('C5 firmware could not be loaded. Check your connection and reselect your board to retry.');
            return response.json();
        }).then(data => { catalog = data; return data; }).finally(() => { loading = null; });
    return loading;
}

function showWiring(build) {
    const xiao = build.board === 'xiao';
    const spi = build.mode === 'spi';
    const radio = xiao ? 'XIAO ESP32-C5' : 'Waveshare ESP32-C5-Zero';
    const rows = spi ? [
        ['CLK', 'D3 / GPIO4', xiao ? 'D4 / GPIO23' : 'GPIO4'],
        ['DATA (bidirectional)', 'D4 / GPIO5', (xiao ? 'D5 / GPIO24' : 'GPIO5') + ' via 330 Ω'],
        ['SEL', 'D5 / GPIO6', xiao ? 'D0 / GPIO1' : 'GPIO6'],
        ['Analog RSSI', 'D2 / GPIO3', 'Filter junction below'],
    ] : [
        ['Host TX → radio RX', 'D3 / GPIO4 (TX)', xiao ? 'D4 / GPIO23 (RX)' : 'GPIO4 (RX)'],
        ['Host RX ← radio TX', 'D4 / GPIO5 (RX)', xiao ? 'D5 / GPIO24 (TX)' : 'GPIO5 (TX)'],
    ];
    rows.push(['Power', '5V / VUSB', '5V / VUSB'], ['Ground', 'GND', 'GND']);
    const source = `https://github.com/LouisHitchcock/${build.project}/blob/${build.commit}/docs/${spi ? 'HARDWARE.md' : 'INTEGRATION_GUIDE.md'}`;
    byId('c5-wiring').innerHTML = `
        <h3>${spi ? 'SPI' : 'UART'} Wiring · ${escape(radio)}</h3>
        <p>For an FPVGate timer built on a <strong>XIAO ESP32-S3</strong>. Disconnect power before wiring. Other timer boards use their configured receiver pins.</p>
        <div class="c5-table-wrap"><table><thead><tr><th>Signal</th><th>FPVGate · XIAO S3</th><th>${escape(radio)}</th></tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p><strong>3.3 V logic only.</strong> Supply the C5 through its 5V input so it uses its own regulator; the S3's 3V3 supply may not handle radio startup. Use one power source, or separate USB supplies with a shared ground and the 5V link disconnected. Never apply 5 V to a signal pin.</p>
        ${spi ? `<h4>Required RSSI filter</h4><p>Remove the RX5808. Do not connect C5 GPIO10 directly to the timer's RSSI input.</p><pre>C5 ${xiao ? 'D10 / ' : ''}GPIO10 ──[10 kΩ]──┬── S3 D2 / GPIO3 (RSSI)
                           ├──[10 kΩ]── GND
                           └──[100 nF]─ GND</pre><p>The two resistors divide the voltage; the capacitor smooths the output. Add 330 Ω in series with DATA and 100 nF decoupling across C5 3V3 and GND.</p>
        ${xiao ? '<p><strong>XIAO alpha pin map:</strong> this build uses CLK 23, DATA 24, SEL 1 and RSSI 10. These differ from the Waveshare defaults in the upstream guide. This XIAO SPI build still needs a hardware test.</p>' : ''}
        <h4>After flashing</h4><p>Attach a suitable 5.8 GHz antenna, power cycle, use the RX5808 receiver setting on your timer, then tune and calibrate RSSI. The C5 replaces the radio; your S3 remains the timer.</p>` : `<h4>After flashing</h4><p>Attach a suitable 5 GHz antenna and power cycle. Install FPVGate firmware with C5 multi-pilot support on your S3, then choose <strong>Settings → Configuration → Receiver Module → ESP32-C5</strong>. Configure pilot channels and calibrate each pilot.</p><p>UART is <strong>921600 baud, 8N1</strong>, with no flow control. No analog RSSI filter is needed. USB on the C5 is for flashing and its console.</p>`}
        <p><a href="${source}" target="_blank" rel="noopener">${spi ? 'Hardware guide' : 'Integration guide'} ↗</a> · <a href="https://github.com/LouisHitchcock/${build.project}/blob/${build.commit}/README.md" target="_blank" rel="noopener">Firmware documentation ↗</a></p>`;
    byId('c5-wiring').hidden = false;
}

async function selectBoard() {
    const selected = board.value;
    button.disabled = true;
    for (const id of ['c5-release', 'c5-wiring', 'c5-error', 'c5-complete', 'c5-progress', 'c5-log-panel']) byId(id).hidden = true;
    if (!selected) { status.textContent = 'Select your board to see firmware and wiring.'; return; }
    status.textContent = 'Loading C5 firmware…';
    try {
        const data = await loadCatalog();
        if (board.value !== selected) return;
        const build = data.builds[selected];
        if (!build) throw new Error('Firmware is not available for this board yet.');
        byId('c5-release').innerHTML = `<strong>${escape(build.project)} · ${escape(build.version)}</strong><small>${escape(build.mode.toUpperCase())} mode · ESP32-C5 · <a href="https://github.com/LouisHitchcock/${build.project}/commit/${build.commit}" target="_blank" rel="noopener">Source ${escape(build.commit.slice(0, 7))}</a></small><small>Pinned alpha build · ${escape(build.environment)}${selected === 'rx-xiao' ? ' · XIAO pin adaptation, hardware validation pending' : ''}</small>`;
        byId('c5-release').hidden = false;
        showWiring(build);
        const supported = 'serial' in navigator && window.isSecureContext;
        button.disabled = !supported;
        status.textContent = supported ? 'Ready. Put your C5 in BOOT mode, then connect and flash.' : 'Use Chrome or Edge on HTTPS or localhost for USB flashing.';
    } catch (error) {
        if (board.value !== selected) return;
        byId('c5-error').textContent = error.message;
        byId('c5-error').hidden = false;
        status.textContent = 'Firmware unavailable.';
    }
}

toggle.addEventListener('change', () => {
    if (busy || standardBusy()) { toggle.checked = !toggle.checked; return; }
    standard.hidden = toggle.checked;
    panel.hidden = !toggle.checked;
    byId('beta-mode').disabled = toggle.checked;
    byId('prerelease-mode').disabled = toggle.checked;
    if (toggle.checked) selectBoard();
});
board.addEventListener('change', selectBoard);

button.addEventListener('click', async () => {
    if (busy || !catalog?.builds[board.value]) return;
    const build = catalog.builds[board.value];
    busy = true;
    updateLock();
    button.disabled = board.disabled = byId('c5-erase').disabled = true;
    byId('c5-error').hidden = byId('c5-complete').hidden = true;
    byId('c5-log').textContent = '';
    byId('c5-progress').value = 0;
    byId('c5-progress').hidden = byId('c5-log-panel').hidden = false;
    const preventLeave = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLeave);
    try {
        // Must run directly in this user gesture, before downloads or imports.
        const port = await navigator.serial.requestPort();
        await flashC5({
            port, build, erase: byId('c5-erase').checked,
            onStatus: message => { status.textContent = message; },
            onProgress: percent => { byId('c5-progress').value = percent; },
            onLog: message => { const log = byId('c5-log'); log.textContent = (log.textContent + message + '\n').slice(-24000); log.scrollTop = log.scrollHeight; }
        });
        byId('c5-complete').hidden = false;
    } catch (error) {
        const cancelled = error.name === 'NotFoundError';
        status.textContent = cancelled ? 'Connection cancelled. Ready when you are.' : 'C5 flashing failed. You can retry.';
        if (!cancelled) {
            byId('c5-error').textContent = error.message;
            byId('c5-error').hidden = false;
        }
    } finally {
        window.removeEventListener('beforeunload', preventLeave);
        busy = false;
        button.disabled = board.disabled = byId('c5-erase').disabled = false;
        updateLock();
    }
});

if (location.hash === '#c5-radio') { toggle.checked = true; toggle.dispatchEvent(new Event('change')); }
