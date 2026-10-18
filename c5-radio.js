import { flashC5 } from './c5-flasher.js?v=20261008b';

const byId = id => document.getElementById(id);
const board = byId('c5-board');
const firmware = byId('c5-firmware');
const button = byId('c5-flash');
const status = byId('c5-status');
let catalog;
let loading;
let busy = false;

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

async function loadCatalog() {
    if (catalog) return catalog;
    if (!loading) loading = fetch('firmware/c5/manifest.json?v=c5mk-1.2.2-rc.4', { cache: 'no-cache' })
        .then(response => {
            if (!response.ok) throw new Error('C5 firmware could not be loaded. Check your connection and reselect your board to retry.');
            return response.json();
        }).then(data => { catalog = data; return data; }).finally(() => { loading = null; });
    return loading;
}

// Each board's C5 pins, as printed on it, and what still needs a hardware test.
// The DevKitC-1 layout and the Mini use the C5-Zero's images (same GPIOs), except
// the Mini's SPI build, which moves SEL to GPIO1: its headers have no GPIO6.
const BOARDS = {
    xiao: {
        name: 'XIAO ESP32-C5',
        spi: { clk: 'D4 / GPIO23', data: 'D5 / GPIO24', sel: 'D0 / GPIO1', rssi: 'D10 / GPIO10' },
        uart: { rx: 'D4 / GPIO23', tx: 'D5 / GPIO24' },
        spiNote: 'XIAO alpha pin map: this build uses CLK 23, DATA 24, SEL 1 and RSSI 10. These differ from the Waveshare defaults in the upstream guide. This XIAO SPI build still needs a hardware test.',
        spiPending: 'XIAO pin adaptation, hardware validation pending',
        uartPending: 'Physical XIAO USB validation is pending.',
    },
    zero: {
        name: 'Waveshare ESP32-C5-Zero',
        spi: { clk: 'GPIO4', data: 'GPIO5', sel: 'GPIO6', rssi: 'GPIO10' },
        uart: { rx: 'GPIO4', tx: 'GPIO5' },
    },
    devkit: {
        name: 'ESP32-C5-DevKitC-1 / Waveshare ESP32-C5-WIFI6-KIT',
        spi: { clk: 'GPIO4', data: 'GPIO5', sel: 'GPIO6', rssi: 'GPIO10' },
        uart: { rx: 'GPIO4', tx: 'GPIO5' },
        sharedNote: 'This board has the C5-Zero\'s GPIO4, 5, 6 and 10 on its headers, so it runs the Waveshare C5-Zero image unchanged; it reports itself as the C5-Zero. Use the USB port marked USB (native) or UART for flashing. Not yet tested on this board.',
        pending: 'C5-Zero image on the DevKitC-1 layout, hardware validation pending',
    },
    mini: {
        name: 'Waveshare ESP32-C5-MINI-KIT',
        spi: { clk: 'GPIO4', data: 'GPIO5', sel: 'GPIO1', rssi: 'GPIO10' },
        uart: { rx: 'GPIO4', tx: 'GPIO5' },
        spiNote: 'Mini pin map: this board has no GPIO6, so SEL is on GPIO1; CLK 4, DATA 5 and RSSI 10 are as on the C5-Zero. This build still needs a hardware test.',
        sharedNote: 'For multi pilot, this board runs the Waveshare C5-Zero image unchanged (the same GPIO4 and 5), and reports itself as the C5-Zero. Not yet tested on this board.',
        pending: 'hardware validation pending',
    },
};

function pendingNote(build) {
    const pins = BOARDS[build.board] || {};
    const note = (build.mode === 'spi' && pins.spiPending) || pins.pending;
    return note ? ` · ${escape(note)}` : '';
}

