const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const boards = {
    esp32s3: 'ESP32S3',
    fpvgateaio: 'FPVGateAIO',
    fpvgatesolo: 'FPVGateSolo',
    seeedxiaos3: 'SeeedXIAOESP32S3',
    xiaos3plus: 'XIAOS3Plus'
};

function flasherContext() {
    const elements = new Map();
    const context = vm.createContext({
        URL, console: { log() {}, error() {} }, navigator: { serial: {} },
        window: { location: { href: 'https://fpvgate.xyz/flasher.html' } },
        document: {
            addEventListener() {},
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, { style: {}, textContent: '' });
                return elements.get(id);
            }
        }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'flasher.js'), 'utf8'), context);
    return context;
}

test('v1.8.3 manifests point to all 20 images with matching partition offsets', () => {
    const context = flasherContext();
    for (const [id, directory] of Object.entries(boards)) {
        vm.runInContext(`selectedBoard = '${id}'; selectedVersion = { tag_name: 'v1.8.3' };`, context);
        assert.equal(vm.runInContext('updateFlashInfo()', context), true);
        const manifest = vm.runInContext('generateManifest()', context);
        const parts = manifest.builds[0].parts;
        assert.deepEqual(Array.from(parts, p => p.offset), [0, 0x8000, 0x10000, id === 'xiaos3plus' ? 0x610000 : 0x410000]);
        for (const part of parts) {
            const url = new URL(part.path);
            assert.equal(url.origin, 'https://fpvgate.xyz');
            assert.equal(path.posix.dirname(url.pathname), `/firmware/v1.8.3/${directory}`);
            assert.ok(fs.statSync(path.join(root, url.pathname)).size > 0);
        }
        const partitionData = fs.readFileSync(path.join(root, 'firmware/v1.8.3', directory, 'partitions.bin'));
        let filesystem;
        for (let offset = 0; offset + 32 <= partitionData.length && partitionData.readUInt16LE(offset) === 0x50aa; offset += 32) {
            if (partitionData[offset + 2] === 1 && partitionData[offset + 3] === 0x82) {
                filesystem = { offset: partitionData.readUInt32LE(offset + 4), size: partitionData.readUInt32LE(offset + 8) };
            }
        }
        assert.ok(filesystem);
        assert.equal(parts[3].offset, filesystem.offset);
        assert.equal(fs.statSync(path.join(root, 'firmware/v1.8.3', directory, 'littlefs.bin')).size, filesystem.size);
        const firmware = fs.readFileSync(path.join(root, 'firmware/v1.8.3', directory, 'firmware.bin'));
        assert.ok(firmware.includes(Buffer.from('1.8.3\0')));
    }
});

test('unsupported v1.8.3 boards cannot start flashing', () => {
    const context = flasherContext();
    for (const id of ['esp32s3supermini', 'lilygo', 'esp32c3', 'wavesharelcd2', 'novablade']) {
        vm.runInContext(`selectedBoard = '${id}'; selectedVersion = { tag_name: 'v1.8.3' }; updateFlashSection();`, context);
        assert.equal(context.document.getElementById('flash-section').style.display, 'none');
        assert.match(context.document.getElementById('error-message').textContent, /has no build/);
    }
});

test('Multi Alpha index and manifests expose only the five packaged boards', () => {
    const tag = 'v1.9.0-Multi-Alpha-1';
    const index = JSON.parse(fs.readFileSync(path.join(root, 'preRelease/index.json'), 'utf8'));
    assert.equal(index.versions[0].tag, tag);
    const context = flasherContext();
    for (const [id, directory] of Object.entries(boards)) {
        vm.runInContext(`selectedBoard = '${id}'; selectedVersion = { tag_name: '${tag}', isLocalPreRelease: true };`, context);
        assert.equal(vm.runInContext('updateFlashInfo()', context), true);
        const parts = vm.runInContext('generateManifest().builds[0].parts', context);
        assert.deepEqual(Array.from(parts, p => p.offset), [0, 0x8000, 0x10000, id === 'xiaos3plus' ? 0x610000 : 0x410000]);
        for (const part of parts) {
            const url = new URL(part.path);
            assert.equal(path.posix.dirname(url.pathname), `/preRelease/${tag}/${directory}`);
            assert.ok(fs.statSync(path.join(root, url.pathname)).size > 0);
        }
        const firmware = fs.readFileSync(path.join(root, 'preRelease', tag, directory, 'firmware.bin'));
        assert.ok(firmware.includes(Buffer.from('1.9.0\0')));
        assert.ok(firmware.includes(Buffer.from('Multi-Alpha-1\0')));
    }
    for (const id of ['esp32s3supermini', 'lilygo', 'esp32c3', 'wavesharelcd2', 'novablade']) {
        vm.runInContext(`selectedBoard = '${id}'; selectedVersion = { tag_name: '${tag}', isLocalPreRelease: true }; updateFlashSection();`, context);
        assert.equal(context.document.getElementById('flash-section').style.display, 'none');
    }
});

test('Multi Alpha SD setup reuses the stable SD archive', () => {
    const context = vm.createContext({
        window: { location: { origin: 'https://fpvgate.xyz' } },
        document: { addEventListener() {} }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'sdcard-flasher.js'), 'utf8'), context);
    assert.equal(vm.runInContext("getSDCardUrl('v1.9.0-Multi-Alpha-1')", context), 'https://fpvgate.xyz/firmware/v1.8.3/SD_Card.zip');
    assert.equal(vm.runInContext("getSDCardUrl('v1.8.3')", context), 'https://fpvgate.xyz/firmware/v1.8.3/SD_Card.zip');
    assert.equal(vm.runInContext("getSDCardUrl('v1.7.2')", context), 'https://fpvgate.xyz/firmware/v1.7.2/SD_Card.zip');
});

test('older firmware and pre-release manifests keep their existing paths', () => {
    const context = flasherContext();
    for (const [tag, prerelease, suffix] of [
        ['v1.7.2', false, 'firmware/v1.7.2/FPVGate-AIO-V3/FPVGate_AIO_V3_filesystem.bin'],
        ['v1.7.3', false, 'firmware/v1.7.3/FPVGateAIO/littlefs.bin'],
        ['v1.8.0-rc-3', true, 'preRelease/v1.8.0-rc-3/FPVGateAIO/littlefs.bin']
    ]) {
        vm.runInContext(`selectedBoard = 'fpvgateaio'; selectedVersion = { tag_name: '${tag}', isLocalPreRelease: ${prerelease} };`, context);
        assert.equal(vm.runInContext('generateManifest().builds[0].parts[3].path', context), `https://fpvgate.xyz/${suffix}`);
        assert.ok(fs.existsSync(path.join(root, suffix)));
    }
});

test('SD ZIP and refreshed flasher script references are present', () => {
    const zip = fs.readFileSync(path.join(root, 'firmware/v1.8.3/SD_Card.zip'));
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.ok(zip.includes(Buffer.from('voice_default_en')));
    assert.match(fs.readFileSync(path.join(root, 'flasher.html'), 'utf8'), /flasher\.js\?v=1\.9\.0-Multi-Alpha-1/);
    assert.match(fs.readFileSync(path.join(root, 'flasher.js'), 'utf8'), /import\('\.\/esp-flasher\.js\?v=1\.8\.3-reset1'\)/);
});