function showWiring(build) {
    const spi = build.mode === 'spi';
    const usb = build.usb_timing === true;
    const pins = BOARDS[build.board] || BOARDS.zero;
    const radio = pins.name;
    const rows = spi ? [
        ['CLK', 'D3 / GPIO4', pins.spi.clk],
        ['DATA (bidirectional)', 'D4 / GPIO5', pins.spi.data + ' via 330 Ω'],
        ['SEL', 'D5 / GPIO6', pins.spi.sel],
        ['Analog RSSI', 'D2 / GPIO3', 'Filter junction below'],
    ] : [
        ['Host TX → radio RX', 'D3 / GPIO4 (TX)', pins.uart.rx + ' (RX)'],
        ['Host RX ← radio TX', 'D4 / GPIO5 (RX)', pins.uart.tx + ' (TX)'],
    ];
    const boardNote = spi ? pins.spiNote : null;
    const sharedNote = pins.sharedNote && !(spi && build.board === 'mini') ? pins.sharedNote : null;
    rows.push(['Power', '5V / VUSB', '5V / VUSB'], ['Ground', 'GND', 'GND']);
    const source = `https://github.com/LouisHitchcock/${build.project}/blob/${build.commit}/docs/${spi ? 'HARDWARE.md' : 'INTEGRATION_GUIDE.md'}`;
    byId('c5-wiring').innerHTML = `
        <h3>${spi ? 'SPI Wiring' : usb ? 'USB / UART Setup' : 'UART Wiring'} · ${escape(radio)}</h3>
        ${usb ? `<h4>Direct USB to RotorHazard</h4><p>The same firmware supports eight native RH receivers over USB, with no S3 or FPVGate plugin required. Close RH and any serial monitors before flashing, then power cycle and connect the C5 directly to the RH computer.</p><p>Add its port under <strong>Advanced Settings → Hardware → Serial Ports</strong>, restart RH, select pilot channels and calibrate in Sensor Tuning. RH selects USB timing automatically; no separate USB image is needed. Do not let an S3 and USB RH control the same receiver simultaneously.</p><p><a href="https://github.com/LouisHitchcock/${build.project}/blob/${build.commit}/docs/USB_ROTORHAZARD.md" target="_blank" rel="noopener">USB setup guide ↗</a>${pins.uartPending ? ` · ${escape(pins.uartPending)}` : ''}</p><h4>Optional S3/UART connection</h4>` : ''}
        ${sharedNote ? `<p><strong>${escape(radio)}:</strong> ${escape(sharedNote)}</p>` : ''}
        <p>For an FPVGate timer built on a <strong>XIAO ESP32-S3</strong>. Disconnect power before wiring. Other timer boards use their configured receiver pins.</p>
        <div class="c5-table-wrap"><table><thead><tr><th>Signal</th><th>FPVGate · XIAO S3</th><th>${escape(radio)}</th></tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p><strong>3.3 V logic only.</strong> Supply the C5 through its 5V input so it uses its own regulator; the S3's 3V3 supply may not handle radio startup. Use one power source, or separate USB supplies with a shared ground and the 5V link disconnected. Never apply 5 V to a signal pin.</p>
        ${spi ? `<h4>Required RSSI filter</h4><p>Remove the RX5808. Do not connect C5 GPIO10 directly to the timer's RSSI input.</p><pre>C5 ${escape(pins.spi.rssi)} ──[10 kΩ]──┬── S3 D2 / GPIO3 (RSSI)
                           ├──[10 kΩ]── GND
                           └──[100 nF]─ GND</pre><p>The two resistors divide the voltage; the capacitor smooths the output. Add 330 Ω in series with DATA and 100 nF decoupling across C5 3V3 and GND.</p>
        ${boardNote ? `<p><strong>${escape(boardNote.split(':')[0])}:</strong>${escape(boardNote.slice(boardNote.indexOf(':') + 1))}</p>` : ''}
        <h4>After flashing</h4><p>Attach a suitable 5.8 GHz antenna, power cycle, use the RX5808 receiver setting on your timer, then tune and calibrate RSSI. The C5 replaces the radio; your S3 remains the timer.</p>` : `<h4>S3/UART setup</h4><p>Attach a suitable 5 GHz antenna and power cycle. Install FPVGate firmware with C5 multi-pilot support on your S3, then choose <strong>Settings → Configuration → Receiver Module → ESP32-C5</strong>. Configure pilot channels and calibrate each pilot.</p><p>Later C5 updates go through the gate, with no USB cable: FPVGate 1.9.0-Multi-Alpha-3 or later, <strong>Settings → System → C5 Receiver Firmware</strong>.</p><p>UART is <strong>921600 baud, 8N1</strong>, with no flow control. No analog RSSI filter is needed.${usb ? ' Direct USB timing uses the same firmware.' : ' USB on the C5 is for flashing and its console.'}</p>`}
        <p><a href="${source}" target="_blank" rel="noopener">${spi ? 'Hardware guide' : 'Integration guide'} ↗</a> · <a href="https://github.com/LouisHitchcock/${build.project}/blob/${build.commit}/README.md" target="_blank" rel="noopener">Firmware documentation ↗</a></p>`;
    byId('c5-wiring').hidden = false;
}