for (const mode of ['existing bootloader', 'previously authorised USB replacement', 'first-time USB replacement']) {
    test(`shared flasher connects through ${mode}`, async () => {
        const bootloader = { getInfo: () => ({ usbVendorId: 0x303a }), async close() {} };
        const networkPort = { getInfo: () => ({ usbVendorId: 0x2886 }), async close() {} };
        let picks = 0;
        let notices = 0;
        let nowCalls = 0;
        const context = vm.createContext({
            console: { log() {} }, setTimeout,
            Date: mode === 'first-time USB replacement' ? { now: () => nowCalls++ === 0 ? 0 : 9000 } : Date,
            navigator: { serial: {
                async requestPort(options) {
                    picks++;
                    if (picks === 1) return mode === 'existing bootloader' ? bootloader : networkPort;
                    assert.equal(options.filters[0].usbVendorId, 0x303a);
                    return bootloader;
                },
                async getPorts() { return [bootloader]; }
            } },
            Transport: class {
                constructor(port) { this.port = port; }
                async disconnect() {}
            },
            ESPLoader: class {
                constructor(options) { this.transport = options.transport; }
                async main() {
                    if (this.transport.port === networkPort) throw new Error('USB device disconnected');
                    return 'ESP32-S3';
                }
            }
        });
        const source = fs.readFileSync(path.join(root, 'esp-flasher.js'), 'utf8')
            .replace(/^import .*;\r?\n/m, '').replace('export class CustomESPFlasher', 'class CustomESPFlasher');
        vm.runInContext(source, context);
        const flasher = vm.runInContext('new CustomESPFlasher()', context);
        flasher.setHandlers({ onNeedsPort: () => notices++ });
        assert.equal(await flasher.connect(), 'ESP32-S3');
        assert.equal(flasher.port, bootloader);
        assert.equal(picks, mode === 'first-time USB replacement' ? 2 : 1);
        assert.equal(notices, mode === 'first-time USB replacement' ? 1 : 0);
    });
}

function resetTestFlasher() {
    const context = vm.createContext({
        console: { log() {} }, Uint8Array,
        fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
    });
    const source = fs.readFileSync(path.join(root, 'esp-flasher.js'), 'utf8')
        .replace(/^import .*;\r?\n/m, '').replace('export class CustomESPFlasher', 'class CustomESPFlasher');
    vm.runInContext(source, context);
    return vm.runInContext('new CustomESPFlasher()', context);
}

test('successful writes followed by a USB reset error still complete', async () => {
    const flasher = resetTestFlasher();
    const logs = [];
    let completed = 0;
    let failed = 0;
    let progress;
    flasher.setHandlers({
        onComplete: () => completed++, onError: () => failed++, onLog: message => logs.push(message),
        onProgress: (percent, status) => { progress = { percent, status }; }
    });
    flasher.esploader = {
        async writeFlash() {},
        async hardReset() { throw new Error('Failed to set signals: 0x80004005'); }
    };
    await flasher.flash({ builds: [{ parts: [{ path: 'firmware.bin', offset: 0x10000 }] }] });
    assert.equal(completed, 1);
    assert.equal(failed, 0);
    assert.equal(progress.percent, 100);
    assert.match(progress.status, /unplug and reconnect/);
    assert.ok(logs.some(message => message.includes('All files were written')));
});

test('write errors still fail without resetting or reporting completion', async () => {
    const flasher = resetTestFlasher();
    let completed = 0;
    let failed = 0;
    let resets = 0;
    flasher.setHandlers({ onComplete: () => completed++, onError: () => failed++ });
    flasher.esploader = {
        async writeFlash() { throw new Error('Write failed'); },
        async hardReset() { resets++; }
    };
    await assert.rejects(flasher.flash({ builds: [{ parts: [{ path: 'firmware.bin', offset: 0x10000 }] }] }), /Write failed/);
    assert.equal(completed, 0);
    assert.equal(failed, 1);
    assert.equal(resets, 0);
});

test('cleanup closes the port even when disconnecting a vanished USB device fails', async () => {
    const flasher = resetTestFlasher();
    let closes = 0;
    flasher.transport = { async disconnect() { throw new Error('Device gone'); } };
    flasher.port = { async close() { closes++; } };
    flasher.esploader = {};
    await flasher.disconnect();
    assert.equal(closes, 1);
    assert.equal(flasher.port, null);
    assert.equal(flasher.transport, null);
    assert.equal(flasher.esploader, null);
});