// The manifest key for the chosen board and firmware, e.g. 'mk-zero'; '' until both are chosen.
function selectedKey() {
    return board.value && firmware.value ? `${firmware.value}-${board.value}` : '';
}

async function selectBuild() {
    const selected = selectedKey();
    button.disabled = true;
    firmware.disabled = busy || !board.value;
    firmware.options[0].textContent = board.value ? 'Choose firmware...' : 'Choose a board first...';
    for (const id of ['c5-release', 'c5-wiring', 'c5-error', 'c5-complete', 'c5-progress', 'c5-log-panel']) byId(id).hidden = true;
    if (!board.value) { status.textContent = 'Select your board, then the firmware, to see wiring.'; return; }
    if (!firmware.value) { status.textContent = 'Now select the firmware: single pilot (SPI) or multi pilot (UART / USB).'; return; }
    status.textContent = 'Loading C5 firmware…';
    try {
        const data = await loadCatalog();
        if (selectedKey() !== selected) return;
        const build = data.builds[selected];
        if (!build) throw new Error('Firmware is not available for this board yet.');
        byId('c5-release').innerHTML = `<strong>${escape(build.project)} · ${escape(build.version)}</strong><small>${build.usb_timing ? 'UART / USB' : escape(build.mode.toUpperCase())} mode · ESP32-C5 · <a href="https://github.com/LouisHitchcock/${build.project}/commit/${build.commit}" target="_blank" rel="noopener">Source ${escape(build.commit.slice(0, 7))}</a></small><small>${build.tag ? `Release <a href="https://github.com/LouisHitchcock/${build.project}/releases/tag/${escape(build.tag)}" target="_blank" rel="noopener">${escape(build.tag)}</a>` : 'Pinned alpha build'} · ${escape(build.environment)}${pendingNote(build)}</small>`;
        byId('c5-release').hidden = false;
        showWiring(build);
        const supported = 'serial' in navigator && window.isSecureContext;
        button.disabled = !supported;
        status.textContent = supported ? 'Ready. Put your C5 in BOOT mode, then connect and flash.' : 'Use Chrome or Edge on HTTPS or localhost for USB flashing.';
    } catch (error) {
        if (selectedKey() !== selected) return;
        byId('c5-error').textContent = error.message;
        byId('c5-error').hidden = false;
        status.textContent = 'Firmware unavailable.';
    }
}

board.addEventListener('change', selectBuild);
firmware.addEventListener('change', selectBuild);

button.addEventListener('click', async () => {
    if (busy || !catalog?.builds[selectedKey()]) return;
    const build = catalog.builds[selectedKey()];
    busy = true;
    button.disabled = board.disabled = firmware.disabled = byId('c5-erase').disabled = true;
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
        button.disabled = board.disabled = firmware.disabled = byId('c5-erase').disabled = false;
    }
});

// Restore a valid selection when the browser restores form values on navigation.
selectBuild();
